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

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

/**
 * Which Stripe world this deployment belongs to, read off the key it already
 * uses rather than configured separately — one fewer value to set, and one that
 * cannot drift out of step with the key doing the actual work.
 *
 * `rk_` as well as `sk_`: a restricted key is a perfectly normal thing to run a
 * webhook on, and matching only `sk_live_` would read one as test mode and drop
 * every live event on the floor. Silently — the guard below answers 2xx, so
 * Stripe would report every delivery as a success while no entitlement was ever
 * written. A safety check that can turn off the payment path is worse than none.
 */
const EXPECT_LIVEMODE = /^(sk|rk)_live_/.test(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

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
  const { data, error } = userId
    ? await query.eq('id', userId)
    : await query.eq('stripe_customer_id', sub.customer as string)

  if (error) throw new Error(`entitlement update failed: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error(
      `entitlement update matched no profile (user=${userId ?? 'n/a'}, customer=${sub.customer})`,
    )
  }
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
  if (event.livemode !== EXPECT_LIVEMODE) {
    console.warn(
      `ignoring ${event.type} (${event.id}): livemode=${event.livemode}, this deployment expects ${EXPECT_LIVEMODE}`,
    )
    return new Response('Wrong Stripe mode for this deployment', { status: 202 })
  }

  // Idempotency: first insert wins; a retry hits the unique key and is a no-op.
  //
  // The ledger row is claimed here but only *committed* after the handler
  // succeeds — see the delete in the catch below. Writing it up front and
  // leaving it there turned Stripe's at-least-once delivery into at-most-once:
  // a handler that threw returned 500, Stripe retried, the retry hit the unique
  // key, answered "Already processed" 200, and the event was lost for good.
  const { error: insertErr } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type })
  if (insertErr) {
    // 23505 = unique_violation → already processed. Anything else is a real error.
    if (insertErr.code === '23505') return new Response('Already processed', { status: 200 })
    console.error('ledger insert failed', insertErr)
    return new Response('Ledger error', { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          await syncSubscriptionById(session.subscription as string)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscriptionById((event.data.object as Stripe.Subscription).id)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.subscription) {
          const { error } = await admin
            .from('profiles')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_customer_id', invoice.customer as string)
          // A failed downgrade leaves someone on Pro who has stopped paying.
          // Throwing hands it to the catch above, which releases the ledger
          // claim so Stripe retries.
          if (error) throw new Error(`past_due downgrade failed: ${error.message}`)
        }
        break
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break
    }
  } catch (e) {
    // Release the idempotency claim so Stripe's retry can actually do the work.
    // If this cleanup itself fails the event is stuck, so it is logged loudly —
    // that is the one case a human has to look at.
    const { error: releaseErr } = await admin
      .from('stripe_events')
      .delete()
      .eq('id', event.id)
    if (releaseErr) {
      console.error(
        `STUCK EVENT ${event.id} (${event.type}): handler failed AND the ledger claim ` +
        `could not be released. Stripe's retry will be swallowed as a duplicate. ` +
        `Delete this row by hand and replay the event.`,
        releaseErr,
      )
    }
    console.error(`handler for ${event.type} failed`, e)
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
