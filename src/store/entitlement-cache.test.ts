import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The device-side hint for the entitlement.
 *
 * Its own file because it needs what `entitlement-store.test.ts` deliberately
 * does not have: a Supabase client that answers, and a store module imported
 * fresh for each case — the hint is read once, when the module is evaluated,
 * which is the moment a page load opens.
 */

const CACHE_KEY = 'bjt_entitlement'
const NEXT_YEAR = Date.now() + 365 * 24 * 60 * 60 * 1000

/** What the fake `profiles` query answers; swapped per test. */
let profile: { data: unknown; error: unknown } = { data: null, error: null }
let userId: string | null = 'user-1'

vi.mock('../services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => profile }) }) }),
  },
  requireSupabase: () => { throw new Error('not used in this test') },
}))

async function freshStore() {
  vi.resetModules()
  return import('./entitlement-store')
}

beforeEach(() => {
  localStorage.clear()
  profile = { data: null, error: null }
  userId = 'user-1'
})

describe('the entitlement a page load opens with', () => {
  it('is free when the device has never been told otherwise', async () => {
    const { useEntitlementStore, selectIsPro } = await freshStore()
    expect(useEntitlementStore.getState().status).toBe('free')
    expect(selectIsPro(useEntitlementStore.getState())).toBe(false)
  })

  it('is what the server last confirmed, so a subscriber is not drawn as free while the sync runs', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: false }))
    const { useEntitlementStore, selectIsPro } = await freshStore()
    const state = useEntitlementStore.getState()
    expect(selectIsPro(state)).toBe(true)
    // But not confirmed: the account page keeps its own loading state.
    expect(state.loaded).toBe(false)
  })

  it('never counts the hint as a subscription — nothing about selling may rest on it', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: false }))
    const { useEntitlementStore, selectHasSubscription } = await freshStore()
    expect(selectHasSubscription(useEntitlementStore.getState())).toBe(false)
  })

  it('still expires with the paid period', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: Date.now() - 1000, cancelAtPeriodEnd: false }))
    const { useEntitlementStore, selectIsPro } = await freshStore()
    expect(selectIsPro(useEntitlementStore.getState())).toBe(false)
  })

  it('ignores a hint it cannot read', async () => {
    for (const junk of ['{', '"active"', '{"status":"active"}', '{"userId":7,"status":"active"}']) {
      localStorage.setItem(CACHE_KEY, junk)
      const { useEntitlementStore } = await freshStore()
      expect(useEntitlementStore.getState().status, junk).toBe('free')
    }
  })
})

describe('the server’s answer', () => {
  it('replaces the hint and is remembered for the next load', async () => {
    const { useEntitlementStore, selectIsPro, selectHasSubscription } = await freshStore()
    profile = { data: { subscription_status: 'active', current_period_end: new Date(NEXT_YEAR).toISOString(), cancel_at_period_end: false }, error: null }
    await useEntitlementStore.getState().loadEntitlement()

    expect(selectIsPro(useEntitlementStore.getState())).toBe(true)
    expect(selectHasSubscription(useEntitlementStore.getState())).toBe(true)
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toMatchObject({ userId: 'user-1', status: 'active' })
  })

  it('takes Pro away at once when the subscription is gone, whatever the device remembered', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: false }))
    const { useEntitlementStore, selectIsPro } = await freshStore()
    profile = { data: { subscription_status: 'canceled', current_period_end: null, cancel_at_period_end: false }, error: null }
    await useEntitlementStore.getState().loadEntitlement()

    expect(selectIsPro(useEntitlementStore.getState())).toBe(false)
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).status).toBe('canceled')
  })

  it('falls back to free when the question could not be asked — an unanswered question is not a yes', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: false }))
    const { useEntitlementStore, selectIsPro } = await freshStore()
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    profile = { data: null, error: new Error('network') }
    await useEntitlementStore.getState().loadEntitlement()
    quiet.mockRestore()

    const state = useEntitlementStore.getState()
    expect(selectIsPro(state)).toBe(false)
    expect(state.loaded).toBe(true)
  })

  it('forgets the hint when nobody is signed in, and on reset', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: false }))
    const { useEntitlementStore } = await freshStore()
    userId = null
    await useEntitlementStore.getState().loadEntitlement()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(useEntitlementStore.getState().status).toBe('free')

    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: 'user-1', status: 'active', currentPeriodEnd: NEXT_YEAR, cancelAtPeriodEnd: false }))
    useEntitlementStore.getState().reset()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('is stored under the prefix the sign-out wipe clears', () => {
    // The wipe removes every `bjt_` key that is not a device preference. A
    // hint that outlived it would greet the next person on this device as Pro.
    expect(CACHE_KEY.startsWith('bjt_')).toBe(true)
  })
})
