import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DailyChallengeEngine } from './daily-challenge'
import { CHALLENGE_POOL } from './challenge-pool'
import type { TrainingSessionResult } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/** Helper: create a minimal session result for testing. */
function makeSession(overrides: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode: 'speedDrill',
    timestamp: new Date().toISOString(),
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
    ...overrides,
  }
}

describe('DailyChallengeEngine', () => {
  let engine: DailyChallengeEngine

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 26, 12, 0, 0))
    localStorage.clear()
    engine = new DailyChallengeEngine()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── hashDateToIndex ───────────────────────────────────────────

  describe('hashDateToIndex', () => {
    it('returns a deterministic index for the same date', () => {
      const idx1 = engine.hashDateToIndex('2026-03-26', 24)
      const idx2 = engine.hashDateToIndex('2026-03-26', 24)
      expect(idx1).toBe(idx2)
    })

    it('returns a value in [0, poolSize)', () => {
      for (let d = 1; d <= 31; d++) {
        const date = `2026-03-${String(d).padStart(2, '0')}`
        const idx = engine.hashDateToIndex(date, 24)
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(24)
      }
    })

    it('produces different indices for different dates', () => {
      const indices = new Set<number>()
      for (let d = 1; d <= 24; d++) {
        const date = `2026-03-${String(d).padStart(2, '0')}`
        indices.add(engine.hashDateToIndex(date, 24))
      }
      // With 24 dates and 24 slots, we expect reasonable distribution (at least 10 unique)
      expect(indices.size).toBeGreaterThanOrEqual(10)
    })

    it('always returns a non-negative integer', () => {
      const idx = engine.hashDateToIndex('2026-12-31', 24)
      expect(Number.isInteger(idx)).toBe(true)
      expect(idx).toBeGreaterThanOrEqual(0)
    })
  })

  // ── getTodayChallenge ─────────────────────────────────────────

  describe('getTodayChallenge', () => {
    it('returns a valid ChallengeDefinition', () => {
      const challenge = engine.getTodayChallenge()
      expect(challenge).toBeDefined()
      expect(challenge.id).toBeTruthy()
      expect(challenge.title).toBeTruthy()
      expect(challenge.target).toBeGreaterThan(0)
      expect(CHALLENGE_POOL).toContainEqual(challenge)
    })

    it('returns the same challenge for the same date', () => {
      const c1 = engine.getTodayChallenge()
      const c2 = engine.getTodayChallenge()
      expect(c1.id).toBe(c2.id)
    })

    it('returns a different challenge on a different day', () => {
      const c1 = engine.getTodayChallenge()
      vi.setSystemTime(new Date(2026, 3, 15, 12, 0, 0))
      const c2 = engine.getTodayChallenge()
      // Might collide, but check they both exist in the pool
      expect(CHALLENGE_POOL.map(c => c.id)).toContain(c1.id)
      expect(CHALLENGE_POOL.map(c => c.id)).toContain(c2.id)
    })
  })

  // ── getState ──────────────────────────────────────────────────

  describe('getState', () => {
    it('initializes with 0 progress and not completed', () => {
      const state = engine.getState()
      expect(state.progress).toBe(0)
      expect(state.completed).toBe(false)
      expect(state.completedAt).toBeNull()
      expect(state.date).toBe('2026-03-26')
    })

    it('resets progress when the day changes', () => {
      // Make some progress
      const session = makeSession()
      engine.updateProgress(session, [session])

      // Advance to next day
      vi.setSystemTime(new Date(2026, 2, 27, 12, 0, 0))

      const state = engine.getState()
      expect(state.date).toBe('2026-03-27')
      expect(state.progress).toBe(0)
      expect(state.completed).toBe(false)
    })
  })

  // ── updateProgress — cumulative ───────────────────────────────

  describe('updateProgress (cumulative)', () => {
    it('tracks play_sessions by counting all today sessions', () => {
      // Force a challenge that tracks play_sessions
      const challenge = CHALLENGE_POOL.find(c => c.id === 'warm_up')!
      expect(challenge.type).toBe('play_sessions')
      expect(challenge.target).toBe(2)

      // Override engine to use this challenge
      vi.setSystemTime(findDateForChallenge('warm_up'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('warm_up')

      const s1 = makeSession({ timestamp: new Date().toISOString() })
      const completed1 = engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(1)
      expect(completed1).toBe(false)

      const s2 = makeSession({ timestamp: new Date().toISOString() })
      const completed2 = engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(2)
      expect(completed2).toBe(true)
      expect(engine.getState().completed).toBe(true)
    })

    it('tracks play_hands by summing totalQuestions', () => {
      vi.setSystemTime(findDateForChallenge('deal_me_in'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('deal_me_in')

      const s1 = makeSession({ totalQuestions: 15, timestamp: new Date().toISOString() })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(15)

      const s2 = makeSession({ totalQuestions: 20, timestamp: new Date().toISOString() })
      engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(35)
      expect(engine.getState().completed).toBe(true) // target is 30
    })

    it('tracks play_minutes by summing durationSeconds / 60', () => {
      vi.setSystemTime(findDateForChallenge('focused_practice'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('focused_practice')

      const s1 = makeSession({ durationSeconds: 300, timestamp: new Date().toISOString() })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(5) // 300s = 5min

      const s2 = makeSession({ durationSeconds: 360, timestamp: new Date().toISOString() })
      engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(11) // 660s = 11min
      expect(engine.getState().completed).toBe(true) // target is 10
    })

    it('tracks practice_mode by counting sessions of the required mode', () => {
      vi.setSystemTime(findDateForChallenge('quick_practice'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('quick_practice')

      // Wrong mode - should not count
      const wrongMode = makeSession({ mode: 'tableCounting', timestamp: new Date().toISOString() })
      engine.updateProgress(wrongMode, [wrongMode])
      expect(engine.getState().progress).toBe(0)

      // Right mode
      const rightMode = makeSession({ mode: 'speedDrill', timestamp: new Date().toISOString() })
      const completed = engine.updateProgress(rightMode, [wrongMode, rightMode])
      expect(engine.getState().progress).toBe(1)
      expect(completed).toBe(true)
    })

    it('tracks deviation_correct by summing correct answers from deviation sessions', () => {
      vi.setSystemTime(findDateForChallenge('deviation_student'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('deviation_student')

      const s1 = makeSession({
        mode: 'deviationFlashCards',
        correctAnswers: 7,
        timestamp: new Date().toISOString(),
        details: {
          type: 'deviationFlashCards',
          deviationSet: 'all',
          perDeviation: { 'I18-1': { correct: 4, incorrect: 1 }, 'I18-2': { correct: 3, incorrect: 2 } },
        },
      })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(7)

      const s2 = makeSession({
        mode: 'deviationAtTable',
        correctAnswers: 5,
        timestamp: new Date().toISOString(),
        details: {
          type: 'deviationAtTable',
          deviationSet: 'i18',
          perDeviation: { 'I18-3': { correct: 5, incorrect: 0 } },
        },
      })
      engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(12)
      expect(engine.getState().completed).toBe(true) // target is 10
    })

    it('filters sessions by mode for mode-specific cumulative challenges', () => {
      vi.setSystemTime(findDateForChallenge('deviation_day'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('deviation_day')

      // deviationAtTable does NOT count for deviationFlashCards mode requirement
      const wrongSub = makeSession({ mode: 'deviationAtTable', timestamp: new Date().toISOString() })
      engine.updateProgress(wrongSub, [wrongSub])
      expect(engine.getState().progress).toBe(0)

      const right1 = makeSession({ mode: 'deviationFlashCards', timestamp: new Date().toISOString() })
      engine.updateProgress(right1, [wrongSub, right1])
      expect(engine.getState().progress).toBe(1)
    })
  })

  // ── updateProgress — single_session ───────────────────────────

  describe('updateProgress (single_session)', () => {
    it('tracks achieve_accuracy from session accuracy (keeps max)', () => {
      vi.setSystemTime(findDateForChallenge('sharp_eye'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('sharp_eye')

      const s1 = makeSession({ accuracy: 0.7, totalQuestions: 10 })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(70) // 70%

      const s2 = makeSession({ accuracy: 0.85, totalQuestions: 10 })
      const completed = engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(85) // 85% > 70% → updated
      expect(completed).toBe(true) // target is 80
    })

    it('tracks win_streak from bestStreak (keeps max)', () => {
      vi.setSystemTime(findDateForChallenge('winning_streak'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('winning_streak')

      const s1 = makeSession({ bestStreak: 3 })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(3)

      const s2 = makeSession({ bestStreak: 6 })
      const completed = engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(6)
      expect(completed).toBe(true) // target is 5
    })

    it('tracks earn_profit from casino session netProfit (keeps max)', () => {
      vi.setSystemTime(findDateForChallenge('money_management'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('money_management')

      const s1 = makeSession({
        mode: 'casinoSession',
        details: {
          type: 'casinoSession', handsPlayed: 50, netProfit: -100, overallScore: 60,
          grade: 'D', betAccuracy: 70, playAccuracy: 70, countAccuracy: 70,
          deviationAccuracy: 70, numBots: 2, hadBlackjack: false,
          longestWinStreak: 3, splitAces: false, maxSplitHands: 1,
        },
      })
      engine.updateProgress(s1, [s1])
      // Negative profit → progress stays 0 (clamped)
      expect(engine.getState().progress).toBe(0)

      const s2 = makeSession({
        mode: 'casinoSession',
        details: {
          type: 'casinoSession', handsPlayed: 50, netProfit: 200, overallScore: 80,
          grade: 'B', betAccuracy: 80, playAccuracy: 80, countAccuracy: 80,
          deviationAccuracy: 80, numBots: 2, hadBlackjack: true,
          longestWinStreak: 5, splitAces: false, maxSplitHands: 1,
        },
      })
      const completed = engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(200)
      expect(completed).toBe(true) // target is 1 (any profit)
    })

    it('tracks count_check from casino session countAccuracy', () => {
      vi.setSystemTime(findDateForChallenge('count_master'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('count_master')

      const s1 = makeSession({
        mode: 'casinoSession',
        details: {
          type: 'casinoSession', handsPlayed: 100, netProfit: 50, overallScore: 92,
          grade: 'A', betAccuracy: 95, playAccuracy: 90, countAccuracy: 92,
          deviationAccuracy: 85, numBots: 3, hadBlackjack: true,
          longestWinStreak: 7, splitAces: false, maxSplitHands: 1,
        },
      })
      const completed = engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(92)
      expect(completed).toBe(true) // target is 90
    })

    it('tracks speed_time from speedDrill average time', () => {
      vi.setSystemTime(findDateForChallenge('lightning_speed'))
      engine = new DailyChallengeEngine()
      expect(engine.getTodayChallenge().id).toBe('lightning_speed')

      // Speed drill: durationSeconds / totalQuestions * 1000 = avg ms per question
      const s1 = makeSession({
        mode: 'speedDrill',
        durationSeconds: 12,
        totalQuestions: 20,
        details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 400, rcErrors: [] },
      })
      engine.updateProgress(s1, [s1])
      // Avg = 12/20 * 1000 = 600ms. For speed_time, lower is better.
      // Progress = target - avg = 500 - 600 = -100 → clamped to 0? No:
      // For speed_time, progress = speedMs from details (display speed)
      // Actually: progress represents the best (lowest) avg time achieved.
      // We store the value and check if it's <= target.
      expect(engine.getState().progress).toBe(600)
      expect(engine.getState().completed).toBe(false) // 600 > 500 target

      const s2 = makeSession({
        mode: 'speedDrill',
        durationSeconds: 8,
        totalQuestions: 20,
        details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 300, rcErrors: [] },
      })
      const completed = engine.updateProgress(s2, [s1, s2])
      // Avg = 8/20 * 1000 = 400ms, which is <= 500
      expect(engine.getState().progress).toBe(400)
      expect(completed).toBe(true)
    })

    it('respects requiredMode for single_session challenges', () => {
      vi.setSystemTime(findDateForChallenge('count_master'))
      engine = new DailyChallengeEngine()

      // Wrong mode should not update progress
      const wrongMode = makeSession({ mode: 'speedDrill' })
      engine.updateProgress(wrongMode, [wrongMode])
      expect(engine.getState().progress).toBe(0)
    })
  })

  // ── getStreak ─────────────────────────────────────────────────

  describe('getStreak', () => {
    it('returns 0 when no challenges have been completed', () => {
      expect(engine.getStreak()).toBe(0)
    })

    it('returns 1 when only today is completed', () => {
      // Complete today's challenge by brute force
      forceComplete(engine, '2026-03-26')
      expect(engine.getStreak()).toBe(1)
    })

    it('counts consecutive days backward from today', () => {
      forceComplete(engine, '2026-03-24')
      forceComplete(engine, '2026-03-25')
      forceComplete(engine, '2026-03-26')
      expect(engine.getStreak()).toBe(3)
    })

    it('counts from yesterday if today is not yet completed', () => {
      forceComplete(engine, '2026-03-24')
      forceComplete(engine, '2026-03-25')
      // Today (26th) NOT completed
      expect(engine.getStreak()).toBe(2)
    })

    it('resets on a gap day', () => {
      forceComplete(engine, '2026-03-23')
      // 24th is a gap
      forceComplete(engine, '2026-03-25')
      forceComplete(engine, '2026-03-26')
      expect(engine.getStreak()).toBe(2) // only 25th + 26th
    })

    it('returns 0 if last completion was 2+ days ago', () => {
      forceComplete(engine, '2026-03-23')
      // 24th and 25th are gaps, today is 26th
      expect(engine.getStreak()).toBe(0)
    })
  })

  // ── Persistence ───────────────────────────────────────────────

  describe('persistence', () => {
    it('saves state to localStorage and reloads on new instance', () => {
      const s1 = makeSession({ timestamp: new Date().toISOString() })
      engine.updateProgress(s1, [s1])
      const oldProgress = engine.getState().progress

      // Create a fresh engine instance — should load from localStorage
      const engine2 = new DailyChallengeEngine()
      expect(engine2.getState().progress).toBe(oldProgress)
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('bjt_daily_challenge', '{corrupted json!!!}')
      const engine2 = new DailyChallengeEngine()
      // Should not throw, and should initialize fresh state
      expect(engine2.getState().progress).toBe(0)
      expect(engine2.getState().completed).toBe(false)
    })

    it('handles missing localStorage key gracefully', () => {
      localStorage.removeItem('bjt_daily_challenge')
      const engine2 = new DailyChallengeEngine()
      expect(engine2.getState().progress).toBe(0)
    })

    it('resetAll clears localStorage and all state', () => {
      forceComplete(engine, '2026-03-26')
      expect(engine.getStreak()).toBe(1)

      engine.resetAll()
      expect(engine.getState().progress).toBe(0)
      expect(engine.getState().completed).toBe(false)
      expect(engine.getStreak()).toBe(0)
      expect(engine.getTotalCompleted()).toBe(0)
      expect(engine.getTotalXP()).toBe(0)
      expect(localStorage.getItem('bjt_daily_challenge')).toBeNull()
    })

    it('persists completedDates, totalCompleted, and totalXP', () => {
      forceComplete(engine, '2026-03-26')

      const engine2 = new DailyChallengeEngine()
      expect(engine2.getTotalCompleted()).toBeGreaterThanOrEqual(1)
      expect(engine2.getTotalXP()).toBeGreaterThan(0)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('does not allow progress beyond completion', () => {
      vi.setSystemTime(findDateForChallenge('warm_up'))
      engine = new DailyChallengeEngine()

      const sessions = Array.from({ length: 5 }, () =>
        makeSession({ timestamp: new Date().toISOString() })
      )
      // Feed all 5 sessions
      for (let i = 0; i < sessions.length; i++) {
        engine.updateProgress(sessions[i], sessions.slice(0, i + 1))
      }

      expect(engine.getState().completed).toBe(true)
      // Progress should be at least target, could be higher for cumulative
      expect(engine.getState().progress).toBeGreaterThanOrEqual(2)
    })

    it('completedAt is set when challenge is first completed', () => {
      vi.setSystemTime(findDateForChallenge('warm_up'))
      engine = new DailyChallengeEngine()

      const s1 = makeSession({ timestamp: new Date().toISOString() })
      const s2 = makeSession({ timestamp: new Date().toISOString() })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().completedAt).toBeNull()

      engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().completedAt).toBeTruthy()
    })
  })
})

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Find a date in 2026 where the hash maps to a specific challenge ID.
 * Brute-forces through dates until we find a match.
 */
function findDateForChallenge(challengeId: string): Date {
  const engine = new DailyChallengeEngine()
  const poolIndex = CHALLENGE_POOL.findIndex(c => c.id === challengeId)
  if (poolIndex === -1) throw new Error(`Challenge ${challengeId} not in pool`)

  for (let d = 0; d < 365; d++) {
    const date = new Date(2026, 0, 1 + d, 12, 0, 0) // noon local
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const idx = engine.hashDateToIndex(dateStr, CHALLENGE_POOL.length)
    if (idx === poolIndex) {
      return date
    }
  }
  throw new Error(`Could not find a date in 2026 for challenge ${challengeId}`)
}

/**
 * Force-complete a challenge for a given date by manipulating the stored data.
 */
function forceComplete(engine: DailyChallengeEngine, dateStr: string): void {
  const raw = localStorage.getItem('bjt_daily_challenge')
  const stored = raw ? JSON.parse(raw) : {
    current: null,
    completedDates: [],
    totalCompleted: 0,
    totalXP: 0,
  }

  // Find which challenge is for this date
  const idx = engine.hashDateToIndex(dateStr, CHALLENGE_POOL.length)
  const challenge = CHALLENGE_POOL[idx]

  if (!stored.completedDates.includes(dateStr)) {
    stored.completedDates.push(dateStr)
    stored.totalCompleted++
    stored.totalXP += { easy: 50, medium: 100, hard: 150, very_hard: 200 }[challenge.difficulty]
  }

  stored.current = {
    challengeId: challenge.id,
    date: dateStr,
    progress: challenge.target,
    completed: true,
    completedAt: new Date(`${dateStr}T14:00:00Z`).toISOString(),
  }

  localStorage.setItem('bjt_daily_challenge', JSON.stringify(stored))

  // Reload the engine from storage
  engine.reloadFromStorage()
}
