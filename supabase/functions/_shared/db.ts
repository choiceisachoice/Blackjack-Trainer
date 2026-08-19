/**
 * "Did that write actually land?" — as a function, because as a convention it
 * did not hold.
 *
 * `supabase-js` never throws. A failed write and a write that matched zero rows
 * both come back as a plain object, and the zero-row case does not even set
 * `error` — so the obvious `if (error) throw` misses it entirely. On a payment
 * path that difference is the difference between an entitlement being granted
 * and a customer silently getting nothing, in either direction.
 *
 * It was written out by hand in one place, with a comment explaining why, and
 * omitted in two others: the Stripe customer id was written and its result
 * dropped, and the `past_due` downgrade checked only `error`. Both are exactly
 * the failure the comment described.
 *
 * Pure TypeScript on purpose — no Deno, no network, no Stripe. It is the one
 * part of these functions that carries a rule rather than plumbing, so it is
 * the part that can be tested in the project's normal test run rather than
 * needing a second runtime nobody remembers to invoke.
 */

/** The shape `supabase-js` returns from a write with `.select()` attached. */
export interface WriteOutcome {
  data: unknown[] | null
  error: { message: string } | null
}

/**
 * Throw unless the write both succeeded and changed something.
 *
 * @param what names the operation for the log — this message is read against a
 *   customer complaint, so it should say which write, not merely that one failed.
 */
export function requireWrite(outcome: WriteOutcome, what: string): void {
  if (outcome.error) throw new Error(`${what} failed: ${outcome.error.message}`)
  if (!outcome.data || outcome.data.length === 0) {
    throw new Error(`${what} matched no row`)
  }
}
