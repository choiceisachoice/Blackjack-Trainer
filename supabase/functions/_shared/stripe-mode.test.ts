import { describe, it, expect } from 'vitest'
import { expectsLiveMode, acceptsEvent } from './stripe-mode'

/**
 * Which Stripe world a deployment belongs to.
 *
 * A verified signature proves an event came from Stripe. It does not prove it
 * came from *this* world, and the two are different questions — the production
 * database still carries entitlement rows written in July 2026 by sandbox
 * events that granted real Pro from a test card.
 *
 * The mode is inferred from the secret key already in use rather than
 * configured separately, so there is no second value to drift.
 */
describe('expectsLiveMode', () => {
  it('reads a standard live key as live', () => {
    expect(expectsLiveMode('sk_live_abc123')).toBe(true)
  })

  it('reads a restricted live key as live', () => {
    // The one that would have been catastrophic. A restricted key is a normal
    // thing to run a webhook on, and matching only `sk_live_` would classify
    // this deployment as test mode — dropping every real event while answering
    // Stripe 2xx, so the dashboard would show a wall of successful deliveries
    // and no entitlement would ever be written.
    expect(expectsLiveMode('rk_live_abc123')).toBe(true)
  })

  it('reads test keys of either kind as test', () => {
    expect(expectsLiveMode('sk_test_abc123')).toBe(false)
    expect(expectsLiveMode('rk_test_abc123')).toBe(false)
  })

  it('does not mistake a key that merely contains the word for a live one', () => {
    expect(expectsLiveMode('sk_test_live_abc')).toBe(false)
    expect(expectsLiveMode('whsec_live_abc')).toBe(false)
  })

  it('treats a missing key as test rather than assuming live', () => {
    // A deployment with no key cannot talk to Stripe at all, so this is
    // academic — but of the two ways to be wrong, refusing live events is
    // recoverable and accepting them into an unconfigured deployment is not.
    expect(expectsLiveMode(undefined)).toBe(false)
    expect(expectsLiveMode('')).toBe(false)
  })
})

describe('acceptsEvent', () => {
  it('takes a live event on a live deployment', () => {
    expect(acceptsEvent(true, 'sk_live_x')).toBe(true)
  })

  it('drops a test event on a live deployment', () => {
    // Exactly what happened in July, before this existed.
    expect(acceptsEvent(false, 'sk_live_x')).toBe(false)
  })

  it('takes a test event on a test deployment', () => {
    expect(acceptsEvent(false, 'sk_test_x')).toBe(true)
  })

  it('drops a live event on a test deployment', () => {
    // The direction that would let a staging environment hand out real
    // entitlements — or write a real customer's status into the wrong database.
    expect(acceptsEvent(true, 'sk_test_x')).toBe(false)
  })
})
