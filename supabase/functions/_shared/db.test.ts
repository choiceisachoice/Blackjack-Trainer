import { describe, it, expect } from 'vitest'
import { requireWrite } from './db'

/**
 * The invariant that was missing three times in one payment path.
 *
 * `supabase-js` does not throw. A write that fails, and a write that succeeds
 * against zero rows, both come back as a plain object — and a zero-row match is
 * not even an error, so `if (error) throw` does not catch it. Every place that
 * writes entitlement state had to remember this on its own, and two out of
 * three did not:
 *
 * - the Stripe customer id was written and the result dropped entirely, so a
 *   paying customer could end up unable to reach the portal to cancel;
 * - `invoice.payment_failed` checked only `error`, so someone who stopped
 *   paying could keep Pro while Stripe was told 200.
 *
 * Making it a named function is the point. "Did this write land" is now a thing
 * with a name that can be called, rather than a paragraph of comment that the
 * next call site has to rediscover.
 */
describe('requireWrite', () => {
  it('accepts a write that changed exactly the row it aimed at', () => {
    expect(() => requireWrite({ data: [{ id: 'u1' }], error: null }, 'entitlement update')).not.toThrow()
  })

  it('accepts a write that changed several rows', () => {
    // Not this helper's business how many. It answers "did anything happen",
    // and a caller that needs exactly one should select by primary key.
    expect(() => requireWrite({ data: [{ id: 'a' }, { id: 'b' }], error: null }, 'x')).not.toThrow()
  })

  it('throws on a reported failure, naming the operation', () => {
    expect(() => requireWrite({ data: null, error: { message: 'permission denied' } }, 'past_due downgrade'))
      .toThrow(/past_due downgrade.*permission denied/)
  })

  it('throws when the write succeeded and matched nothing', () => {
    // The case the whole helper exists for. No error, no rows, and every
    // hand-written check so far treated that as success.
    expect(() => requireWrite({ data: [], error: null }, 'entitlement update'))
      .toThrow(/entitlement update/)
  })

  it('throws when the driver returns no rows at all rather than an empty list', () => {
    expect(() => requireWrite({ data: null, error: null }, 'entitlement update'))
      .toThrow(/entitlement update/)
  })

  it('reports the failure rather than the empty result when both are present', () => {
    // A caller reading the log needs the reason, not the symptom.
    expect(() => requireWrite({ data: [], error: { message: 'connection reset' } }, 'x'))
      .toThrow(/connection reset/)
  })

  it('says plainly that nothing was matched, so the log is not a riddle', () => {
    // These messages are read at 3am against a customer complaint. "matched no
    // row" points at the data; a bare "write failed" sends someone to the
    // network layer.
    expect(() => requireWrite({ data: [], error: null }, 'customer id')).toThrow(/matched no row/)
  })
})
