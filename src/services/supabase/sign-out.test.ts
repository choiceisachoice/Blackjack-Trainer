import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Signing out has to protect the device before it talks to anyone.
 *
 * Two things hang off this, and neither may depend on a network call:
 *
 *  1. **The local wipe.** `handleSignedIn` treats whatever sits in localStorage
 *     as belonging to the account that signs in *next*. Skipping the wipe does
 *     not merely leave clutter — the next person to sign in on this machine has
 *     the previous user's training history, achievements, level and real-money
 *     bankroll log pushed into their cloud account.
 *  2. **The stored session.** supabase-js returns early from `_signOut` when
 *     the API call fails with anything other than 401/403/404, *before* it
 *     removes the persisted session (`GoTrueClient._signOut`). So on a flaky
 *     connection the old order left the user still signed in — a sign-out that
 *     did not sign anyone out.
 *
 * The order these run in is the fix, so the order is what these tests pin.
 */

const signOut = vi.fn<() => Promise<void>>()
const clearLocalAppData = vi.fn()
const calls: string[] = []

vi.mock('../../store/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ signOut: () => { calls.push('server'); return signOut() } }),
    setState: vi.fn(),
  },
  isSupabaseConfigured: false,
}))

vi.mock('../storage/local-reset', () => ({
  clearLocalAppData: () => { calls.push('wipe'); clearLocalAppData() },
  getLocalOwner: () => null,
  setLocalOwner: vi.fn(),
}))

const AUTH_KEY = 'sb-abcdefghijklm-auth-token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'still-valid' }))
  localStorage.setItem('bjt_unrelated', 'keep-me')
  calls.length = 0
  signOut.mockReset()
  clearLocalAppData.mockReset()
  signOut.mockResolvedValue(undefined)
})

describe('signing out when the server cannot be reached', () => {
  it('still wipes the local data', async () => {
    const { signOutAndClearLocal } = await import('./cloud-sync')
    signOut.mockRejectedValue(new Error('offline'))

    await signOutAndClearLocal()

    expect(clearLocalAppData).toHaveBeenCalledOnce()
  })

  it('still forgets the stored session, so a reload does not sign you back in', async () => {
    const { signOutAndClearLocal } = await import('./cloud-sync')
    signOut.mockRejectedValue(new Error('offline'))

    await signOutAndClearLocal()

    expect(localStorage.getItem(AUTH_KEY)).toBeNull()
  })

  it('does not reject, because the caller has to navigate away regardless', async () => {
    const { signOutAndClearLocal } = await import('./cloud-sync')
    signOut.mockRejectedValue(new Error('offline'))

    await expect(signOutAndClearLocal()).resolves.toBeUndefined()
  })
})

describe('the order it does things in', () => {
  it('wipes before it asks the server, never after', async () => {
    // The old order was `await signOut()` *then* wipe, so a failed call skipped
    // the wipe entirely. This is that regression, stated as an assertion.
    const { signOutAndClearLocal } = await import('./cloud-sync')
    await signOutAndClearLocal()

    expect(calls.indexOf('wipe')).toBeLessThan(calls.indexOf('server'))
  })

  it('asks the server while the token still exists', async () => {
    // Forgetting the session first would leave supabase-js with no access token
    // to revoke, quietly turning a global sign-out into a local one.
    const { signOutAndClearLocal } = await import('./cloud-sync')
    let tokenAtServerCall: string | null = 'not-called'
    signOut.mockImplementation(async () => { tokenAtServerCall = localStorage.getItem(AUTH_KEY) })

    await signOutAndClearLocal()

    expect(tokenAtServerCall).not.toBeNull()
    expect(tokenAtServerCall).not.toBe('not-called')
  })

  it('leaves keys that are not an auth session alone', async () => {
    const { signOutAndClearLocal } = await import('./cloud-sync')
    await signOutAndClearLocal()
    expect(localStorage.getItem('bjt_unrelated')).toBe('keep-me')
  })
})
