import { supabase } from './supabase/client'

/**
 * The half of a failure that reaches the operator.
 *
 * `logFailure` writes the cause to the console of whoever hit it — a
 * customer's device, which nobody reads. For the places where a failure costs
 * a sale or leaves an account action undone, this module also sends one row
 * to `report_client_failure` (migration `20261118120000_client_failures.sql`),
 * which the admin page lists.
 *
 * What is sent: the place, `Error.name: Error.message` scrubbed of anything
 * that looks like an e-mail address or a token, the pathname, and the build.
 * Never a stack, never the query string, never who — the server takes the
 * user from the verified JWT.
 *
 * The failures that matter most happen when the network or Supabase is
 * unreachable, which is exactly when a report cannot be sent either. So a
 * report is written to a small queue in `sessionStorage` first and the queue
 * is flushed: now, before the next report, and on the next app start in this
 * tab. A report from a device that never comes back is lost. That is the
 * limit of reporting from the client, and it is stated rather than hidden.
 *
 * Nothing in here throws, and nothing in here is awaited by the caller.
 */

/** The `sessionStorage` key of the queue. */
export const PENDING_FAILURES_KEY = 'bjt_pending_failures'

/** Most entries the queue holds; the oldest are dropped first. */
export const MAX_PENDING_FAILURES = 10

/** Longest message sent. The server cuts at the same length. */
export const MAX_FAILURE_MESSAGE = 500

/**
 * The places that are reported.
 *
 * An allowlist, not a blocklist: `auth` is absent on purpose — a wrong
 * password is not a failure of ours, and reporting it would fill the table
 * with other people's typos. A new call site is silent until it is added
 * here deliberately.
 */
export const REPORTED_PLACES: ReadonlySet<string> = new Set([
  'checkout',
  'checkout-landing',
  'billing-portal',
  'data-export',
  'data-reset',
  'profile-avatar',
  'profile-name',
])

/** One queued report. `time` is when it happened, as an ISO instant. */
export interface PendingFailure {
  place: string
  message: string
  path: string | null
  time: string
}

/** An entry older than this when it is sent says so in its message. */
const LATE_AFTER_MS = 2 * 60_000

/** PostgREST's "no such function": the migration has not been pushed. */
const FUNCTION_MISSING = 'PGRST202'

