/**
 * Visitors who arrive through the QR code.
 *
 * The casino-games video (YouTube, Nov 2026) ends on a QR code that opens
 * `https://black-jack-training.com/?ref=qr`. A visitor who comes that way is
 * thanked and shown their reward: the yearly plan, with the saving every
 * yearly subscriber gets. Nothing about the price changes; what the code adds
 * is the moment that says "this is for you, here is how to take it".
 *
 * Two readers need the parameter. The page-view tracker sends it as the
 * session's source, so scans show up in the operator's report as their own
 * line. The landing page shows the welcome and then removes the parameter from
 * the address bar, so a reload or a shared link does not replay it. The tracker
 * may run after that removal, which is why the parameter is read once per page
 * load and the first answer kept.
 */

/** The `ref` value the QR code carries. */
export const QR_REF = 'qr'

/** What the analytics report shows as the source of a session that came from the code. */
export const QR_SOURCE = 'qr-code'

/** localStorage key: this browser has arrived through the code at least once. */
const REWARD_KEY = 'bjt_qr_reward'

/** A ref is one short plain word; anything else is ignored rather than stored. */
const REF_PATTERN = /^[a-z0-9_-]{1,40}$/

/**
 * The `ref` parameter of a query string, normalised, or null.
 *
 * @param search - A query string such as `location.search` (`?ref=qr`)
 */
export function readArrivalRef(search: string): string | null {
  let raw: string | null
  try {
    raw = new URLSearchParams(search).get('ref')
  } catch {
    return null
  }
  if (raw === null) return null
  const ref = raw.trim().toLowerCase()
  return REF_PATTERN.test(ref) ? ref : null
}

let cached: { ref: string | null } | null = null

/**
 * The ref this page load arrived with. Read on the first call, kept after.
 *
 * @param search - The query string to read on the first call; defaults to the current address
 */
export function arrivalRef(search: string = typeof window === 'undefined' ? '' : window.location.search): string | null {
  if (cached === null) cached = { ref: readArrivalRef(search) }
  return cached.ref
}

let welcomeShown = false

/** Whether the welcome has already opened in this page load. */
export function qrWelcomeShown(): boolean {
  return welcomeShown
}

/** Note that the welcome has opened, so returning to `/` inside the app does not open it again. */
export function markQrWelcomeShown(): void {
  welcomeShown = true
}

/** Forget the cached ref and the shown flag. Tests only: a real page load reads the address once. */
export function resetArrivalRefForTest(): void {
  cached = null
  welcomeShown = false
}

/**
 * Whether this page load came from the QR code.
 *
 * @param search - As for {@link arrivalRef}
 */
export function isQrArrival(search?: string): boolean {
  return arrivalRef(search) === QR_REF
}

/**
 * The address with `ref` removed and every other parameter kept, for
 * `history.replaceState`.
 *
 * @param pathname - `location.pathname`
 * @param search - `location.search`
 * @param hash - `location.hash`
 */
export function withoutRefParam(pathname: string, search: string, hash = ''): string {
  const params = new URLSearchParams(search)
  params.delete('ref')
  const qs = params.toString()
  return pathname + (qs ? `?${qs}` : '') + hash
}

/** Remember that this browser came through the code, so the pricing card can keep saying so. */
export function rememberQrReward(): void {
  try { localStorage.setItem(REWARD_KEY, '1') } catch { /* storage unavailable */ }
}

/** Whether this browser has come through the code before. */
export function hasQrReward(): boolean {
  try { return localStorage.getItem(REWARD_KEY) === '1' } catch { return false }
}
