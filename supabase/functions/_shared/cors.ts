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
 * `APP_URL` stays the single source of truth for redirect targets — Stripe must
 * send the customer to one canonical address, not to whichever host they
 * happened to arrive on.
 */

/** Canonical origin. Also the redirect target after checkout. */
export const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/+$/, '')

/** `https://example.com` → both `https://example.com` and `https://www.example.com`. */
function withWwwSibling(origin: string): string[] {
  try {
    const u = new URL(origin)
    const other = u.host.startsWith('www.') ? u.host.slice(4) : `www.${u.host}`
    return [`${u.protocol}//${u.host}`, `${u.protocol}//${other}`]
  } catch {
    return [origin]
  }
}

/**
 * Extra origins, comma-separated, for local development against the deployed
 * functions (e.g. `http://localhost:5173`). Unset in production.
 */
const extra = (Deno.env.get('EXTRA_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)

export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([...withWwwSibling(APP_URL), ...extra])

/**
 * CORS headers for this request.
 *
 * Falls back to `APP_URL` for an unknown origin rather than omitting the header:
 * the browser refuses either way, and a present-but-mismatched value is far
 * easier to diagnose in a network panel than a missing one.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
    // supabase-js invoke sends apikey + x-client-info in addition to auth/content-type.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // The response now differs by request origin. Without this, a shared cache
    // could hand a www visitor the apex's header, or the reverse.
    'Vary': 'Origin',
  }
}
