import { describe, it, expect, vi, beforeEach } from 'vitest'

const { select, upsert, getSession } = vi.hoisted(() => ({
  select: vi.fn(),
  upsert: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('./client', () => ({
  requireSupabase: () => ({
    from: () => ({ select: () => ({ eq: select }), upsert }),
    auth: { getSession },
  }),
  isSupabaseConfigured: true,
}))

import { syncAchievementsOnSignIn } from './achievements-sync'
import { achievementEngine } from '../achievements/achievement-engine'
import { ALL_ACHIEVEMENTS } from '../achievements/achievement-list'
import { setLocalOwner } from '../storage/local-owner'

const remoteRow = { achievement_id: ALL_ACHIEVEMENTS[0].id, unlocked_at: '2026-11-01T10:00:00.000Z' }

describe('the achievements merge and whose device it is', () => {
  beforeEach(() => {
    localStorage.clear()
    achievementEngine.reloadFromStorage()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'user-a' } } } })
    upsert.mockResolvedValue({ error: null })
  })

  it('merges the cloud unlocks onto the device of the account that asked', async () => {
    setLocalOwner('user-a')
    select.mockResolvedValue({ data: [remoteRow], error: null })
    await syncAchievementsOnSignIn()
    expect(achievementEngine.getUnlocked().map(u => u.achievementId)).toContain(remoteRow.achievement_id)
  })

  it('drops an answer that arrives after a sign-out wiped the device', async () => {
    setLocalOwner('user-a')
    select.mockImplementation(async () => {
      localStorage.clear() // the wipe, while the request was out
      achievementEngine.reloadFromStorage()
      return { data: [remoteRow], error: null }
    })
    await syncAchievementsOnSignIn()
    expect(achievementEngine.getUnlocked()).toEqual([])
    expect(upsert).not.toHaveBeenCalled()
  })

  it('drops an answer for an account another one has replaced', async () => {
    setLocalOwner('user-a')
    select.mockImplementation(async () => {
      setLocalOwner('user-b')
      return { data: [remoteRow], error: null }
    })
    await syncAchievementsOnSignIn()
    expect(achievementEngine.getUnlocked()).toEqual([])
  })
})
