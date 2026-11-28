import { describe, it, expect, vi, beforeEach } from 'vitest'

// A configured client. Reads: from().select().eq() → { data, error }.
// Writes: from().upsert() → { error }.
let cloudRows: Record<string, unknown>[] = []
const upsert = vi.fn(async (..._args: unknown[]) => ({ error: null as unknown }))
const selectEq = vi.fn(async () => ({ data: cloudRows, error: null }))
const select = vi.fn(() => ({ eq: selectEq }))
const from = vi.fn(() => ({ upsert, select }))
const getSession = vi.fn()

vi.mock('./client', () => ({
  requireSupabase: () => ({ from, auth: { getSession } }),
  isSupabaseConfigured: true,
}))

import {
  mergeById,
  fetchCloudSessions,
  upsertCloudSessions,
  removeCloudSession,
  flushPendingDeletes,
  readPendingDeletes,
  PENDING_DELETES_KEY,
  type CloudTrackedSession,
} from './bankroll-sync'
import { setLocalOwner } from '../storage/local-owner'
import { runBeforeSignOut } from '../storage/before-sign-out'
import type { TrackedSession } from '../../store/bankroll-tracker-store'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

function mk(overrides: Partial<CloudTrackedSession> = {}): CloudTrackedSession {
  return {
    id: ID,
    date: '2026-11-01',
    casino: 'Bellagio',
    result: 500,
    hoursPlayed: 3,
    notes: '',
    createdAt: 1_000,
    ...overrides,
  }
}

/** A cloud row as PostgREST returns it. */
function cloudRow(over: { id?: string; result?: number; updated_at?: string; deleted_at?: string | null } = {}) {
  return {
    id: over.id ?? ID,
    user_id: 'u1',
    played_on: '2026-11-01',
    casino: 'Bellagio',
    hours_played: 3,
    result: String(over.result ?? 500),
    meta: { notes: '' },
    created_at: new Date(1_000).toISOString(),
    updated_at: over.updated_at ?? new Date(2_000).toISOString(),
    deleted_at: over.deleted_at ?? null,
  }
}

const sentRows = () => upsert.mock.calls.flatMap(c => {
  const rows = c[0]
  return Array.isArray(rows) ? rows as { id: string }[] : [rows as { id: string }]
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  cloudRows = []
  upsert.mockImplementation(async () => ({ error: null }))
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
  setLocalOwner('u1')
})

describe('mergeById: newest wins, tombstones never resurrect', () => {
  it('a delete on device A beats the stale copy device B still holds', () => {
    const staleOnB = mk({ result: 500, updatedAt: 5_000 })
    const tombstone = mk({ result: 0, updatedAt: 3_000, deletedAt: 3_000 })
    // Even a copy on B "edited" later than the delete stays deleted.
    expect(mergeById([staleOnB], [tombstone])).toEqual([])
  })

  it('a newer edit from another device wins over an older local copy', () => {
    const localOld = mk({ result: 100, updatedAt: 1_500 })
    const cloudNew = mk({ result: 900, updatedAt: 2_000 })
    expect(mergeById([localOld], [cloudNew])).toEqual([cloudNew])
  })

  it('a newer local edit wins over an older cloud copy', () => {
    const localNew = mk({ result: 900, updatedAt: 9_000 })
    const cloudOld = mk({ result: 100, updatedAt: 2_000 })
    expect(mergeById([localNew], [cloudOld])).toEqual([localNew])
  })

  it('a local copy from before edits were timed counts as of createdAt', () => {
    const legacyLocal = mk({ result: 100 }) // createdAt 1_000, no updatedAt
    const cloud = mk({ result: 500, updatedAt: 2_000 })
    expect(mergeById([legacyLocal], [cloud])[0].result).toBe(500)
  })

  it('a cloud row without the new columns (migration not pushed) is live, and a tie keeps the device copy', () => {
    const local = mk({ result: 700 })
    const oldCloud = mk({ result: 500 })
    expect(mergeById([local], [oldCloud])).toEqual([local])
  })

  it('a session deleted here whose tombstone has not landed stays deleted', () => {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([ID]))
    expect(mergeById([], [mk({ updatedAt: 2_000 })])).toEqual([])
  })

  it('keeps local-only and cloud-only sessions', () => {
    const merged = mergeById([mk({ id: ID })], [mk({ id: ID2, updatedAt: 2_000 })])
    expect(merged.map(s => s.id).sort()).toEqual([ID, ID2])
    expect(merged.every(s => !('deletedAt' in s))).toBe(true)
  })
})

