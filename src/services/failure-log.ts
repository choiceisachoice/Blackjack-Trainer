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
 * ## Why the console and not a table
 *
 * The failures worth catching here are the ones that never reach the server —
 * a blocked preflight, a dead network, Supabase unreachable. There is nothing
 * server-side to record them *with*. What actually reports these is the
 * customer, which is why the message they see matters more than any log: one
 * who reads "something went wrong, write to us at …" gets in touch, and one who
 * reads "Edge Function returned a non-2xx status code" leaves.
 */
export function logFailure(where: string, cause: unknown): void {
  console.error(`[${where}] failed`, cause)
}
