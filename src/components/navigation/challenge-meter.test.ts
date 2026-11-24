import { describe, it, expect } from 'vitest'
import { challengeMeter, MAX_PIPS } from './challenge-meter'

describe('challengeMeter', () => {
  it('draws a small tally as one slot per unit, and says how many are left', () => {
    expect(challengeMeter({ type: 'win_streak', progress: 2, target: 5, completed: false }))
      .toEqual({ kind: 'pips', percent: 40, filled: 2, steps: 5, remaining: 3 })
  })

  it('draws an untouched tally as empty slots, not as a 0% bar', () => {
    const m = challengeMeter({ type: 'play_sessions', progress: 0, target: 2, completed: false })
    expect(m.kind).toBe('pips')
    expect(m.filled).toBe(0)
    expect(m.steps).toBe(2)
    expect(m.remaining).toBe(2)
  })

  it('switches to a bar above the slot limit', () => {
    const m = challengeMeter({ type: 'play_hands', progress: 37, target: 200, completed: false })
    expect(m).toEqual({ kind: 'bar', percent: 19, filled: 0, steps: 0, remaining: 163 })
    expect(challengeMeter({ type: 'play_hands', progress: 0, target: MAX_PIPS, completed: false }).kind).toBe('pips')
    expect(challengeMeter({ type: 'play_hands', progress: 0, target: MAX_PIPS + 1, completed: false }).kind).toBe('bar')
  })

  it('never overfills, and never counts below zero', () => {
    expect(challengeMeter({ type: 'play_hands', progress: 260, target: 200, completed: false }).percent).toBe(100)
    expect(challengeMeter({ type: 'play_hands', progress: 260, target: 200, completed: false }).remaining).toBe(0)
    expect(challengeMeter({ type: 'play_hands', progress: -4, target: 200, completed: false }).percent).toBe(0)
  })

  it('is full once complete, whatever the stored number says', () => {
    expect(challengeMeter({ type: 'win_streak', progress: 3, target: 5, completed: true }))
      .toMatchObject({ kind: 'pips', filled: 5, remaining: 0, percent: 100 })
  })

  it('gives a best value a bar and no "left to go" count', () => {
    for (const type of ['achieve_accuracy', 'earn_profit'] as const) {
      const m = challengeMeter({ type, progress: 72, target: 90, completed: false })
      expect(m.kind, type).toBe('bar')
      expect(m.remaining, type).toBeNull()
      expect(m.percent, type).toBe(80)
    }
  })

  it('measures a best time against its target, lower being better, never 100% until done', () => {
    // 2000 ms target, best so far 2500 ms → 80% of the way.
    expect(challengeMeter({ type: 'speed_time', progress: 2500, target: 2000, completed: false }).percent).toBe(80)
    expect(challengeMeter({ type: 'speed_time', progress: 1900, target: 2000, completed: false }).percent).toBe(99)
    expect(challengeMeter({ type: 'speed_time', progress: 0, target: 2000, completed: false }).percent).toBe(0)
    expect(challengeMeter({ type: 'speed_time', progress: 1900, target: 2000, completed: true }).percent).toBe(100)
    expect(challengeMeter({ type: 'speed_time', progress: 2500, target: 2000, completed: false }).remaining).toBeNull()
  })

  it('survives a zero target', () => {
    expect(challengeMeter({ type: 'play_sessions', progress: 0, target: 0, completed: false }).steps).toBe(1)
  })
})
