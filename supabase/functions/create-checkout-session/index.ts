// ADR-002: create a Stripe Checkout Session for the signed-in user.
//
// Auth: the caller's Supabase JWT, verified INSIDE this function by `getUser`.
// It is deployed with `--no-verify-jwt` on purpose: the platform gate rejects
// the browser's CORS preflight, which carries no Authorization header, and the
// user sees "Failed to send a request to the Edge Function". Turning the gate
// off does not weaken anything — an unauthenticated caller gets a 401 below.
//
// The plan is chosen from a server-side allowlist — the client never sends a
// price id or an amount.
//
// Secrets (supabase secrets set): STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY,
// STRIPE_PRICE_YEARLY, APP_URL. Platform-provided: SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import Stripe from 'https://esm.sh/stripe@18?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'
import { APP_URL, corsHeaders } from '../_shared/cors.ts'
import { requireWrite } from '../_shared/db.ts'
import { firstBillable, newestCustomer } from '../_shared/customer.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const PLAN_PRICES: Record<string, string | undefined> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  yearly: Deno.env.get('STRIPE_PRICE_YEARLY'),
}

/**
 * Whether Stripe works out the tax itself, from the customer's billing address.
 *
 * VAT here is owed for customers in Switzerland and for nobody else. A fixed
 * tax rate cannot express that: the Checkout Session is created *before* the
 * customer types an address, so at that moment there is no way to know which
 * country they are in. Attaching a Swiss rate would apply it to everyone, and
 * a German customer's invoice would claim Swiss VAT.
 *
 * Stripe Tax decides at payment time from the address actually entered: Swiss
 * address → 8.1% split out of the price and shown; anywhere the operator has no
 * registration → no tax line at all. That is the rule, enforced by the party
 * that can see the address.
 *
 * Behind a flag because it depends on dashboard state this deploy cannot check:
 * Stripe Tax must be active, the Swiss registration entered, and both prices set
 * to `tax_behavior: inclusive`. Enabling it before any of that is true makes
 * Stripe reject every session — i.e. no one can buy anything. Off by default,
 * switched on once the dashboard is ready.
 */
