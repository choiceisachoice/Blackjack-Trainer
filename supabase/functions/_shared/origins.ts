/**
 * Who may call the browser-facing functions, as pure functions.
 *
 * Separated from `cors.ts` so it can be tested: that file reads `Deno.env` at
 * module load, which makes it unreachable from the project's test run. What is
 * left there is the reading of environment variables; the deciding happens here.
 *
 * This is a security boundary and not plumbing. Echoing back whatever `Origin`
 * arrives is `Access-Control-Allow-Origin: *` with extra steps, and that would
 * let any site on the internet start a checkout in a signed-in user's name.
 */

/** Strip a trailing slash — an `Origin` header never carries one. */
function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/**
 * `https://example.com` → both the apex and its `www.` twin.
 *
 * The site answers on both names, so whichever one is not `APP_URL` would
 * otherwise have its preflight refused — and the user sees "Failed to send a
 * request to the Edge Function", a message that points at the function while
 * the fault is in the header.
 *
 * Returns scheme + host only: that is all a browser puts in `Origin`, and
 * keeping a path would produce an entry no request can ever match.
 */
export function withWwwSibling(origin: string): string[] {
  try {
    const u = new URL(origin)
    const other = u.host.startsWith('www.') ? u.host.slice(4) : `www.${u.host}`
    return [`${u.protocol}//${u.host}`, `${u.protocol}//${other}`]
  } catch {
    // Not a URL — pass it through rather than dropping it, so a malformed
    // APP_URL fails visibly at the browser instead of silently emptying the
    // allowlist.
    return [origin]
  }
}

/**
 * Parse the comma-separated extra origins, for local development against the
 * deployed functions. Unset in production.
 *
 * Trailing slashes are stripped because a single stray one produces an entry
 * that looks correct in the dashboard and matches nothing.
 */
export function parseExtraOrigins(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map(s => trimSlash(s.trim()))
    .filter(Boolean)
}

/** Every origin allowed to call these functions. */
export function buildAllowlist(appUrl: string, extraRaw?: string | null): ReadonlySet<string> {
  return new Set([...withWwwSibling(trimSlash(appUrl)), ...parseExtraOrigins(extraRaw)])
}

/**
 * The value for `Access-Control-Allow-Origin`.
 *
 * Falls back to the canonical origin for an unknown caller rather than omitting
 * the header: the browser refuses either way, and a present-but-mismatched
 * value is far easier to diagnose in a network panel than a missing one.
 */
export function resolveAllowOrigin(
  requestOrigin: string | null | undefined,
  allowlist: ReadonlySet<string>,
  appUrl: string,
): string {
  const origin = requestOrigin ?? ''
  return allowlist.has(origin) ? origin : appUrl
}