let warnedMissing = false
/** Flushes run one after another, never side by side. */
let chain: Promise<void> = Promise.resolve()

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g
/** `sk_live_…`, `whsec_…`, `sb_secret_…` and their relatives. */
const PREFIXED_KEY = /\b(?:sk|pk|rk|whsec|sb)_[A-Za-z0-9_-]{8,}/g
/** `?access_token=…` and friends inside a URL quoted by an error. */
const TOKEN_PARAM = /([?&#](?:access_token|refresh_token|token|code|apikey|key)=)[^&\s"']+/gi

/**
 * Remove what must not leave the browser inside an error message.
 *
 * An error text is written by whatever threw it, and libraries quote their
 * inputs: an address that failed validation, a URL with a token in it, a JWT
 * that did not verify. Each is replaced by a placeholder that says what was
 * there, so the message stays readable.
 */
export function scrubFailureMessage(message: string): string {
  return message
    .replace(JWT, '[token]')
    .replace(TOKEN_PARAM, '$1[token]')
    .replace(PREFIXED_KEY, '[key]')
    .replace(EMAIL, '[email]')
}

/**
 * The sentence stored for a thrown thing: `Name: message` for an `Error`,
 * its string form otherwise. Scrubbed, then cut to the limit.
 *
 * A plain object with a `message` (some client libraries reject with one)
 * contributes that instead of `[object Object]`, which would tell the
 * operator nothing.
 */
export function describeFailure(cause: unknown): string {
  let raw: string
  try {
    if (cause instanceof Error) {
      raw = `${cause.name}: ${cause.message}`
    } else if (typeof cause === 'object' && cause !== null && typeof (cause as { message?: unknown }).message === 'string') {
      raw = (cause as { message: string }).message
    } else {
      raw = String(cause)
    }
  } catch {
    raw = 'unprintable failure'
  }
  return scrubFailureMessage(raw).slice(0, MAX_FAILURE_MESSAGE)
}

/** The pathname alone: a query string or fragment can carry a token. */
function currentPath(): string | null {
  try {
    return window.location.pathname.slice(0, 200) || null
  } catch {
    return null
  }
}

/**
 * Which build is running: the hashed name of the entry script
 * (`index-B4x9Kq.js`), which changes with every deploy. Null where there is
 * no such script.
 */
function buildId(): string | null {
  try {
    const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src')
    if (!src) return null
    const name = src.split(/[?#]/)[0].split('/').pop()
    return name ? name.slice(0, 40) : null
  } catch {
    return null
  }
}

function isPendingFailure(v: unknown): v is PendingFailure {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.place === 'string'
    && typeof e.message === 'string'
    && (e.path === null || typeof e.path === 'string')
    && typeof e.time === 'string'
}

/** The queue as stored. Anything unreadable or malformed is an empty queue. */
export function readPendingFailures(): PendingFailure[] {
  try {
    const raw = sessionStorage.getItem(PENDING_FAILURES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPendingFailure).slice(-MAX_PENDING_FAILURES) : []
  } catch {
    return []
  }
}

function writePendingFailures(queue: PendingFailure[]): void {
  try {
    if (queue.length === 0) sessionStorage.removeItem(PENDING_FAILURES_KEY)
    else sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify(queue.slice(-MAX_PENDING_FAILURES)))
  } catch {
    // Storage full or forbidden (private mode): the report is lost, which is
    // no worse than before this module existed.
  }
}

const sameEntry = (a: PendingFailure, b: PendingFailure) =>
  a.time === b.time && a.place === b.place && a.message === b.message

/** Take one entry out of the stored queue, whatever was added meanwhile. */
function removePending(entry: PendingFailure): void {
  const queue = readPendingFailures()
  const i = queue.findIndex(e => sameEntry(e, entry))
  if (i === -1) return
  queue.splice(i, 1)
  writePendingFailures(queue)
}

/**
 * - `sent`: the server took it (or refused it for good — resending the same
 *   row would get the same answer).
 * - `missing`: the function does not exist; nothing queued can be delivered.
 * - `retry`: nothing answered, or the server was unwell. Keep it.
 */
type SendOutcome = 'sent' | 'missing' | 'retry'

async function send(entry: PendingFailure): Promise<SendOutcome> {
  if (!supabase) return 'retry'
  try {
    // The server stamps the row with its own clock on arrival. A report that
    // waited in the queue carries the moment it really happened in its text.
    const age = Date.now() - Date.parse(entry.time)
    const message = (age > LATE_AFTER_MS ? `[occurred ${entry.time}] ${entry.message}` : entry.message)
      .slice(0, MAX_FAILURE_MESSAGE)
    const { error, status } = await supabase.rpc('report_client_failure', {
      p_place: entry.place,
      p_message: message,
      p_path: entry.path,
      p_build: buildId(),
    })
    if (!error) return 'sent'
    if (error.code === FUNCTION_MISSING) {
      if (!warnedMissing) {
        warnedMissing = true
        console.warn('[failure-report] report_client_failure does not exist yet — push migration 20261118120000_client_failures.sql')
      }
      return 'missing'
    }
    // A fetch that never got an answer comes back as an error with no status;
    // a 5xx is the server being unwell; a 401 is a sign-in that expired and
    // will be refreshed. Everything else is a considered no.
    const unanswered = !status || status >= 500 || status === 401 || !error.code
    return unanswered ? 'retry' : 'sent'
  } catch {
    return 'retry'
  }
}

async function runFlush(): Promise<void> {
  try {
    if (!supabase) return
    // Bounded: the queue holds ten, and a report added mid-flush is picked up
    // by re-reading the storage on every turn.
    for (let turn = 0; turn < MAX_PENDING_FAILURES * 2; turn++) {
      const head = readPendingFailures()[0]
      if (!head) return
      const outcome = await send(head)
      if (outcome === 'retry') return
      if (outcome === 'missing') {
        writePendingFailures([])
        return
      }
      removePending(head)
    }
  } catch {
    // Never throws: see the module comment.
  }
}

/**
 * Send whatever is queued, oldest first. Stops at the first report that
 * cannot be delivered and leaves it, and everything after it, in the queue.
 *
 * Called once on app start (`App`) and by every new report. Resolves when
 * the attempt is over; never rejects.
 */
export function flushPendingFailures(): Promise<void> {
  chain = chain.then(runFlush, runFlush)
  return chain
}

/**
 * Report a failure to the operator, if `place` is one that is reported.
 *
 * Returns at once. The report is queued in `sessionStorage` before anything
 * is sent, so a tab that closes or a network that is down does not lose it
 * for the rest of this browser session.
 *
 * @param place - The call site's name, as passed to `logFailure`
 * @param cause - Whatever was thrown
 */
export function reportFailure(place: string, cause: unknown): void {
  try {
    if (!REPORTED_PLACES.has(place) || !supabase) return
    const queue = readPendingFailures()
    queue.push({
      place,
      message: describeFailure(cause),
      path: currentPath(),
      time: new Date().toISOString(),
    })
    writePendingFailures(queue)
    void flushPendingFailures()
  } catch {
    // Reporting a failure must never become one.
  }
}

/** Test seam: forget the missing-function warning and any running flush. */
export function resetFailureReportForTests(): void {
  warnedMissing = false
  chain = Promise.resolve()
}