const AUTOMATIC_TAX = /^(1|true|on|yes)$/i.test(Deno.env.get('STRIPE_AUTOMATIC_TAX')?.trim() ?? '')

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    // Identify the caller from their JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    // Choose the price from the allowlist — never trust a client-sent price.
    //
    // An unreadable body used to fall back to the monthly plan. Nobody was
    // charged unseen — Stripe states the amount before payment — but a purchase
    // path should not have a default: a garbled request is a bug somewhere, and
    // answering it with a sale hides the bug behind a plausible outcome. It now
    // takes the same 400 an unknown plan does.
    const body = await req.json().catch(() => null)
    const plan = (body as { plan?: string } | null)?.plan
    const priceId = plan ? PLAN_PRICES[plan] : undefined
    if (!priceId) return json({ error: 'Unknown plan' }, 400)

    // Reuse the user's Stripe customer if we have one; otherwise create it and
    // persist it (service_role, so the entitlement trigger allows the write).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    let customerId = profile?.stripe_customer_id as string | undefined

    // No stored customer does NOT mean no customer.
    //
    // It used to be treated that way, and that was the hole: the
    // already-subscribed check lived in the `else` below, so a missing id
    // skipped it entirely, a second Stripe customer was created, and the same
    // person was sold a second subscription against the same card.
    //
    // The id goes missing for two reasons. One was a write that was never
    // checked (fixed above, and now fatal). The other survives: an account
    // deleted and signed up again gets a fresh profile row whose entitlement
    // columns the trigger correctly nulls, while Stripe still holds the old
    // customer — and its live subscription.
    //
    // So ask Stripe. Every customer under this email is checked for a live
    // subscription before anything is sold, and one of them is adopted rather
    // than adding another to the pile. Email is a weak identity in Stripe — it
    // can be changed, two people can share one — but it is the only link that
    // survives a Supabase user being replaced, and the cost of matching too
    // eagerly (reusing a customer) is far below the cost of not matching
    // (billing someone twice).
    //
    // Only when nothing is stored: for an ordinary returning subscriber this
    // adds no API calls at all.
    if (!customerId && user.email) {
      const byEmail = await stripe.customers.list({ email: user.email, limit: 100 })

      for (const candidate of byEmail.data) {
        const subs = await stripe.subscriptions.list({
          customer: candidate.id,
          status: 'all',
          limit: 100,
        })
        const live = firstBillable(subs.data)
        if (live) {
          // Adopt before refusing. Refusing alone would leave them billed, with
          // no entitlement and no route to the customer portal — which needs
          // exactly this id. Adopting restores the portal, so "you already have
          // a subscription" comes with a way to act on it.
          const claimed = await admin
            .from('profiles')
            .update({ stripe_customer_id: candidate.id })
            .eq('id', user.id)
            .select('id')
          requireWrite(claimed, `adopting stripe customer ${candidate.id} for user ${user.id}`)

          console.warn(
            `adopted existing customer ${candidate.id} for user ${user.id} and refused a second subscription`,
          )
          return json({ alreadySubscribed: true, subscriptionId: live.id })
        }
      }

      // None of them is being billed. Adopt the newest anyway rather than
      // creating yet another — it carries this person's payment history, and
      // one customer per human is the state worth converging on.
      const adopt = newestCustomer(byEmail.data)
      if (adopt) {
        const claimed = await admin
          .from('profiles')
          .update({ stripe_customer_id: adopt.id })
          .eq('id', user.id)
          .select('id')
        requireWrite(claimed, `adopting stripe customer ${adopt.id} for user ${user.id}`)
        customerId = adopt.id
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id

      // Checked, and fatal if it did not land.
      //
      // This write was previously fire-and-forget, and `supabase-js` neither
      // throws nor reports a write that matched nothing — so a lost one was
      // completely silent and checkout carried on to take the money. The
      // customer still got what they paid for, because the webhook resolves
      // them through the subscription metadata rather than this column. What
      // they lost was the way back: the customer portal needs this id, so they
      // ended up **paying with no way to cancel**. It also disarmed two other
      // guards — a second "Go Pro" would create a second Stripe customer and
      // sell a second subscription, and `invoice.payment_failed` would match no
      // row and never downgrade them.
      //
      // So: fail here, before a Checkout Session exists and before anyone is
      // charged. The customer sees an error and retries. Refusing a sale is
      // cheap; an uncancellable subscription is not.
      //
      // The Stripe customer created a moment ago is left orphaned. That is the
      // right trade — an unused customer object costs nothing, and the retry
      // either finds it or makes another.
      const saved = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
        .select('id')
      requireWrite(saved, `recording stripe customer ${customerId} for user ${user.id}`)
    } else {
      // Refuse a second subscription for someone who already pays.
      //
      // Runs for an adopted customer too, which repeats a check the adoption
      // loop just made. Deliberate: one extra API call on a rare path, and the
      // subscription list is exactly the kind of state that can change between
      // two calls. On a money path the cheap redundant read wins.
      //
      // Nothing stopped this before. A subscriber who came back to the public
      // landing page and clicked the price bought again: two subscriptions on
      // one customer, two charges, and — because the webhook writes both into
      // the same profile row — an app that looked completely normal. The
      // customer would find out on their card statement, which is the worst
      // possible way to find out.
      //
      // The check belongs here rather than in the browser. The landing page is
      // public, the client's entitlement can be stale or absent, and a client
      // is not something to trust with "may this person be charged".
      //
      // Asked of Stripe, not of our own `profiles` row, because Stripe is the
      // system that will actually bill the card. A row that drifted out of sync
      // is precisely the case this needs to survive.
      //
      // `incomplete` is deliberately NOT blocking: an abandoned checkout leaves
      // one behind for about a day, and treating that as "already subscribed"
      // would lock someone out of retrying a payment they never completed.
      const existing = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      })
      const live = firstBillable(existing.data)
      if (live) {
        // 200 rather than 409: this is an outcome the UI has to act on, and
        // supabase-js turns a non-2xx into an opaque error whose body has to be
        // dug out of a Response. A result the caller can read is worth more
        // here than the tidier status code.
        return json({ alreadySubscribed: true, subscriptionId: live.id })
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // The user id is also carried by the customer metadata; keep it here too
      // so the webhook can resolve the user without a customer lookup.
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      success_url: `${APP_URL}/app?checkout=success`,
      cancel_url: `${APP_URL}/app?checkout=cancelled`,
      allow_promotion_codes: true,
      ...(AUTOMATIC_TAX
        ? {
            automatic_tax: { enabled: true },
            // Stripe needs an address to decide the country, and it needs to be
            // asked for rather than guessed: an IP is wrong for anyone abroad
            // or on a VPN, and getting the country wrong here means charging or
            // not charging VAT wrongly.
            billing_address_collection: 'required' as const,
            // Required by Stripe whenever automatic tax runs against an
            // existing customer: the address the customer types has to be
            // written back, or the next invoice has nothing to work from and
            // renewals would be taxed differently from the first payment.
            customer_update: { address: 'auto' as const },
          }
        : {}),
    })

    return json({ url: session.url })
  } catch (e) {
    console.error('create-checkout-session failed', e)
    return json({ error: 'Internal error' }, 500)
  }
})
