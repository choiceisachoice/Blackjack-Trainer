import { describe, it, expect, vi, beforeEach } from 'vitest'

// A configured client: the push is fire-and-forget, so the spies are what a
// test can see of it.
const upsert = vi.fn(async () => ({ error: null }))
const deleteEqId = vi.fn(async () => ({ error: null }))
const deleteEqUser = vi.fn(() => ({ eq: deleteEqId }))
const del = vi.fn(() => ({ eq: deleteEqUser }))
const from = vi.fn(() => ({ upsert, delete: del }))
const getSession = vi.fn()

vi.mock('./client', () => ({
  requireSupabase: () => ({ from, auth: { getSession } }),
  isSupabaseConfigured: true,
}))

import { pushSession, removeCloudSession } from './bankroll-sync'
import { setLocalOwner, LOCAL_OWNER_KEY } from '../storage/local-owner'
import type { TrackedSession } from '../../store/bankroll-tracker-store'

const session: TrackedSession = {
  id: '11111111-1111-4111-8111-111111111111',
  date: '2026-11-01',
  casino: 'Bellagio',
  result: -1200,
  hoursPlayed: 3,
  notes: '',
  createdAt: 1_700_000_000_000,
}

/** Let the fire-and-forget work reach its first request, if it makes one. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * A tab still holding the previous account's tracker — signed out in another
 * tab, then someone else signed in — must not file that real-money log under
 * the new account. The push writes under the session's user id, so the
 * device's owner is what decides, as it does for the training sessions.
 */
describe('bankroll-sync: only the device owner’s log goes up', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-y' } } } })
  })

  it('pushes when the device belongs to the signed-in account', async () => {
    setLocalOwner('user-y')
    pushSession(session)
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledOnce())
    expect((upsert.mock.calls[0] as unknown as [Array<{ user_id: string }>])[0][0].user_id).toBe('user-y')
  })

  it('sends nothing when the device holds another account’s data', async () => {
    setLocalOwner('user-x')
    pushSession(session)
    removeCloudSession(session.id)
    await flush()
    await flush()
    expect(upsert).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('sends nothing before the sign-in merge has claimed the device', async () => {
    localStorage.removeItem(LOCAL_OWNER_KEY)
    pushSession(session)
    await flush()
    await flush()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('deletes for the owner, as a tombstone filed under the owner', async () => {
    setLocalOwner('user-y')
    removeCloudSession(session.id)
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledOnce())
    const tomb = (upsert.mock.calls[0] as unknown as [{ id: string; user_id: string; deleted_at: string }])[0]
    expect(tomb.id).toBe(session.id)
    expect(tomb.user_id).toBe('user-y')
    expect(typeof tomb.deleted_at).toBe('string')
    expect(del).not.toHaveBeenCalled()
  })

  it('falls back to a hard delete where the column does not exist yet (migration not pushed)', async () => {
    setLocalOwner('user-y')
    upsert.mockResolvedValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'deleted_at' column" } } as never)
    removeCloudSession(session.id)
    await vi.waitFor(() => expect(deleteEqId).toHaveBeenCalledWith('id', session.id))
    expect(deleteEqUser).toHaveBeenCalledWith('user_id', 'user-y')
  })
})
