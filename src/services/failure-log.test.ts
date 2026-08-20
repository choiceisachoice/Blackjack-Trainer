import { describe, it, expect, vi, afterEach } from 'vitest'
import { logFailure } from './failure-log'

/**
 * Keeping the technical detail and the customer's message apart.
 *
 * Four screens used to do `setError(e instanceof Error ? e.message : t(…))`,
 * which puts whatever was thrown straight in front of a person. From
 * `supabase-js` that reads "Edge Function returned a non-2xx status code" —
 * English, on a German paywall, telling a paying customer nothing and offering
 * no way forward. The translated fallback beside it only ran when the thrown
 * thing was *not* an Error, which is almost never.
 *
 * The detail still matters, just not there. This is the half that goes to the
 * console; the other half is a translated sentence the component owns.
 */
afterEach(() => vi.restoreAllMocks())

describe('logFailure', () => {
  it('writes the cause to the console, where it can be read', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('Edge Function returned a non-2xx status code')

    logFailure('checkout', boom)

    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls[0].some(a => a === boom)).toBe(true)
  })

  it('names where it happened, so a console full of noise is still readable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logFailure('billing-portal', new Error('nope'))
    expect(String(spy.mock.calls[0][0])).toContain('billing-portal')
  })

  it('survives being handed something that is not an Error', () => {
    // `throw 'string'` is legal, and a rejected fetch can produce anything.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => logFailure('checkout', 'just a string')).not.toThrow()
    expect(() => logFailure('checkout', undefined)).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('returns nothing, so it cannot be mistaken for a message to display', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(logFailure('checkout', new Error('x'))).toBeUndefined()
  })
})
