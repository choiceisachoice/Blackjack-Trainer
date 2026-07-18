import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WeeklyChallengeEngine } from './weekly-challenge'
import { WEEKLY_CHALLENGE_POOL } from './weekly-challenge-pool'
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

describe('WeeklyChallengeEngine', () => {
  let engine: WeeklyChallengeEngine

  beforeEach(() => {
    vi.useFakeTimers()
    // Wednesday 2026-03-25 12:00 local — week of Mon 2026-03-23
    vi.setSystemTime(new Date(2026, 2, 25, 12, 0, 0))
    localStorage.clear()
    engine = new WeeklyChallengeEngine()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── getWeekId ─────────────────────────────────────────────

  describe('getWeekId', () => {
    it('returns the Monday of the current week', () => {
      // 2026-03-25 is Wednesday → Monday = 2026-03-23
      expect(engine.getWeekId()).toBe('2026-03-23')
    })

    it('returns previous Monday when on Sunday', () => {
      vi.setSystemTime(new Date(2026, 2, 29, 12, 0, 0)) // Sunday noon local
      engine = new WeeklyChallengeEngine()
      expect(engine.getWeekId()).toBe('2026-03-23')
    })

    it('returns same day when on Monday', () => {
      vi.setSystemTime(new Date(2026, 2, 23, 0, 1, 0)) // Monday 00:01 local
      engine = new WeeklyChallengeEngine()
      expect(engine.getWeekId()).toBe('2026-03-23')
    })

    it('advances to next week on next Monday', () => {
      vi.setSystemTime(new Date(2026, 2, 30, 0, 1, 0)) // next Monday 00:01 local
      engine = new WeeklyChallengeEngine()
      expect(engine.getWeekId()).toBe('2026-03-30')
    })
  })

  // ── getThisWeekChallenge ──────────────────────────────────

  describe('getThisWeekChallenge', () => {
    it('returns a valid WeeklyChallengeDefinition', () => {
      const challenge = engine.getThisWeekChallenge()
      expect(challenge).toBeDefined()
      expect(challenge.id).toBeTruthy()
      expect(challenge.title).toBeTruthy()
      expect(challenge.target).toBeGreaterThan(0)
      expect(challenge.xpReward).toBeGreaterThanOrEqual(300)
      expect(WEEKLY_CHALLENGE_POOL).toContainEqual(challenge)
    })

    it('returns the same challenge all week', () => {
      const c1 = engine.getThisWeekChallenge()
      vi.setSystemTime(new Date(2026, 2, 27, 12, 0, 0)) // Thursday same week
      const c2 = engine.getThisWeekChallenge()
      expect(c1.id).toBe(c2.id)
    })

    it('can return a different challenge next week', () => {
      const c1 = engine.getThisWeekChallenge()
      vi.setSystemTime(new Date(2026, 3, 6, 12, 0, 0)) // 2 weeks later
      const c2 = engine.getThisWeekChallenge()
      // Both must be in the pool (they might collide but must be valid)
      expect(WEEKLY_CHALLENGE_POOL.map(c => c.id)).toContain(c1.id)
      expect(WEEKLY_CHALLENGE_POOL.map(c => c.id)).toContain(c2.id)
    })
  })

  // ── getState ──────────────────────────────────────────────

  describe('getState', () => {
    it('initializes with 0 progress and not completed', () => {
      const state = engine.getState()
      expect(state.progress).toBe(0)
      expect(state.completed).toBe(false)
      expect(state.completedAt).toBeNull()
      expect(state.weekId).toBe('2026-03-23')
    })

    it('resets progress when a new week starts', () => {
      const s = makeSession({ timestamp: new Date().toISOString() })
      engine.updateProgress(s, [s])

      // Advance to next week
      vi.setSystemTime(new Date(2026, 2, 30, 12, 0, 0))
      const state = engine.getState()
      expect(state.weekId).toBe('2026-03-30')
      expect(state.progress).toBe(0)
      expect(state.completed).toBe(false)
    })
  })

  // ── updateProgress — cumulative ───────────────────────────

  describe('updateProgress (cumulative)', () => {
    it('tracks play_hands across the whole week', () => {
      vi.setSystemTime(findWeekForChallenge('weekly_grinder'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('weekly_grinder')

      const s1 = makeSession({ totalQuestions: 80, timestamp: new Date().toISOString() })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(80)

      const s2 = makeSession({ totalQuestions: 130, timestamp: new Date().toISOString() })
      const completed = engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(210)
      expect(completed).toBe(true) // target is 200
    })

    it('tracks play_sessions with mode filter', () => {
      vi.setSystemTime(findWeekForChallenge('casino_regular'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('casino_regular')

      // Wrong mode
      const wrong = makeSession({ mode: 'speedDrill', timestamp: new Date().toISOString() })
      engine.updateProgress(wrong, [wrong])
      expect(engine.getState().progress).toBe(0)

      // Right mode
      const right = makeSession({ mode: 'casinoSession', timestamp: new Date().toISOString(), details: {
        type: 'casinoSession', handsPlayed: 20, netProfit: 100, overallScore: 80,
        grade: 'B', betAccuracy: 80, playAccuracy: 80, countAccuracy: 80,
        deviationAccuracy: 80, numBots: 2, hadBlackjack: false,
        longestWinStreak: 3, splitAces: false, maxSplitHands: 1,
      } })
      engine.updateProgress(right, [wrong, right])
      expect(engine.getState().progress).toBe(1)
    })

    it('tracks play_minutes by summing durationSeconds / 60', () => {
      vi.setSystemTime(findWeekForChallenge('weekly_practice'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('weekly_practice')

      const s1 = makeSession({ durationSeconds: 3600, timestamp: new Date().toISOString() }) // 60 min
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(60)

      const s2 = makeSession({ durationSeconds: 3600, timestamp: new Date().toISOString() }) // 60 min
      const completed = engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(120)
      expect(completed).toBe(true) // target is 120
    })

    it('tracks deviation_correct by summing correct answers from deviation sessions', () => {
      vi.setSystemTime(findWeekForChallenge('deviation_expert'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('deviation_expert')

      const s1 = makeSession({
        mode: 'deviationFlashCards', correctAnswers: 25, timestamp: new Date().toISOString(),
        details: { type: 'deviationFlashCards', deviationSet: 'all', perDeviation: {} },
      })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(25)
    })

    it('tracks earn_profit by summing netProfit from casino sessions', () => {
      vi.setSystemTime(findWeekForChallenge('profit_hunter'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('profit_hunter')

      const casinoDetails = (profit: number) => ({
        type: 'casinoSession' as const, handsPlayed: 50, netProfit: profit, overallScore: 80,
        grade: 'B', betAccuracy: 80, playAccuracy: 80, countAccuracy: 80,
        deviationAccuracy: 80, numBots: 2, hadBlackjack: false,
        longestWinStreak: 3, splitAces: false, maxSplitHands: 1,
      })

      const s1 = makeSession({ mode: 'casinoSession', timestamp: new Date().toISOString(), details: casinoDetails(800) })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(800)

      const s2 = makeSession({ mode: 'casinoSession', timestamp: new Date().toISOString(), details: casinoDetails(-200) })
      engine.updateProgress(s2, [s1, s2])
      // Negative sessions don't reduce cumulative: max(0, sum)
      expect(engine.getState().progress).toBe(600)
    })
  })

  // ── updateProgress — special weekly types ─────────────────

  describe('updateProgress (weekly-specific types)', () => {
    it('tracks unique_days by counting distinct dates', () => {
      vi.setSystemTime(findWeekForChallenge('consistent_player'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('consistent_player')

      const weekId = engine.getWeekId()

      // 3 sessions on different days
      const s1 = makeSession({ timestamp: `${weekId}T10:00:00.000Z` })
      const day2 = addDays(weekId, 1)
      const s2 = makeSession({ timestamp: `${day2}T10:00:00.000Z` })
      const day3 = addDays(weekId, 2)
      const s3 = makeSession({ timestamp: `${day3}T10:00:00.000Z` })

      engine.updateProgress(s3, [s1, s2, s3])
      expect(engine.getState().progress).toBe(3)
    })

    it('unique_days counts same day only once', () => {
      vi.setSystemTime(findWeekForChallenge('consistent_player'))
      engine = new WeeklyChallengeEngine()

      const weekId = engine.getWeekId()
      const s1 = makeSession({ timestamp: `${weekId}T10:00:00.000Z` })
      const s2 = makeSession({ timestamp: `${weekId}T14:00:00.000Z` })

      engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(1) // same day
    })

    it('tracks unique_modes by counting distinct modes', () => {
      vi.setSystemTime(findWeekForChallenge('mode_explorer'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('mode_explorer')

      const s1 = makeSession({ mode: 'speedDrill', timestamp: new Date().toISOString() })
      const s2 = makeSession({ mode: 'tableCounting', timestamp: new Date().toISOString() })
      const s3 = makeSession({ mode: 'betSpread', timestamp: new Date().toISOString() })

      engine.updateProgress(s3, [s1, s2, s3])
      expect(engine.getState().progress).toBe(3)
      expect(engine.getState().completed).toBe(true) // target is 3
    })

    it('tracks sessions_with_accuracy above minAccuracy threshold', () => {
      vi.setSystemTime(findWeekForChallenge('accuracy_week'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('accuracy_week')
      // minAccuracy is 85, target is 5 sessions

      const s1 = makeSession({ accuracy: 0.90, timestamp: new Date().toISOString() }) // above
      const s2 = makeSession({ accuracy: 0.70, timestamp: new Date().toISOString() }) // below
      const s3 = makeSession({ accuracy: 0.88, timestamp: new Date().toISOString() }) // above

      engine.updateProgress(s3, [s1, s2, s3])
      expect(engine.getState().progress).toBe(2) // only s1, s3 qualify
    })

    it('tracks daily_challenges_completed from daily challenge storage', () => {
      vi.setSystemTime(findWeekForChallenge('daily_warrior'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('daily_warrior')

      const weekId = engine.getWeekId()

      // Simulate completed daily challenges by setting localStorage
      localStorage.setItem('bjt_daily_challenge', JSON.stringify({
        current: { challengeId: 'test', date: weekId, progress: 0, completed: false, completedAt: null },
        completedDates: [
          weekId,
          addDays(weekId, 1),
          addDays(weekId, 2),
          addDays(weekId, 3),
        ],
        totalCompleted: 4,
        totalXP: 200,
      }))

      const s = makeSession({ timestamp: new Date().toISOString() })
      engine.updateProgress(s, [s])
      expect(engine.getState().progress).toBe(4) // 4 daily challenges this week
    })

    it('tracks win_streak from session bestStreak (keeps max)', () => {
      vi.setSystemTime(findWeekForChallenge('streak_master'))
      engine = new WeeklyChallengeEngine()
      expect(engine.getThisWeekChallenge().id).toBe('streak_master')

      const s1 = makeSession({
        mode: 'casinoSession', bestStreak: 6, timestamp: new Date().toISOString(),
        details: {
          type: 'casinoSession', handsPlayed: 50, netProfit: 100, overallScore: 80,
          grade: 'B', betAccuracy: 80, playAccuracy: 80, countAccuracy: 80,
          deviationAccuracy: 80, numBots: 2, hadBlackjack: false,
          longestWinStreak: 6, splitAces: false, maxSplitHands: 1,
        },
      })
      engine.updateProgress(s1, [s1])
      expect(engine.getState().progress).toBe(6)

      const s2 = makeSession({
        mode: 'casinoSession', bestStreak: 4, timestamp: new Date().toISOString(),
        details: {
          type: 'casinoSession', handsPlayed: 30, netProfit: 50, overallScore: 70,
          grade: 'C', betAccuracy: 70, playAccuracy: 70, countAccuracy: 70,
          deviationAccuracy: 70, numBots: 2, hadBlackjack: false,
          longestWinStreak: 4, splitAces: false, maxSplitHands: 1,
        },
      })
      engine.updateProgress(s2, [s1, s2])
      expect(engine.getState().progress).toBe(6) // keeps max
    })
  })

  // ── getStreak ─────────────────────────────────────────────

  describe('getStreak', () => {
    it('returns 0 when no weeks completed', () => {
      expect(engine.getStreak()).toBe(0)
    })

    it('returns 1 when only this week is completed', () => {
      forceComplete(engine, '2026-03-23') // current week
      expect(engine.getStreak()).toBe(1)
    })

    it('counts consecutive weeks backward', () => {
      forceComplete(engine, '2026-03-09') // 2 weeks ago
      forceComplete(engine, '2026-03-16') // last week
      forceComplete(engine, '2026-03-23') // this week
      expect(engine.getStreak()).toBe(3)
    })

    it('counts from last week if this week not yet completed', () => {
      forceComplete(engine, '2026-03-09')
      forceComplete(engine, '2026-03-16')
      // Current week (2026-03-23) NOT completed
      expect(engine.getStreak()).toBe(2)
    })

    it('resets on a gap week', () => {
      forceComplete(engine, '2026-03-02')
      // 2026-03-09 is a gap
      forceComplete(engine, '2026-03-16')
      forceComplete(engine, '2026-03-23')
      expect(engine.getStreak()).toBe(2) // only last 2 weeks
    })

    it('returns 0 if last completion was 2+ weeks ago', () => {
      forceComplete(engine, '2026-03-02')
      // 2026-03-09 and 2026-03-16 are gaps
      expect(engine.getStreak()).toBe(0)
    })
  })

  // ── getTimeRemaining ──────────────────────────────────────

  describe('getTimeRemaining', () => {
    it('returns correct remaining time until end of week', () => {
      // Use a week without DST transition for predictable duration
      vi.setSystemTime(new Date(2026, 1, 25, 12, 0, 0)) // Wed Feb 25 noon local
      engine = new WeeklyChallengeEngine()
      const remaining = engine.getTimeRemaining()
      // End of week = Sun Mar 1 23:59:59 local
      // From Wed 12:00 → Sun 23:59:59 = 4 days + 11h + 59m + 59s
      expect(remaining.days).toBe(4)
      expect(remaining.hours).toBe(11)
      expect(remaining.minutes).toBe(59)
    })

    it('returns small values near end of week', () => {
      vi.setSystemTime(new Date(2026, 2, 29, 22, 30, 0)) // Sunday 22:30 local
      engine = new WeeklyChallengeEngine()
      const remaining = engine.getTimeRemaining()
      expect(remaining.days).toBe(0)
      expect(remaining.hours).toBe(1)
      expect(remaining.minutes).toBe(29)
    })
  })

  // ── Persistence ───────────────────────────────────────────

  describe('persistence', () => {
    it('saves state to localStorage and reloads', () => {
      const s = makeSession({ timestamp: new Date().toISOString() })
      engine.updateProgress(s, [s])
      const oldProgress = engine.getState().progress

      const engine2 = new WeeklyChallengeEngine()
      expect(engine2.getState().progress).toBe(oldProgress)
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('bjt_weekly_challenges', '{bad json!!!')
      const engine2 = new WeeklyChallengeEngine()
      expect(engine2.getState().progress).toBe(0)
      expect(engine2.getState().completed).toBe(false)
    })

    it('handles missing localStorage key', () => {
      localStorage.removeItem('bjt_weekly_challenges')
      const engine2 = new WeeklyChallengeEngine()
      expect(engine2.getState().progress).toBe(0)
    })

    it('resetAll clears everything', () => {
      forceComplete(engine, '2026-03-23')
      expect(engine.getStreak()).toBe(1)

      engine.resetAll()
      expect(engine.getState().progress).toBe(0)
      expect(engine.getState().completed).toBe(false)
      expect(engine.getStreak()).toBe(0)
      expect(engine.getTotalCompleted()).toBe(0)
      expect(engine.getTotalXP()).toBe(0)
      expect(localStorage.getItem('bjt_weekly_challenges')).toBeNull()
    })

    it('persists completedWeeks, totalCompleted, totalXP', () => {
      forceComplete(engine, '2026-03-23')
      const engine2 = new WeeklyChallengeEngine()
      expect(engine2.getTotalCompleted()).toBeGreaterThanOrEqual(1)
      expect(engine2.getTotalXP()).toBeGreaterThan(0)
    })
  })
})

// ── Helpers ──────────────────────────────────────────────────

/** Add days to a date string, return YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Format a Date as YYYY-MM-DD using local time. */
function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Find a Monday date where the hash maps to a specific challenge ID.
 * Brute-forces through weeks starting from Jan 2026.
 * Uses local time to match the engine's getWeekId().
 */
function findWeekForChallenge(challengeId: string): Date {
  const engine = new WeeklyChallengeEngine()
  const poolIndex = WEEKLY_CHALLENGE_POOL.findIndex(c => c.id === challengeId)
  if (poolIndex === -1) throw new Error(`Challenge ${challengeId} not in pool`)

  // Iterate Mondays (search 200 weeks to guarantee all 16 indices are hit)
  const start = new Date(2026, 0, 5, 12, 0, 0) // First Monday of 2026, noon local
  for (let w = 0; w < 200; w++) {
    const monday = new Date(start)
    monday.setDate(monday.getDate() + w * 7)
    const mondayStr = formatLocalDate(monday)
    const idx = engine.hashToIndex(mondayStr, WEEKLY_CHALLENGE_POOL.length)
    if (idx === poolIndex) {
      // Return Wednesday of this week for testing
      const wed = new Date(monday)
      wed.setDate(wed.getDate() + 2)
      return wed
    }
  }
  throw new Error(`Could not find a week for challenge ${challengeId}`)
}

/**
 * Force-complete a weekly challenge for a given weekId.
 */
function forceComplete(engine: WeeklyChallengeEngine, weekId: string): void {
  const raw = localStorage.getItem('bjt_weekly_challenges')
  const stored = raw ? JSON.parse(raw) : {
    current: null,
    completedWeeks: [],
    totalCompleted: 0,
    totalXP: 0,
  }

  const idx = engine.hashToIndex(weekId, WEEKLY_CHALLENGE_POOL.length)
  const challenge = WEEKLY_CHALLENGE_POOL[idx]

  if (!stored.completedWeeks.includes(weekId)) {
    stored.completedWeeks.push(weekId)
    stored.totalCompleted++
    stored.totalXP += challenge.xpReward
  }

  stored.current = {
    challengeId: challenge.id,
    weekId,
    progress: challenge.target,
    completed: true,
    completedAt: new Date(weekId + 'T18:00:00Z').toISOString(),
  }

  localStorage.setItem('bjt_weekly_challenges', JSON.stringify(stored))
  engine.reloadFromStorage()
}
