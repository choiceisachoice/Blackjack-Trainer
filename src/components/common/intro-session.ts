/**
 * Whether this page load gets the welcome or just the progress.
 *
 * Its own module, and not only because a file that exports a component may not
 * also export helpers without breaking Fast Refresh. This is a *policy* — one
 * product decision about who is charged for the introduction — and it is worth
 * being able to read, test and change it without opening the component that
 * happens to consume it.
 */

const SEEN_KEY = 'bjt_intro_seen'

/**
 * Decided once per page load, at module scope on purpose.
 *
 * Reading the flag and then writing it are one indivisible decision, and doing
 * it inside a hook would get it wrong twice over: a lazy `useState` initialiser
 * is called more than once under StrictMode, and StrictMode's remount would
 * re-run it *after* the flag had already been set — so the very first visit of a
 * session would play the ceremony and then immediately replay it abbreviated.
 * A module-level memo is stable for the life of the page, which is exactly the
 * lifetime this decision has.
 */
let repeatVisit: boolean | null = null

/**
 * Has this session already seen the welcome? Marks it seen on the way out.
 *
 * Fails towards the ceremony: if `sessionStorage` is unavailable — private
 * browsing, a partitioned iframe, quota — every load is treated as a first
 * visit. Showing the welcome too often is a small cost; withholding it from a
 * genuine first-time visitor is not.
 */
export function isRepeatVisit(): boolean {
  if (repeatVisit !== null) return repeatVisit
  try {
    repeatVisit = sessionStorage.getItem(SEEN_KEY) === '1'
    sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    repeatVisit = false
  }
  return repeatVisit
}

/**
 * Test seam: put the decision back to how a fresh page load would find it.
 *
 * `keepSession` is the difference between the two things a test might mean, and
 * they are not interchangeable. Dropping the memo alone models a **reload** —
 * module state is gone, `sessionStorage` survives, so the next mount is a repeat
 * visit. Dropping both models a **new session**, i.e. a new tab. Without the
 * distinction a test cannot reach the repeat-visit branch at all: two `render`
 * calls in one process share the memo and both read as the first load.
 */
export function resetIntroSession({ keepSession = false } = {}): void {
  repeatVisit = null
  if (keepSession) return
  try { sessionStorage.removeItem(SEEN_KEY) } catch { /* nothing to forget */ }
}
