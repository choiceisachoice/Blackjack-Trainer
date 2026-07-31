import { describe, it, expect, beforeEach } from 'vitest'
import { hasSeenLevelIntro, markLevelIntroSeen } from './level-intro'

beforeEach(() => localStorage.clear())

describe('level intro flag', () => {
  it('is unseen until marked', () => {
    expect(hasSeenLevelIntro()).toBe(false)
  })

  it('remembers once marked', () => {
    markLevelIntroSeen()
    expect(hasSeenLevelIntro()).toBe(true)
  })

  it('is idempotent', () => {
    markLevelIntroSeen()
    markLevelIntroSeen()
    expect(hasSeenLevelIntro()).toBe(true)
  })

  it('treats corrupt storage as unseen rather than throwing', () => {
    localStorage.setItem('bjt_level_intro_seen', 'garbage')
    expect(hasSeenLevelIntro()).toBe(false)
  })
})
