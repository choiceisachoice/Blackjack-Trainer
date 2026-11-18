import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { configured: true }
vi.mock('../supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  supabase: null,
}))

import { analyticsAllowed, consentQuestionApplies } from './consent'
import { CONSENT_KEY, setConsent, clearConsent } from './consent-choice'

function nav(over: Partial<Navigator & { globalPrivacyControl?: boolean }> = {}): Navigator {
  return { webdriver: false, doNotTrack: null, ...over } as unknown as Navigator
}

// The visitor has said yes, unless a test says otherwise.
beforeEach(() => { state.configured = true; localStorage.clear(); localStorage.setItem(CONSENT_KEY, 'accepted') })

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

  /** The cookie question (18 Nov 2026): no answer is a no. */
  it('counts nobody who has not said yes', () => {
    clearConsent()
    expect(analyticsAllowed(nav())).toBe(false)
    setConsent('declined')
    expect(analyticsAllowed(nav())).toBe(false)
    setConsent('accepted')
    expect(analyticsAllowed(nav())).toBe(true)
  })
})

describe('consentQuestionApplies', () => {
  it('asks an ordinary visitor', () => {
    expect(consentQuestionApplies(nav())).toBe(true)
  })

  it('does not ask where nothing would be counted anyway', () => {
    expect(consentQuestionApplies(nav({ globalPrivacyControl: true }))).toBe(false)
    expect(consentQuestionApplies(nav({ doNotTrack: '1' }))).toBe(false)
    expect(consentQuestionApplies(null)).toBe(false)
    state.configured = false
    expect(consentQuestionApplies(nav())).toBe(false)
  })

  it('still asks an automated browser, so a test of the live site can answer', () => {
    expect(consentQuestionApplies(nav({ webdriver: true }))).toBe(true)
    expect(analyticsAllowed(nav({ webdriver: true }))).toBe(false)
  })
})
