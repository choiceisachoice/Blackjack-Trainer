import { describe, it, expect, vi, afterEach } from 'vitest'

// Force the "billing is configured" branch so we exercise the real gating logic
// (with Supabase unconfigured, everything is unlocked by design).
vi.mock('../services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: null,
  requireSupabase: () => { throw new Error('not used in this test') },
}))

const { selectIsPro, selectHasSubscription, useEntitlementStore } = await import('./entitlement-store')
import type { EntitlementState } from './entitlement-store'

const NEXT_YEAR = Date.now() + 365 * 24 * 60 * 60 * 1000
const LAST_YEAR = Date.now() - 365 * 24 * 60 * 60 * 1000

/**
 * A full state with only the fields a case cares about spelled out.
 *
 * Written as a helper rather than seven inline literals because every new field
 * on `EntitlementState` would otherwise break seven lines that have nothing to
 * do with it — which is how a test file starts getting edited by rote.
 */
const state = (over: Partial<EntitlementState>): EntitlementState => ({
  status: 'free',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loaded: true,
  ...over,
})

describe('selectIsPro (billing configured)', () => {
  it('grants Pro for active and trialing subscriptions in period', () => {
    expect(selectIsPro(state({ status: 'active', currentPeriodEnd: NEXT_YEAR }))).toBe(true)
    expect(selectIsPro(state({ status: 'trialing', currentPeriodEnd: NEXT_YEAR }))).toBe(true)
  })

  it('grants a grace window for past_due', () => {
    expect(selectIsPro(state({ status: 'past_due', currentPeriodEnd: NEXT_YEAR }))).toBe(true)
  })

  it('denies Pro for free and canceled', () => {
    expect(selectIsPro(state({ status: 'free' }))).toBe(false)
    expect(selectIsPro(state({ status: 'canceled', currentPeriodEnd: NEXT_YEAR }))).toBe(false)
  })

  it('denies Pro once the paid period has elapsed, even if status lags', () => {
    expect(selectIsPro(state({ status: 'active', currentPeriodEnd: LAST_YEAR }))).toBe(false)
  })

  it('treats a null period end as no expiry', () => {
    expect(selectIsPro(state({ status: 'active', currentPeriodEnd: null }))).toBe(true)
  })

  it('still grants Pro for the remaining period after a cancellation', () => {
    // Cancelling at period end does not take away the period that was paid for.
    // If this ever returned false, cancelling would revoke access instantly and
    // the customer would have paid for time they cannot use.
    expect(selectIsPro(state({ status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: true }))).toBe(true)
  })
})

/**
 * `selectHasSubscription` answers a different question from `selectIsPro`, and
 * the checkout path depends on the difference: "may this session use the Pro
 * features" versus "has this account already been sold something".
 */
describe('selectHasSubscription', () => {
  it('is true for every state Stripe is billing', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(selectHasSubscription(state({ status }))).toBe(true)
    }
  })

  it('is false for free, canceled and an incomplete checkout', () => {
    // `incomplete` matters: an abandoned payment must not read as a subscription,
    // or the person could never retry it.
    for (const status of ['free', 'canceled', 'incomplete']) {
      expect(selectHasSubscription(state({ status }))).toBe(false)
    }
  })

  it('stays true for a subscription cancelled but still running', () => {
    expect(selectHasSubscription(state({ status: 'active', cancelAtPeriodEnd: true }))).toBe(true)
  })

  it('ignores the period end entirely', () => {
    // Deliberately unlike selectIsPro. An expired period means access has run
    // out; it does not mean Stripe has stopped billing, and selling a second
    // subscription on the strength of a lapsed date is exactly the mistake this
    // selector exists to prevent.
    expect(selectHasSubscription(state({ status: 'active', currentPeriodEnd: LAST_YEAR }))).toBe(true)
  })
})

describe('refreshUntilPro (Stripe checkout return)', () => {
  // Replace loadEntitlement via setState (not vi.spyOn): refreshUntilPro reads it
  // off the live store with get(), and each setState merges a fresh state object,
  // so the mock has to live in the store itself to be picked up.
  const originalLoad = useEntitlementStore.getState().loadEntitlement
  afterEach(() => useEntitlementStore.setState({ loadEntitlement: originalLoad }))

  it('polls until Pro flips on, then stops', async () => {
    let calls = 0
    const loadEntitlement = vi.fn(async () => {
      calls += 1
      // The webhook flips the profile to active by the 3rd poll.
      useEntitlementStore.setState(
        calls >= 3
          ? { status: 'active', currentPeriodEnd: NEXT_YEAR, loaded: true }
          : { status: 'incomplete', currentPeriodEnd: null, loaded: true },
      )
    })
    useEntitlementStore.setState({ status: 'free', currentPeriodEnd: null, loaded: true, loadEntitlement })

    await useEntitlementStore.getState().refreshUntilPro(8, 0)

    expect(calls).toBe(3) // stopped as soon as active — didn't burn all 8 attempts
    expect(selectIsPro(useEntitlementStore.getState())).toBe(true)
  })

  it('gives up after the attempt budget when Pro never arrives', async () => {
    let calls = 0
    const loadEntitlement = vi.fn(async () => {
      calls += 1
      useEntitlementStore.setState({ status: 'incomplete', currentPeriodEnd: null, loaded: true })
    })
    useEntitlementStore.setState({ status: 'free', currentPeriodEnd: null, loaded: true, loadEntitlement })

    await useEntitlementStore.getState().refreshUntilPro(4, 0)

    expect(calls).toBe(4) // exhausted the budget
    expect(selectIsPro(useEntitlementStore.getState())).toBe(false)
  })
})
