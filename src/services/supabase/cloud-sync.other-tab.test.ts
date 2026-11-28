import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * A sign-out in another tab, then somebody else signing in.
 *
 * User X has tabs A and B. X signs out in A: A's storage and engines are
 * wiped, B's engines still hold X's level, achievements and bankroll log in
 * memory. Y signs in; B receives SIGNED_IN and finds storage ownerless — not
 * foreign by the owner check — and its merge used to push X's XP (max-merged,
 * then made permanent by the database trigger) and X's real-money log into
 * Y's account. B must reload instead, and merge nothing while it waits to.
 */

const syncProfileOnSignIn = vi.fn(async () => {})
const syncAchievementsOnSignIn = vi.fn(async () => {})
const fetchCloudSessions = vi.fn(async () => [])

vi.mock('./client', () => {
  // Anything chained off `from()` resolves to an empty answer.
  const anything = (): unknown => new Proxy(() => {}, {
    get: (_t, key) => key === 'then'
      ? (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      : () => anything(),
  })
  return {
    isSupabaseConfigured: true,
    supabase: null,
    requireSupabase: () => ({
      from: () => anything(),
      auth: { getSession: async () => ({ data: { session: { user: { id: 'user-y', created_at: '2026-01-01T00:00:00Z' } } } }) },
    }),
  }
})

vi.mock('../../store/auth-store', () => ({
  useAuthStore: Object.assign(() => 'signedIn', {
    getState: () => ({ status: 'signedIn', user: { id: 'user-y' }, session: null, signOut: async () => {} }),
    setState: () => {},
    subscribe: () => () => {},
  }),
}))

vi.mock('./profiles-sync', () => ({
  syncProfileOnSignIn,
  resetProfileSync: () => {},
  pushProfileScalars: () => {},
  pushProfileScalarsNow: async () => {},
}))

vi.mock('./achievements-sync', () => ({
  syncAchievementsOnSignIn,
  pushNewUnlocks: () => {},
  clearCloudAchievements: async () => {},
}))

vi.mock('./bankroll-sync', async importOriginal => ({
  ...(await importOriginal<typeof import('./bankroll-sync')>()),
  fetchCloudSessions,
  upsertCloudSessions: async () => {},
}))

const OWNER_KEY = 'bjt_local_owner'

/** A fresh page holding X's data, with its reload stood in for. */
async function openTabOf(owner: string) {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem(OWNER_KEY, owner)
  const mod = await import('./cloud-sync')
  // Assigned, not spied: the instances of earlier tests keep their listeners
  // on `window`, and a restored spy would let them navigate jsdom.
  const reload = vi.fn()
  mod.tabReload.reload = reload
  return { ...mod, reload }
}

/** What the browser does in tab B when tab A signs out. */
function signOutInAnotherTab(previous: string) {
  localStorage.removeItem(OWNER_KEY)
  window.dispatchEvent(new StorageEvent('storage', {
    key: OWNER_KEY, oldValue: previous, newValue: null, storageArea: localStorage,
  }))
}

describe('a tab whose account was signed out in another tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('reloads as soon as the other tab signs out', async () => {
    const tab = await openTabOf('user-x')
    signOutInAnotherTab('user-x')
    expect(tab.reload).toHaveBeenCalledOnce()
  })

  it('merges nothing from its memory into the next account', async () => {
    const tab = await openTabOf('user-x')
    signOutInAnotherTab('user-x')

    await tab.handleSignedIn()

    expect(syncProfileOnSignIn).not.toHaveBeenCalled()
    expect(syncAchievementsOnSignIn).not.toHaveBeenCalled()
    expect(fetchCloudSessions).not.toHaveBeenCalled()
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })

  it('reloads a page restored from the back-forward cache after the owner changed', async () => {
    const tab = await openTabOf('user-x')
    localStorage.setItem(OWNER_KEY, 'user-y') // while frozen: no storage event
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(tab.reload).toHaveBeenCalledOnce()
  })

  it('ignores a write of the same owner and the tab’s own sign-in', async () => {
    const tab = await openTabOf('user-y')
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'bjt_level_xp', oldValue: '10', newValue: '20', storageArea: localStorage,
    }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    await tab.handleSignedIn()

    expect(tab.reload).not.toHaveBeenCalled()
    expect(syncProfileOnSignIn).toHaveBeenCalledOnce()
  })
})
