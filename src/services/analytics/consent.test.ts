import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { configured: true }
vi.mock('../supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  supabase: null,
}))

import { analyticsAllowed } from './consent'

function nav(over: Partial<Navigator & { globalPrivacyControl?: boolean }> = {}): Navigator {
  return { webdriver: false, doNotTrack: null, ...over } as unknown as Navigator
}

beforeEach(() => { state.configured = true })

describe('analyticsAllowed', () => {
  it('allows an ordinary browser when Supabase is configured', () => {
    expect(analyticsAllowed(nav())).toBe(true)
  })

  it('refuses without Supabase — offline builds, tests, the demo recorder', () => {
    state.configured = false
    expect(analyticsAllowed(nav())).toBe(false)
  })

  it('refuses an automated browser', () => {
    expect(analyticsAllowed(nav({ webdriver: true }))).toBe(false)
  })

  it('honours Global Privacy Control', () => {
    expect(analyticsAllowed(nav({ globalPrivacyControl: true }))).toBe(false)
    expect(analyticsAllowed(nav({ globalPrivacyControl: false }))).toBe(true)
  })

  it('honours Do Not Track', () => {
    expect(analyticsAllowed(nav({ doNotTrack: '1' }))).toBe(false)
    expect(analyticsAllowed(nav({ doNotTrack: '0' }))).toBe(true)
    expect(analyticsAllowed(nav({ doNotTrack: 'unspecified' }))).toBe(true)
  })

  it('refuses with no navigator at all (prerender)', () => {
    expect(analyticsAllowed(null)).toBe(false)
  })
})
