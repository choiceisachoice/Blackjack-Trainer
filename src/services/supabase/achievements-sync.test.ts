import { describe, it, expect } from 'vitest'
import { pushNewUnlocks, syncAchievementsOnSignIn, clearCloudAchievements } from './achievements-sync'
import { ALL_ACHIEVEMENTS } from '../achievements/achievement-list'

/**
 * With Supabase unconfigured (the default in the test env — see vitest.config
 * `test.env`), every entry point must be a safe no-op that never reaches the
 * network client. The network paths themselves are covered by integration
 * testing against a live project, not here.
 */
describe('achievements-sync (Supabase unconfigured)', () => {
  it('pushNewUnlocks is a no-op and does not throw', () => {
    expect(() => pushNewUnlocks([ALL_ACHIEVEMENTS[0]])).not.toThrow()
    expect(() => pushNewUnlocks([])).not.toThrow()
  })

  it('syncAchievementsOnSignIn resolves without touching the cloud', async () => {
    await expect(syncAchievementsOnSignIn()).resolves.toBeUndefined()
  })

  it('clearCloudAchievements resolves without touching the cloud', async () => {
    await expect(clearCloudAchievements()).resolves.toBeUndefined()
  })
})
