/**
 * CORS for the browser-facing Edge Functions.
 *
 * Both functions previously answered with a single fixed origin:
 *
 *     'Access-Control-Allow-Origin': APP_URL
 *
 * which is correct for exactly one hostname and silently wrong for every other.
 * The site is reachable as both `black-jack-training.com` and its `www.`
 * variant, so whichever one is not `APP_URL` gets its preflight refused and the
 * user sees "Failed to send a request to the Edge Function" — a message that
 * points at the function while the fault is in the header.
 *
 * So: keep an allowlist, and echo back the caller's origin only when it is on
 * it. Echoing without checking would be the same as `*`, which would let any
 * site on the internet start a checkout in a signed-in user's name.
 *
 * The *deciding* lives in `origins.ts` — pure, and therefore covered by the
 * project's normal test run. What stays here is reading the environment, which
 * is the part a test cannot reach anyway.
 *
 * `APP_URL` stays the single source of truth for redirect targets — Stripe must
 * send the customer to one canonical address, not to whichever host they
 * happened to arrive on.
 */

import { buildAllowlist, resolveAllowOrigin } from './origins.ts'

/** Canonical origin. Also the redirect target after checkout. */
export const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/+$/, '')

/**
 * Extra origins, comma-separated, for local development against the deployed
 * functions (e.g. `http://localhost:5173`). Unset in production.
 */
export const ALLOWED_ORIGINS = buildAllowlist(APP_URL, Deno.env.get('EXTRA_ALLOWED_ORIGINS'))

/** CORS headers for this request. */
export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveAllowOrigin(
      req.headers.get('Origin'),
      ALLOWED_ORIGINS,
      APP_URL,
    ),
    // supabase-js invoke sends apikey + x-client-info in addition to auth/content-type.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // The response differs by request origin. Without this, a shared cache
    // could hand a www visitor the apex's header, or the reverse.
    'Vary': 'Origin',
  }
}
