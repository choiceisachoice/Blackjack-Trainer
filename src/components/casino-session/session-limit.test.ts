import { describe, it, expect } from 'vitest'
import { sessionLimitReached } from './session-limit'

const time15 = { sessionMode: 'time' as const, targetHands: 20, targetMinutes: 15 }
const hands20 = { sessionMode: 'hands' as const, targetHands: 20, targetMinutes: 15 }
const unlimited = { sessionMode: 'unlimited' as const, targetHands: 20, targetMinutes: 15 }

describe('sessionLimitReached', () => {
  it('reports the time target once the minutes are played', () => {
    expect(sessionLimitReached(time15, 40, 15 * 60 - 1, false)).toBeNull()
    expect(sessionLimitReached(time15, 40, 15 * 60, false)).toBe('time')
  })

  it('reports the hands target once that many hands were dealt', () => {
    expect(sessionLimitReached(hands20, 19, 9999, false)).toBeNull()
    expect(sessionLimitReached(hands20, 20, 0, false)).toBe('hands')
  })

  it('never stops an unlimited session', () => {
    expect(sessionLimitReached(unlimited, 10_000, 10 * 3600, false)).toBeNull()
  })

  it('stops asking once the player chose to keep playing', () => {
    expect(sessionLimitReached(time15, 40, 60 * 60, true)).toBeNull()
    expect(sessionLimitReached(hands20, 80, 0, true)).toBeNull()
  })
})
