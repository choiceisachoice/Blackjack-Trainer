// ADR-002: open the Stripe Customer Portal for the signed-in user, so they can
// manage / cancel their subscription and payment method without us building any
// billing UI. The caller's JWT is verified INSIDE this function by `getUser`;
// it is deployed with `--no-verify-jwt` because the platform gate would reject
// the browser's CORS preflight, which carries no Authorization header.
//
// Secrets: STRIPE_SECRET_KEY, APP_URL. Platform: SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import Stripe from 'https://esm.sh/stripe@18?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'
import { APP_URL, corsHeaders } from '../_shared/cors.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    const customerId = profile?.stripe_customer_id as string | undefined
    if (!customerId) return json({ error: 'No subscription to manage' }, 400)

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: APP_URL,
    })
    return json({ url: session.url })
  } catch (e) {
    console.error('create-portal-session failed', e)
    return json({ error: 'Internal error' }, 500)
  }
})
