import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CONSENT_KEY, getConsent, setConsent, clearConsent, onConsentChanged } from './consent-choice'

beforeEach(() => localStorage.clear())

describe('the answer to the cookie question', () => {
  it('is nothing until the visitor answers', () => {
    expect(getConsent()).toBeNull()
  })

  it('is remembered', () => {
    setConsent('accepted')
    expect(getConsent()).toBe('accepted')
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted')
    setConsent('declined')
    expect(getConsent()).toBe('declined')
  })

  it('ignores a stored value it does not know', () => {
    localStorage.setItem(CONSENT_KEY, 'maybe')
    expect(getConsent()).toBeNull()
  })

  it('removes the visitor id when the answer is no', () => {
    localStorage.setItem('bjt_visitor_id', 'abc')
    setConsent('accepted')
    expect(localStorage.getItem('bjt_visitor_id')).toBe('abc')
    setConsent('declined')
    expect(localStorage.getItem('bjt_visitor_id')).toBeNull()
  })

  it('can be taken back, so the question is asked again', () => {
    setConsent('accepted')
    clearConsent()
    expect(getConsent()).toBeNull()
  })

  it('tells listeners about every change, until they stop listening', () => {
    const heard = vi.fn()
    const stop = onConsentChanged(heard)
    setConsent('accepted')
    clearConsent()
    expect(heard).toHaveBeenCalledTimes(2)
    stop()
    setConsent('declined')
    expect(heard).toHaveBeenCalledTimes(2)
  })
})
