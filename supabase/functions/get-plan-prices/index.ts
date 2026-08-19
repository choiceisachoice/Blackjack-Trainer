// What the paywall is allowed to say a plan costs.
//
// The amounts used to live in `src/services/pro-features.ts` as literals, next
// to a comment asking whoever changed a price in Stripe to change them here as
// well. That is not a mechanism, and it did not hold: on 10 August 2026 the
// prices were re-cut for Swiss VAT, and for a while the page advertised
// CHF 8.90 while the configured price still charged 7.90.
//
// So the page stops claiming a number and asks for one. The price ids stay
// server-side — the client never names a price, here or at checkout — and this
// function resolves them to the amounts Stripe will actually bill.
//
// Deploy with `--no-verify-jwt`, like the other browser-facing functions. Not
// because this one is unauthenticated — it deliberately is, prices are public
// — but because the platform's JWT gate also rejects the CORS *preflight*, and
// an OPTIONS request carries no Authorization header. With the gate on, the
// preflight 401s and the browser never sends the real call: "Failed to send a
// request to the Edge Function", with nothing wrong inside the function.
//
// The price ids and the secret key stay here regardless. Only the amounts leave.
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY.

import Stripe from 'https://esm.sh/stripe@18?target=deno'
import { corsHeaders } from '../_shared/cors.ts'
import { toPlanPrice, type PlanPrice } from '../_shared/plan-price.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

/** Same allowlist as create-checkout-session, and deliberately the same shape. */
const PLAN_PRICES: Record<string, string | undefined> = {
  monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'),
  yearly: Deno.env.get('STRIPE_PRICE_YEARLY'),
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    const plans: PlanPrice[] = []

    for (const [id, priceId] of Object.entries(PLAN_PRICES)) {
      // A missing id is a deployment that was never finished. Saying so beats
      // returning a short list that the paywall would render as "this plan does
      // not exist" — the plan exists, the configuration does not.
      if (!priceId) throw new Error(`no price configured for the ${id} plan`)

      // `toPlanPrice` refuses an archived, one-off, or non-flat price. Each of
      // those is a real way to bill the wrong amount silently, and each is
      // covered by a test in `_shared/plan-price.test.ts`.
      plans.push(toPlanPrice(id, await stripe.prices.retrieve(priceId)))
    }

    return json({ plans })
  } catch (e) {
    // Logged in full, returned in outline. The message can name a price id and
    // the shape of the misconfiguration, which belongs in the function logs and
    // not in the response to an anonymous caller.
    console.error('could not resolve plan prices', e)
    return json({ error: 'Prices are unavailable.' }, 503)
  }
})
