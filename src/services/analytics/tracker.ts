import { supabase } from '../supabase/client'
import { analyticsAllowed } from './consent'
import { getVisitorId } from './visitor'
import { deviceCategory } from './device'

/**
 * The page-view tracker.
 *
 * What leaves the browser, and when:
 *
 * - On every route change: the visitor id, the pathname (with its language
 *   prefix — `/de/learn` and `/learn` are two pages), the referrer's host and
 *   the device class. The server keeps the last two only for the first view
 *   of a session and ignores them after; sending them every time keeps the
 *   client stateless.
 * - Once a minute while the tab is visible, and once when it is hidden: a
 *   ping with the visitor id alone, so the minutes on the last page count.
 *
 * Nothing here can fail loudly. A page view that does not land is not worth
 * a message a person sees, and not worth a console line for every view
 * either: the first failure is logged, the rest are dropped.
 *
 * The server decides where sessions begin and end (`analytics_track` in the
 * migration); the client holds no session state at all.
 */

/** How often the open tab says it is still open. */
export const HEARTBEAT_MS = 60_000

let reportedFailure = false

function noteFailure(cause: unknown): void {
  if (reportedFailure) return
  reportedFailure = true
  console.warn('[analytics] page views are not being recorded', cause)
}

/**
 * The host of the page that linked here, or null.
 *
 * Only the host: the full referrer URL can carry a search query or a user
 * id from the other site, and the report groups by host anyway. A referrer
 * on this site's own origin is not a referrer, it is navigation.
 *
 * @param referrer - `document.referrer`
 * @param ownOrigin - `location.origin`, to drop internal moves
 */
export function referrerHost(referrer: string, ownOrigin: string): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.origin === ownOrigin) return null
    return url.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * Record one page view. Resolves once the request has been sent; never
 * rejects.
 *
 * @param pathname - The full pathname, prefix included (`window.location.pathname`)
 */
export async function trackPageView(pathname: string): Promise<void> {
  if (!analyticsAllowed() || !supabase) return
  const visitorId = getVisitorId()
  if (!visitorId) return
  try {
    const { error } = await supabase.rpc('analytics_track', {
      p_visitor_id: visitorId,
      p_pathname: pathname,
      p_referrer_host: referrerHost(document.referrer, window.location.origin),
      p_device: deviceCategory(navigator.userAgent, navigator.maxTouchPoints),
    })
    if (error) noteFailure(error)
  } catch (e) {
    noteFailure(e)
  }
}

/**
 * Tell the server the tab is still open.
 *
 * A plain `fetch` with `keepalive`, not the Supabase client: the last ping
 * goes out as the tab is hidden or closed, and `keepalive` is what lets a
 * request outlive the page. The anon key is enough — a ping only extends a
 * session that already exists for this visitor id, and it carries no user.
 */
export function ping(): void {
  if (!analyticsAllowed()) return
  const visitorId = getVisitorId()
  if (!visitorId) return
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  try {
    void fetch(`${url}/rest/v1/rpc/analytics_ping`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_visitor_id: visitorId }),
    }).catch(noteFailure)
  } catch (e) {
    noteFailure(e)
  }
}

/**
 * Start the heartbeat. Returns the function that stops it.
 *
 * Pings once a minute while the document is visible, and once at the moment
 * it stops being visible — which is also the last chance before a close.
 * `pagehide` is listened to as well, for the browsers that skip
 * `visibilitychange` on close.
 */
export function startHeartbeat(doc: Document = document, win: Window = window): () => void {
  if (!analyticsAllowed()) return () => {}
  let timer: ReturnType<typeof setInterval> | null = null

  const arm = () => {
    if (timer !== null) return
    timer = setInterval(ping, HEARTBEAT_MS)
  }
  const disarm = () => {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') {
      disarm()
      ping()
    } else {
      arm()
    }
  }
  const onPageHide = () => {
    disarm()
    ping()
  }

  doc.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('pagehide', onPageHide)
  if (doc.visibilityState !== 'hidden') arm()

  return () => {
    disarm()
    doc.removeEventListener('visibilitychange', onVisibility)
    win.removeEventListener('pagehide', onPageHide)
  }
}

/** Test seam: forget that a failure was already reported. */
export function resetTrackerForTests(): void {
  reportedFailure = false
}
