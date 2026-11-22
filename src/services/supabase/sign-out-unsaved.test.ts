import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { TrainingSessionResult } from '../stats-types'

/**
 * Signing out wipes the device, and a session still waiting for its upload
 * exists nowhere else.
 *
 * It used to be deleted without a word. Now the sign-out sends what is
 * waiting first, and if that cannot be done it wipes nothing, signs nobody
 * out and says so — the caller asks, and only an explicit "sign out anyway"
 * gives the sessions up.
 *
 * The pending list, the device's session store and the before-sign-out
 * registry are the real ones. The cloud is a stand-in that can be told to
 * fail; the wipe is a spy, so "nothing was wiped" can be asserted.
 */

const h = vi.hoisted(() => ({
  calls: [] as string[],
  uploadFails: false,
  sent: [] as string[][],
  owner: 'user-1' as string | null,
}))

vi.mock('./client', () => ({
  isSupabaseConfigured: true,
  supabase: null,
  requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }) } }),
}))

const serverSignOut = vi.hoisted(() => vi.fn(async () => {}))
const setAuthState = vi.hoisted(() => vi.fn())
vi.mock('../../store/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      status: 'signedIn',
      user: { id: 'user-1' },
      signOut: () => { h.calls.push('server'); return serverSignOut() },
    }),
    setState: setAuthState,
  },
  isSupabaseConfigured: true,
}))

vi.mock('../storage/local-reset', () => ({
  clearLocalAppData: () => { h.calls.push('wipe') },
  getLocalOwner: () => h.owner,
  setLocalOwner: vi.fn(),
}))

vi.mock('./supabase-storage', () => ({
  SupabaseStorageService: class {
    async saveMany(sessions: { id: string }[]) {
      h.calls.push('sessions')
      if (h.uploadFails) throw new TypeError('Failed to fetch')
      h.sent.push(sessions.map(s => s.id))
    }
  },
}))

const pushProfileScalarsNow = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./profiles-sync', () => ({
  pushProfileScalars: vi.fn(),
  pushProfileScalarsNow: () => { h.calls.push('profile'); return pushProfileScalarsNow() },
  syncProfileOnSignIn: vi.fn(async () => {}),
  resetProfileSync: vi.fn(),
}))

const syncAchievements = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('./achievements-sync', () => ({
  syncAchievementsOnSignIn: () => { h.calls.push('achievements'); return syncAchievements() },
}))

import { signOutAndClearLocal } from './cloud-sync'
import { localStorageService } from '../storage/storage-service'
import { getPendingSessionIds, markSessionPending, resetPendingSessions } from '../storage/pending-sessions'
import { registerBeforeSignOut } from '../storage/before-sign-out'

function session(id = crypto.randomUUID()): TrainingSessionResult {
  return {
    id,
    mode: 'speedDrill',
    timestamp: '2026-11-20T10:00:00.000Z',
    durationSeconds: 90,
    totalQuestions: 20,
    correctAnswers: 18,
    accuracy: 0.9,
    bestStreak: 9,
  } as unknown as TrainingSessionResult
}

/** A finished session that is on the device and not in the cloud. */
async function leaveWaiting(): Promise<string> {
  const s = session()
  await localStorageService.saveSessionResult(s)
  markSessionPending(s.id)
  return s.id
}

function setBrowserOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

beforeEach(() => {
  localStorage.clear()
  resetPendingSessions()
  h.calls.length = 0
  h.sent.length = 0
  h.uploadFails = false
  h.owner = 'user-1'
  serverSignOut.mockClear()
  setAuthState.mockClear()
  pushProfileScalarsNow.mockReset()
  pushProfileScalarsNow.mockResolvedValue(undefined)
  syncAchievements.mockReset()
  syncAchievements.mockResolvedValue(undefined)
  setBrowserOnline(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  setBrowserOnline(true)
})

describe('signing out with sessions still waiting for the cloud', () => {
  it('uploads them — and the level and the achievements — before anything is wiped', async () => {
    const id = await leaveWaiting()

    await expect(signOutAndClearLocal()).resolves.toBe('signedOut')

    expect(h.sent).toEqual([[id]])
    expect(pushProfileScalarsNow).toHaveBeenCalledOnce()
    expect(syncAchievements).toHaveBeenCalledOnce()
    const wipe = h.calls.indexOf('wipe')
    expect(wipe).toBeGreaterThan(-1)
    for (const step of ['sessions', 'profile', 'achievements']) {
      expect(h.calls.indexOf(step), step).toBeGreaterThan(-1)
      expect(h.calls.indexOf(step), step).toBeLessThan(wipe)
    }
    expect(h.calls.indexOf('wipe')).toBeLessThan(h.calls.indexOf('server'))
  })

  it('wipes nothing and signs nobody out when the upload fails', async () => {
    const id = await leaveWaiting()
    h.uploadFails = true

    await expect(signOutAndClearLocal()).resolves.toBe('unsaved')

    expect(h.calls).not.toContain('wipe')
    expect(h.calls).not.toContain('server')
    expect(setAuthState).not.toHaveBeenCalled()
    // Still there, still waiting: the person stays signed in and loses nothing.
    expect(getPendingSessionIds()).toEqual([id])
    expect((await localStorageService.getAllSessionResults()).map(s => s.id)).toEqual([id])
  })

  it('does not try at all while the browser says it is offline', async () => {
    await leaveWaiting()
    setBrowserOnline(false)

    await expect(signOutAndClearLocal()).resolves.toBe('unsaved')

    expect(h.calls).toEqual([])
  })

  it('counts sessions the device cannot send as this account as unsaved, too', async () => {
    // The push refuses data that is not the signed-in account's and resolves
    // without sending. Reading that as "uploaded" would wipe them.
    await leaveWaiting()
    h.owner = 'somebody-else'

    await expect(signOutAndClearLocal()).resolves.toBe('unsaved')

    expect(h.sent).toEqual([])
    expect(h.calls).not.toContain('wipe')
  })

  it('signs out regardless when told to give them up, without another attempt', async () => {
    await leaveWaiting()
    h.uploadFails = true

    await expect(signOutAndClearLocal({ discardUnsaved: true })).resolves.toBe('signedOut')

    expect(h.calls).toEqual(['wipe', 'server'])
    expect(setAuthState).toHaveBeenCalledWith({ status: 'signedOut', session: null, user: null })
  })

  it('does not hold the sign-out when only the level push fails', async () => {
    // Deliberate, and stated in `signOutAndClearLocal`: the sessions are in
    // the cloud, and the question the caller asks is about sessions.
    await leaveWaiting()
    pushProfileScalarsNow.mockRejectedValue(new Error('permission denied'))

    await expect(signOutAndClearLocal()).resolves.toBe('signedOut')
    expect(h.calls).toContain('wipe')
  })

  it('uploads a session that a before-sign-out task has only just recorded', async () => {
    // The casino table in play: ended and recorded by its registered task,
    // then sent, then wiped.
    let recorded = ''
    const off = registerBeforeSignOut(async () => { recorded = await leaveWaiting() })

    await expect(signOutAndClearLocal()).resolves.toBe('signedOut')
    off()

    expect(h.sent).toEqual([[recorded]])
    expect(h.calls.indexOf('sessions')).toBeLessThan(h.calls.indexOf('wipe'))
  })
})

describe('signing out with nothing waiting', () => {
  it('makes no upload and signs out', async () => {
    await expect(signOutAndClearLocal()).resolves.toBe('signedOut')
    expect(h.calls).toEqual(['wipe', 'server'])
  })
})
