import { reportFailure } from './failure-report'

/**
 * Where the technical half of a failure goes.
 *
 * Four screens used to write `setError(e instanceof Error ? e.message : t(…))`,
 * which puts whatever was thrown straight in front of a person. From
 * `supabase-js` that reads "Edge Function returned a non-2xx status code" —
 * English, on a German paywall, telling a paying customer nothing and giving
 * them nowhere to go. The translated fallback sitting right beside it only ran
 * when the thrown thing was *not* an `Error`, which is almost never.
 *
 * The detail is worth keeping; it just does not belong on screen. So the two
 * halves are split on purpose:
 *
 * - the cause comes here, to the console, where it can be read while
 *   diagnosing;
 * - the sentence the person reads is a translation the component owns, and it
 *   never depends on what was thrown.
 *
 * Returns `void` deliberately. A helper that returned a string would invite the
 * next caller to put it in state, which is the habit this replaces.
 *
 * ## The console, and since 18 Nov 2026 also a table
 *
 * A console on a customer's device is read by nobody, so for a short allowlist
 * of places — checkout, the billing portal, the account actions — the cause is
 * also handed to `failure-report.ts`, which sends one scrubbed row to the
 * database for the admin page. Sign-in failures are not on that list: a wrong
 * password is not a failure of ours.
 *
 * The limit is worth knowing. The failures that matter most are the ones that
 * never reach a server — a blocked preflight, a dead network, Supabase
 * unreachable — and a report cannot get out then either. It waits in
 * `sessionStorage` for the next visit in that tab; if there is none, the only
 * report is still the customer, which is why the message they read matters as
 * much as it did before.
 */
export function logFailure(where: string, cause: unknown): void {
  console.error(`[${where}] failed`, cause)
  try {
    reportFailure(where, cause)
  } catch {
    // `reportFailure` does not throw; this is the belt to its braces, because
    // the callers are `catch` blocks on the payment path.
  }
}
