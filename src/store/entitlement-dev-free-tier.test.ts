import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { EntitlementState } from './entitlement-store'

/**
 * The development switch that shows the app as an account without Pro.
 *
 * Two things matter about it: it only works where there is no billing backend
 * at all, and it can only take Pro away. (That it is gone from a production
 * bundle is a property of the build — `import.meta.env.DEV` is `false` there —
 * and is checked by looking at the bundle, not here.)
 */
const FREE: EntitlementState = { status: 'free', currentPeriodEnd: null, cancelAtPeriodEnd: false, loaded: true }

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('without a billing backend', () => {
  it('everything is unlocked, as before', async () => {
    const { selectIsPro } = await import('./entitlement-store')
    expect(selectIsPro(FREE)).toBe(true)
  })

  it('the switch shows the free tier', async () => {
    const { selectIsPro, DEV_FREE_TIER_KEY } = await import('./entitlement-store')
    localStorage.setItem(DEV_FREE_TIER_KEY, '1')
    expect(selectIsPro(FREE)).toBe(false)
    // Only the exact value: a leftover of another shape switches nothing.
    localStorage.setItem(DEV_FREE_TIER_KEY, 'true')
    expect(selectIsPro(FREE)).toBe(true)
  })

  it('the switch survives the sign-out wipe on purpose: it describes the build, not an account', async () => {
    const { DEV_FREE_TIER_KEY } = await import('./entitlement-store')
    expect(DEV_FREE_TIER_KEY.startsWith('bjt_')).toBe(false)
  })
})

describe('with a billing backend', () => {
  it('the switch does nothing: Pro is what the profile says', async () => {
    vi.doMock('../services/supabase/client', () => ({
      isSupabaseConfigured: true,
      supabase: null,
      requireSupabase: () => { throw new Error('not used in this test') },
    }))
    const { selectIsPro, DEV_FREE_TIER_KEY } = await import('./entitlement-store')
    localStorage.setItem(DEV_FREE_TIER_KEY, '1')
    expect(selectIsPro({ ...FREE, status: 'active' })).toBe(true)
    expect(selectIsPro(FREE)).toBe(false)
    vi.doUnmock('../services/supabase/client')
  })
})
