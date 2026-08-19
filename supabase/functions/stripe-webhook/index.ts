// ADR-002: Stripe webhook — the ONLY writer of entitlement state.
//
// Deploy with `--no-verify-jwt`: Stripe does not send a Supabase JWT, so this
// function's authentication IS the Stripe signature. Never trust the body until
// constructEventAsync verifies it (the sync constructEvent needs Node crypto,
// which Deno lacks). Stripe retries deliveries, so every event is deduped
// through the stripe_events ledger before it touches money/entitlements.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Platform: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.
//
// Test-mode events are rejected: the deployment's world is inferred from
// STRIPE_SECRET_KEY, and anything from the other one is answered 202 and
// dropped. See the guard in the handler for why that is not redundant with the
// signature check.

import Stripe from 'https://esm.sh/stripe@18?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'
import { requireWrite } from '../_shared/db.ts'
import { acceptsEvent } from '../_shared/stripe-mode.ts'
import { dispatchEvent, type WebhookDeps, type WebhookEvent } from '../_shared/webhook-dispatch.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/**
 * The paid-period end, in seconds. Newer Stripe API versions (basil/dahlia)
 * moved this from the subscription onto each subscription item; older ones keep
 * it on the subscription. Read whichever is present so the endpoint's API
 * version can't leave us with a null period.
 */
function resolvePeriodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined
  const epoch = (sub as { current_period_end?: number }).current_period_end
    ?? item?.current_period_end
  return epoch ? new Date(epoch * 1000).toISOString() : null
}

/**
 * Fetch the subscription fresh from Stripe and write the entitlement columns
 * from it. Fetching — rather than trusting the event payload's status — makes
 * the write authoritative regardless of Stripe's delivery ordering: Stripe can
 * deliver `customer.subscription.created` (status `incomplete`) AFTER
 * `customer.subscription.updated` (status `active`), and the stale payload would
 * otherwise clobber the live status back to `incomplete`.
 */
async function syncSubscriptionById(subId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subId)
  const userId = sub.metadata?.supabase_user_id
  const priceId = sub.items.data[0]?.price.id ?? null
  const periodEnd = resolvePeriodEnd(sub)

  const patch = {
    subscription_status: sub.status, // active | trialing | past_due | canceled | …
    subscription_price_id: priceId,
    current_period_end: periodEnd,
    // A cancellation scheduled for the end of the paid period does NOT change
    // `status` — Stripe keeps it `active`, because the customer paid for the
    // period and still has it. Without this flag the profile row after a
    // cancellation is identical to the row before it, and the account page goes
    // on promising a renewal that will never happen.
    cancel_at_period_end: sub.cancel_at_period_end === true,
  }

  // Prefer the user id carried in metadata; fall back to matching the customer.
  //
  // `.select()` + a row-count check is load-bearing, not defensive noise:
  // supabase-js does NOT throw on failure, it returns `{ data, error }`. Without
  // this, a failed write — or a correct write that matched zero rows because the
  // customer id was never stored — returned normally and the caller answered
  // Stripe with 200. The customer had paid, the entitlement was never granted,
  // and nothing anywhere recorded that it went wrong.
  const query = admin.from('profiles').update(patch).select('id')
  const outcome = userId
    ? await query.eq('id', userId)
    : await query.eq('stripe_customer_id', sub.customer as string)

  requireWrite(outcome, `entitlement update (user=${userId ?? 'n/a'}, customer=${sub.customer})`)
}

/** Downgrade a customer whose invoice failed. */
async function markPastDue(customerId: string): Promise<void> {
  // `.select()` and `requireWrite`, not a bare error check.
  //
  // This is the one event whose entire job is to take access away from someone
  // who has stopped paying, and it matches on the customer id — which is null
  // on any profile whose id write was lost. Checking only `error` treated
  // "changed nothing" as success: the handler answered Stripe 200 and the
  // account kept Pro indefinitely.
  //
  // Throwing hands it to the dispatcher, which releases the ledger claim so
  // Stripe's retry can do the work.
  //
  // Deliberate trade, not an oversight: for a customer with no profile at all
  // — a deleted account — no retry can ever succeed, so Stripe will keep
  // redelivering until it gives up and the endpoint shows failed deliveries.
  // That is the intended alarm; the alternative is answering 200 to a downgrade
  // that did not happen. Worth revisiting only if the volume ever grows enough
  // to risk Stripe disabling the endpoint, which would take the whole payment
  // path down and would be far worse than one stale row.
  const outcome = await admin
    .from('profiles')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId)
    .select('id')
  requireWrite(outcome, `past_due downgrade (customer=${customerId})`)
}

/**
 * Everything `dispatchEvent` needs, bound to the real Stripe and database.
 *
 * The routing and the ledger's claim-then-release live in
 * `_shared/webhook-dispatch.ts` and are covered by tests; what stays here is
 * only the wiring to the outside world.
 */
const deps: WebhookDeps = {
  async claim(event) {
    const { error } = await admin.from('stripe_events').insert({ id: event.id, type: event.type })
    if (!error) return 'claimed'
    // 23505 = unique_violation → already processed. Anything else is real.
    if (error.code === '23505') return 'duplicate'
    console.error('ledger insert failed', error)
    return 'error'
  },
  async release(eventId) {
    const { error } = await admin.from('stripe_events').delete().eq('id', eventId)
    if (error) console.error('ledger release failed', error)
    return !error
  },
  syncSubscription: syncSubscriptionById,
  markPastDue,
  warn: (m) => console.warn(m),
  error: (m, cause) => console.error(m, cause),
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await req.text() // raw body — required for signature verification
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (e) {
    console.error('signature verification failed', e)
    return new Response('Invalid signature', { status: 400 })
  }

  // A verified signature proves the event is Stripe's. It does not prove it is
  // *this* world's, and the two are different questions.
  //
  // This database still carries entitlement rows written on 13 July 2026, a
  // month before the live cutover: sandbox events that verified against the
  // test secret held at the time and then granted production Pro exactly as a
  // real payment would. A test card was a valid way in.
  //
  // Today the modes cannot mix, because the function holds one secret and it is
  // the live one — but that is an accident of which value happens to be set,
  // and it goes away the moment anyone points a test endpoint here or swaps the
  // secret to debug something. Stripe stamps the mode on every event; reading
  // it turns the accident into a rule.
  //
  // Answered 202, not an error: the delivery is genuinely received and
  // deliberately ignored. A 4xx or 5xx would put Stripe into its retry schedule
  // for an event we will never accept.
  if (!acceptsEvent(event.livemode, STRIPE_KEY)) {
    console.warn(
      `ignoring ${event.type} (${event.id}): livemode=${event.livemode} is not this deployment's mode`,
    )
    return new Response('Wrong Stripe mode for this deployment', { status: 202 })
  }

  // Cast because Stripe types `data.object` as a union of every resource it has.
  // The dispatcher reads two string fields off it and is deliberately not
  // coupled to the SDK's types — that is what lets it be tested without Stripe.
  const answer = await dispatchEvent(event as unknown as WebhookEvent, deps)
  return new Response(answer.body, { status: answer.status })
})
