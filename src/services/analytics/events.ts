import { supabase } from '../supabase/client'
import { analyticsAllowed } from './consent'
import { getVisitorId } from './visitor'

/**
 * The steps between arriving and paying.
 *
 * A page view says someone was on `/login`; it cannot say whether they ever
 * looked at the sign-up form, and nothing at all said whether a new account
 * trained, saw the paywall or pressed the button on it. Each of those is one
 * call to `analytics_event` (migration `20261121120000_purchase_funnel.sql`)
 * with the visitor id and a name from the list below.
 *
 * What leaves the browser: the random visitor id and the name. Nothing else —
 * no path, no plan, no amount, no text. The server takes the account from the
 * verified JWT, keeps its own allow-list of names, and stores the same step
 * from the same visitor once per half hour.
 *
 * It passes through `analyticsAllowed()` like everything else that is
 * counted: without the visitor's yes nothing is sent, and no visitor id is
 * created to send it with.
 *
 * Nothing in here throws, and nothing in here is awaited by a caller.
 */

/** The names the server accepts. Anything else is ignored there. */
export const FUNNEL_EVENTS = ['signup_view', 'signup_done', 'first_session', 'paywall_view', 'checkout_start'] as const

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number]

/** The migration that creates the table and its functions. */
export const FUNNEL_MIGRATION = '20261121120000_purchase_funnel.sql'

/** PostgREST's "no such function": the migration has not been applied. */
const FUNCTION_MISSING = 'PGRST202'

/** Set once the server said the function does not exist; nothing is sent after. */
let missing = false
let reportedFailure = false

function noteFailure(cause: unknown): void {
  if (reportedFailure) return
  reportedFailure = true
  console.warn('[analytics] steps are not being recorded', cause)
}

/**
 * Record that a step on the way to a purchase was reached.
 *
 * Resolves once the request has been answered; never rejects. Callers do not
 * wait for it: `void trackEvent('paywall_view')`.
 *
 * Before the migration is applied the function does not exist. That is said
 * once per page load, in the console, and nothing further is sent until the
 * next load.
 *
 * @param name - One of `FUNNEL_EVENTS`
 */
export async function trackEvent(name: FunnelEvent): Promise<void> {
  try {
    if (missing || !FUNNEL_EVENTS.includes(name)) return
    if (!analyticsAllowed() || !supabase) return
    const visitorId = getVisitorId()
    if (!visitorId) return
    const { error } = await supabase.rpc('analytics_event', { p_visitor_id: visitorId, p_name: name })
    if (!error) return
    if (error.code === FUNCTION_MISSING) {
      missing = true
      console.warn(`[analytics] analytics_event does not exist yet — apply migration ${FUNNEL_MIGRATION}`)
      return
    }
    noteFailure(error)
  } catch (e) {
    try { noteFailure(e) } catch { /* a console that throws is not ours to fix */ }
  }
}

/** Test seam: forget the missing-function answer and the reported failure. */
export function resetEventsForTests(): void {
  missing = false
  reportedFailure = false
}
