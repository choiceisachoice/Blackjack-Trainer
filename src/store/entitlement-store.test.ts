import { describe, it, expect, vi, afterEach } from 'vitest'

// Force the "billing is configured" branch so we exercise the real gating logic
// (with Supabase unconfigured, everything is unlocked by design).
vi.mock('../services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: null,
  requireSupabase: () => { throw new Error('not used in this test') },
}))

const { selectIsPro, useEntitlementStore } = await import('./entitlement-store')

const NEXT_YEAR = Date.now() + 365 * 24 * 60 * 60 * 1000
const LAST_YEAR = Date.now() - 365 * 24 * 60 * 60 * 1000

describe('selectIsPro (billing configured)', () => {
  it('grants Pro for active and trialing subscriptions in period', () => {
    expect(selectIsPro({ status: 'active', currentPeriodEnd: NEXT_YEAR, loaded: true })).toBe(true)
    expect(selectIsPro({ status: 'trialing', currentPeriodEnd: NEXT_YEAR, loaded: true })).toBe(true)
  })

  it('grants a grace window for past_due', () => {
    expect(selectIsPro({ status: 'past_due', currentPeriodEnd: NEXT_YEAR, loaded: true })).toBe(true)
  })

  it('denies Pro for free and canceled', () => {
    expect(selectIsPro({ status: 'free', currentPeriodEnd: null, loaded: true })).toBe(false)
    expect(selectIsPro({ status: 'canceled', currentPeriodEnd: NEXT_YEAR, loaded: true })).toBe(false)
  })

  it('denies Pro once the paid period has elapsed, even if status lags', () => {
    expect(selectIsPro({ status: 'active', currentPeriodEnd: LAST_YEAR, loaded: true })).toBe(false)
  })

  it('treats a null period end as no expiry', () => {
    expect(selectIsPro({ status: 'active', currentPeriodEnd: null, loaded: true })).toBe(true)
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
