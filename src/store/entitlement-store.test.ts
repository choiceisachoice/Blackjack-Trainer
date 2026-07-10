import { describe, it, expect, vi } from 'vitest'

// Force the "billing is configured" branch so we exercise the real gating logic
// (with Supabase unconfigured, everything is unlocked by design).
vi.mock('../services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: null,
  requireSupabase: () => { throw new Error('not used in this test') },
}))

const { selectIsPro } = await import('./entitlement-store')

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