describe('the sign-in merge sends only the copies that won', () => {
  it('does not push a stale copy over a newer edit, nor a tombstoned row', async () => {
    cloudRows = [
      cloudRow({ id: ID, result: 900, updated_at: new Date(5_000).toISOString() }),
      cloudRow({ id: ID2, result: 0, deleted_at: new Date(4_000).toISOString() }),
    ]
    const cloud = await fetchCloudSessions('u1')
    const local: TrackedSession[] = [
      mk({ id: ID, result: 100, updatedAt: 1_500 }),
      mk({ id: ID2, result: 500, updatedAt: 9_000 }),
    ]
    expect(mergeById(local, cloud).map(s => s.result)).toEqual([900])
    await upsertCloudSessions('u1', local)
    expect(sentRows()).toEqual([])
  })

  it('pushes a newer local edit and a local-only session', async () => {
    cloudRows = [cloudRow({ id: ID, result: 100, updated_at: new Date(2_000).toISOString() })]
    await fetchCloudSessions('u1')
    await upsertCloudSessions('u1', [mk({ id: ID, result: 900, updatedAt: 9_000 }), mk({ id: ID2 })])
    expect(sentRows().map(r => r.id).sort()).toEqual([ID, ID2])
  })
})

describe('an offline delete is retried until it lands', () => {
  it('stays pending after a failure and goes out on the next fetch', async () => {
    upsert.mockImplementationOnce(async () => ({ error: { code: 'NETWORK', message: 'Failed to fetch' } }))
    removeCloudSession(ID)
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 0)) // let the failed attempt settle
    expect(readPendingDeletes().has(ID)).toBe(true)

    // The cloud still holds the row live; the next page load must not bring it back.
    cloudRows = [cloudRow({ id: ID })]
    const cloud = await fetchCloudSessions('u1')
    expect(upsert).toHaveBeenCalledTimes(2)
    const tomb = upsert.mock.calls[1][0] as Record<string, unknown>
    expect(tomb.id).toBe(ID)
    expect(tomb.deleted_at).toEqual(expect.any(String))
    // Nothing the person entered survives the delete: an upsert keeps every
    // column it does not name, so each one has to be named and blanked.
    expect(tomb).toMatchObject({
      casino: null, hours_played: 0, result: 0,
      starting_bankroll: null, final_bankroll: null, meta: {},
    })
    expect(readPendingDeletes().size).toBe(0)
    // The tombstone went out before the read, so a real cloud answers with it.
    expect(selectEq).toHaveBeenCalledAfter(upsert)
    expect(cloud).toHaveLength(1)
  })

  it('retries when the browser comes back online', async () => {
    upsert.mockImplementationOnce(async () => ({ error: { message: 'offline' } }))
    removeCloudSession(ID)
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1))
    await new Promise(r => setTimeout(r, 0))
    expect(readPendingDeletes().has(ID)).toBe(true)
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(readPendingDeletes().size).toBe(0))
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('is sent before a sign-out wipes the waiting list', async () => {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([ID]))
    await runBeforeSignOut()
    expect(sentRows().map(r => r.id)).toEqual([ID])
    expect(readPendingDeletes().size).toBe(0)
  })

  it('is not sent under another account', async () => {
    setLocalOwner('someone-else')
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([ID]))
    await flushPendingDeletes()
    expect(upsert).not.toHaveBeenCalled()
    expect(readPendingDeletes().has(ID)).toBe(true)
  })
})
