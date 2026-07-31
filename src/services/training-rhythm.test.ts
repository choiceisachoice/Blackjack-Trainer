import { describe, it, expect } from 'vitest'
import {
  lastSessionAt,
  daysSinceLastSession,
  deriveRhythm,
  rhythmMessage,
  CURRENT_DAYS,
  RUSTY_DAYS,
} from './training-rhythm'
import { CURRICULUM, deriveCurriculum } from './curriculum'
import type { TrainingMode, TrainingSessionResult } from './stats-types'

const NOW = new Date('2026-07-23T12:00:00.000Z')

function session(daysAgo: number, mode: TrainingMode = 'speedDrill', accuracy = 0.95): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode,
    timestamp: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 19,
    accuracy,
    bestStreak: 5,
  } as unknown as TrainingSessionResult
}

const progressWith = (sessions: TrainingSessionResult[]) => deriveCurriculum(sessions, [], true)
const noProgress = deriveCurriculum([], [], true)

describe('lastSessionAt', () => {
  it('is null with no history', () => {
    expect(lastSessionAt([])).toBeNull()
  })

  it('finds the newest regardless of array order', () => {
    const old = session(30)
    const recent = session(1)
    expect(lastSessionAt([recent, old])).toBe(recent.timestamp)
    expect(lastSessionAt([old, recent])).toBe(recent.timestamp)
  })
})

describe('daysSinceLastSession', () => {
  it('is null with no history — a gap needs something to be a gap from', () => {
    expect(daysSinceLastSession([], NOW)).toBeNull()
  })

  it('counts whole days', () => {
    expect(daysSinceLastSession([session(0)], NOW)).toBe(0)
    expect(daysSinceLastSession([session(1)], NOW)).toBe(1)
    expect(daysSinceLastSession([session(21)], NOW)).toBe(21)
  })

  it('floors rather than rounds, so a morning session reads as today', () => {
    const sixHoursAgo = {
      ...session(0),
      timestamp: new Date(NOW.getTime() - 6 * 3_600_000).toISOString(),
    }
    expect(daysSinceLastSession([sixHoursAgo], NOW)).toBe(0)
  })

  it('never returns a negative gap when the clock lags the stored timestamp', () => {
    // Device clocks drift and cloud sync can hand back a timestamp from a
    // device slightly ahead. "-1 days since you trained" must never appear.
    expect(daysSinceLastSession([session(-2)], NOW)).toBe(0)
  })
})

describe('deriveRhythm', () => {
  it('calls a learner with no history new, not lapsed', () => {
    // The bug this guards: greeting someone with "welcome back" who has never
    // been here at all.
    expect(deriveRhythm([], noProgress, NOW)).toEqual({ kind: 'new' })
  })

  it('says nothing about a gap that is just normal life', () => {
    for (const days of [0, 1, CURRENT_DAYS - 1]) {
      expect(deriveRhythm([session(days)], noProgress, NOW).kind, `${days}d`).toBe('current')
    }
  })

  it('notices a gap once it is worth naming', () => {
    expect(deriveRhythm([session(CURRENT_DAYS)], noProgress, NOW))
      .toEqual({ kind: 'returning', days: CURRENT_DAYS })
    expect(deriveRhythm([session(RUSTY_DAYS - 1)], noProgress, NOW).kind).toBe('returning')
  })

  it('treats a long gap as rust, not as a longer absence', () => {
    const r = deriveRhythm([session(RUSTY_DAYS)], noProgress, NOW)
    expect(r.kind).toBe('rusty')
    if (r.kind === 'rusty') expect(r.days).toBe(RUSTY_DAYS)
  })

  it('offers the most recently cleared stage as the warm-up', () => {
    // Skill fades from the top down: the newest thing learned is the least
    // practised, so that is what is worth re-running.
    const sessions = [
      ...Array.from({ length: 3 }, () => session(40, 'deviationFlashCards', 0.9)),
      ...Array.from({ length: 3 }, () => session(40, 'speedDrill', 0.95)),
    ]
    const r = deriveRhythm(sessions, progressWith(sessions), NOW)
    expect(r.kind).toBe('rusty')
    if (r.kind === 'rusty') expect(r.refresh).toBe('hi-lo') // later than basic-strategy
  })

  it('offers no warm-up when nothing has been cleared', () => {
    const sessions = [session(40, 'speedDrill', 0.4)] // never met the bar
    const r = deriveRhythm(sessions, progressWith(sessions), NOW)
    expect(r.kind).toBe('rusty')
    if (r.kind === 'rusty') expect(r.refresh).toBeNull()
  })

  it('never offers a reading stage as a warm-up — there is nothing to re-run', () => {
    const readOnly = CURRICULUM.filter(s => !s.drill).map(s => s.id)
    const sessions = Array.from({ length: 3 }, () => session(40, 'speedDrill', 0.95))
    const r = deriveRhythm(sessions, deriveCurriculum(sessions, readOnly, true), NOW)
    if (r.kind === 'rusty' && r.refresh) {
      expect(readOnly).not.toContain(r.refresh)
    }
  })

  it('measures from the newest session, not the oldest', () => {
    expect(deriveRhythm([session(90), session(1)], noProgress, NOW).kind).toBe('current')
  })
})

describe('rhythmMessage', () => {
  it('stays silent when there is nothing to say', () => {
    expect(rhythmMessage({ kind: 'new' })).toBeNull()
    expect(rhythmMessage({ kind: 'current', days: 1 })).toBeNull()
  })

  it('names the gap without scolding', () => {
    const text = rhythmMessage({ kind: 'returning', days: 5 })!
    expect(text).toContain('5 days')
    // "You haven't trained in..." is a reprimand; this must not read that way.
    expect(text).not.toMatch(/haven.t|should have|failed|missed/i)
  })

  it('explains what a long gap actually costs, and that it comes back', () => {
    const text = rhythmMessage({ kind: 'rusty', days: 30, refresh: 'hi-lo' })!
    expect(text).toContain('30 days')
    expect(text).toMatch(/slower/i)
    expect(text).toMatch(/get it back/i)
  })

  it('promises no warm-up it cannot offer', () => {
    const text = rhythmMessage({ kind: 'rusty', days: 30, refresh: null })!
    expect(text).toMatch(/nothing is lost/i)
    expect(text).not.toMatch(/warm-up/i)
  })
})
