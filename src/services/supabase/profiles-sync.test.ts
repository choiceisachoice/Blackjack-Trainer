import { describe, it, expect, vi, beforeEach } from 'vitest'

// A minimal supabase-js shape: the sync reads with
// `from().select().eq().maybeSingle()` and writes with
// `from().update().eq().select()`. Every leaf is a spy so a test can decide
// what the cloud holds and see exactly what was written.
const maybeSingle = vi.fn()
const selectEq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq: selectEq }))
const writeSelect = vi.fn()
const updateEq = vi.fn(() => ({ select: writeSelect }))
const update = vi.fn(() => ({ eq: updateEq }))
const upsert = vi.fn()
const from = vi.fn(() => ({ select, update, upsert }))
const getSession = vi.fn()

vi.mock('./client', () => ({
  requireSupabase: () => ({ from, auth: { getSession } }),
  isSupabaseConfigured: true,
}))

import { syncProfileOnSignIn, pushProfileScalars } from './profiles-sync'
import { levelSystem } from '../level-system'
import { getClaimedStages, setClaimedStages } from '../stage-rewards'

const cloudRow = (overrides: Record<string, unknown> = {}) => ({
  level_xp: 0,
  sim_count: 0,
  sim_best_edge: 0,
  onboarding_seen: false,
  settings: {},
  ...overrides,
})

/** The object handed to `update()` on the most recent write. */
const lastWrite = () => (update.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]

describe('profiles-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    levelSystem.reload()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    maybeSingle.mockResolvedValue({ data: cloudRow(), error: null })
    writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  })

  it('writes the row with update, never upsert', async () => {
    // The row is created by the signup trigger and the client has no INSERT
    // policy; an upsert is refused before Postgres looks at the conflict.
    // That refusal is how six weeks of progress went missing.
    levelSystem.setTotalXP(1200)
    await syncProfileOnSignIn()
    expect(upsert).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(updateEq).toHaveBeenCalledWith('id', 'u1')
    expect(lastWrite()).toMatchObject({ level_xp: 1200 })
    expect(lastWrite()).not.toHaveProperty('id')
  })

  it('reconciles by max: a device with less does not lower the cloud', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 68000 }), error: null })
    levelSystem.setTotalXP(200)
    await syncProfileOnSignIn()
    expect(levelSystem.getTotalXP()).toBe(68000)
    expect(lastWrite()).toMatchObject({ level_xp: 68000 })
  })

  it('reconciles by max the other way: local progress reaches the cloud', async () => {
    maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 0 }), error: null })
    levelSystem.setTotalXP(68000)
    await syncProfileOnSignIn()
    expect(lastWrite()).toMatchObject({ level_xp: 68000 })
  })

  it('unions the claimed stages and carries unknown settings keys through', async () => {
    maybeSingle.mockResolvedValue({
      data: cloudRow({ settings: { claimed_stages: ['rules'], theme: 'felt' } }),
      error: null,
    })
    setClaimedStages(['hi-lo'])
    await syncProfileOnSignIn()
    expect(new Set(getClaimedStages())).toEqual(new Set(['rules', 'hi-lo']))
    const settings = lastWrite().settings as { claimed_stages: string[]; theme: string }
    expect(settings.theme).toBe('felt')
    expect(new Set(settings.claimed_stages)).toEqual(new Set(['rules', 'hi-lo']))
  })

  it('treats a write that matched no row as a failure', async () => {
    writeSelect.mockResolvedValue({ data: [], error: null })
    await expect(syncProfileOnSignIn()).rejects.toThrow(/row not found/)
  })

  it('surfaces a refused write instead of swallowing it', async () => {
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(syncProfileOnSignIn()).rejects.toThrow('permission denied')
  })

  it('still restores the local copy when the write back fails', async () => {
    // The order matters: local is hydrated from the merge before the cloud is
    // written, so a refused write costs the cloud a push, not the device its
    // level.
    maybeSingle.mockResolvedValue({ data: cloudRow({ level_xp: 5000 }), error: null })
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(syncProfileOnSignIn()).rejects.toThrow()
    expect(levelSystem.getTotalXP()).toBe(5000)
  })

  it('pushProfileScalars writes the local values with update', async () => {
    levelSystem.setTotalXP(450)
    pushProfileScalars()
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(upsert).not.toHaveBeenCalled()
    expect(lastWrite()).toMatchObject({ level_xp: 450 })
  })

  it('pushProfileScalars never throws into the caller', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    writeSelect.mockResolvedValue({ data: null, error: new Error('permission denied') })
    expect(() => pushProfileScalars()).not.toThrow()
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    error.mockRestore()
  })

  it('does nothing without a session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await syncProfileOnSignIn()
    expect(from).not.toHaveBeenCalled()
  })
})
