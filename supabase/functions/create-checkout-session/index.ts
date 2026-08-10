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

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const PLAN_PRICES: Record<string, string | undefined> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  yearly: Deno.env.get('STRIPE_PRICE_YEARLY'),
}

/**
 * Subscription states that mean "this person is already being billed".
 *
 * The same three the client grants Pro for (`entitlement-store.ts`), and for
 * the same reason: `past_due` is a grace window on a subscription that still
 * exists, not an invitation to sell a second one.
 */
const BILLABLE_STATUSES = new Set(['active', 'trialing', 'past_due'])

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
    const { plan } = await req.json().catch(() => ({ plan: 'monthly' }))
    const priceId = PLAN_PRICES[plan]
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
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    } else {
      // Refuse a second subscription for someone who already pays.
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
      const live = existing.data.find(s => BILLABLE_STATUSES.has(s.status))
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
    })

    return json({ url: session.url })
  } catch (e) {
    console.error('create-checkout-session failed', e)
    return json({ error: 'Internal error' }, 500)
  }
})
