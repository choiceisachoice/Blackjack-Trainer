import { describe, it, expect } from 'vitest'
import { syncProfileOnSignIn, pushProfileScalars } from './profiles-sync'

/**
 * With Supabase unconfigured (the default in the test env — see vitest.config
 * `test.env`), both entry points must be safe no-ops that never reach the
 * network client. The network paths are covered by integration testing.
 */
describe('profiles-sync (Supabase unconfigured)', () => {
  it('pushProfileScalars is a no-op and does not throw', () => {
    expect(() => pushProfileScalars()).not.toThrow()
  })

  it('syncProfileOnSignIn resolves without touching the cloud', async () => {
    await expect(syncProfileOnSignIn()).resolves.toBeUndefined()
  })
})
