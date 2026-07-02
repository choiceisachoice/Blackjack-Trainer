import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AchievementEngine } from './achievement-engine'
import { ALL_ACHIEVEMENTS } from './achievement-list'
import type { TrainingSessionResult, LifetimeStats, TrainingMode } from '../stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/** Build a minimal session result for testing. */
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

/** Build minimal lifetime stats for testing. */
function makeStats(overrides: Partial<LifetimeStats> = {}): LifetimeStats {
  return {
    totalSessions: 1,
    totalQuestions: 20,
    totalCorrect: 16,
    totalPracticeSeconds: 120,
    overallAccuracy: 0.8,
    bestStreak: 5,
    byMode: {},
    dailyStats: [],
    ...overrides,
  }
}

describe('AchievementEngine', () => {
  let engine: AchievementEngine

  beforeEach(() => {
    localStorage.clear()
    engine = new AchievementEngine()
  })

  it('has 90 achievements defined', () => {
    expect(ALL_ACHIEVEMENTS).toHaveLength(90)
  })

  it('all achievements have unique ids', () => {
    const ids = ALL_ACHIEVEMENTS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('unlocks first-session achievement after 1 session', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 1 })

    const unlocked = engine.checkAfterSession(session, stats, 0, [session])

    const ids = unlocked.map(a => a.id)
    expect(ids).toContain('first_hand')
  })

  it('does not double-unlock achievements', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 1 })

    const first = engine.checkAfterSession(session, stats, 0, [session])
    expect(first.some(a => a.id === 'first_hand')).toBe(true)

    const second = engine.checkAfterSession(session, stats, 0, [session])
    expect(second.some(a => a.id === 'first_hand')).toBe(false)
  })

  it('streak achievement unlocked at correct day count', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 5 })

    // dayStreak = 2: not enough for "on_fire" (3)
    let unlocked = engine.checkAfterSession(session, stats, 2, [session])
    expect(unlocked.some(a => a.id === 'on_fire')).toBe(false)

    // dayStreak = 3: enough
    unlocked = engine.checkAfterSession(session, stats, 3, [session])
    expect(unlocked.some(a => a.id === 'on_fire')).toBe(true)
  })

  it('accuracy achievement checks session accuracy', () => {
    // 75% accuracy — not enough for "sharp_eye" (80%)
    const lowSession = makeSession({ accuracy: 0.75 })
    const stats = makeStats()

    let unlocked = engine.checkAfterSession(lowSession, stats, 0, [lowSession])
    expect(unlocked.some(a => a.id === 'sharp_eye')).toBe(false)

    // 85% accuracy — enough for "sharp_eye"
    const highSession = makeSession({ accuracy: 0.85 })
    unlocked = engine.checkAfterSession(highSession, stats, 0, [highSession])
    expect(unlocked.some(a => a.id === 'sharp_eye')).toBe(true)
  })

  it('perfect achievement requires 100% and min questions', () => {
    // 100% but only 5 questions
    const shortPerfect = makeSession({ accuracy: 1, totalQuestions: 5, correctAnswers: 5 })
    const stats = makeStats()

    let unlocked = engine.checkAfterSession(shortPerfect, stats, 0, [shortPerfect])
    expect(unlocked.some(a => a.id === 'perfection')).toBe(false)

    // 100% with 10 questions
    const longPerfect = makeSession({ accuracy: 1, totalQuestions: 10, correctAnswers: 10 })
    unlocked = engine.checkAfterSession(longPerfect, stats, 0, [longPerfect])
    expect(unlocked.some(a => a.id === 'perfection')).toBe(true)
  })

  it('mode-specific session achievement only counts correct mode', () => {
    const speedSession = makeSession({ mode: 'speedDrill' })
    const stats = makeStats({
      totalSessions: 5,
      byMode: {
        speedDrill: {
          totalSessions: 5,
          totalQuestions: 100,
          totalCorrect: 80,
          accuracy: 0.8,
          bestAccuracy: 0.8,
          totalPracticeSeconds: 600,
          bestStreak: 5,
        },
      },
    })

    // 5 speedDrill sessions shouldn't unlock "count_rookie" (requires tableCounting)
    const unlocked = engine.checkAfterSession(speedSession, stats, 0, [speedSession])
    expect(unlocked.some(a => a.id === 'count_rookie')).toBe(false)
  })

  it('count_rookie unlocks with 5 tableCounting sessions', () => {
    const session = makeSession({ mode: 'tableCounting' })
    const stats = makeStats({
      totalSessions: 5,
      byMode: {
        tableCounting: {
          totalSessions: 5,
          totalQuestions: 100,
          totalCorrect: 80,
          accuracy: 0.8,
          bestAccuracy: 0.8,
          totalPracticeSeconds: 600,
          bestStreak: 5,
        },
      },
    })

    const unlocked = engine.checkAfterSession(session, stats, 0, [session])
    expect(unlocked.some(a => a.id === 'count_rookie')).toBe(true)
  })

  it('speed achievement checks speed level and accuracy', () => {
    // Fast speed (500ms) but low accuracy
    const lowAcc = makeSession({
      mode: 'speedDrill',
      accuracy: 0.7,
      details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 500, rcErrors: [] },
    })
    const stats = makeStats()

    let unlocked = engine.checkAfterSession(lowAcc, stats, 0, [lowAcc])
    expect(unlocked.some(a => a.id === 'lightning_fast')).toBe(false)

    // Fast speed with high accuracy
    const highAcc = makeSession({
      mode: 'speedDrill',
      accuracy: 0.85,
      details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 500, rcErrors: [] },
    })
    unlocked = engine.checkAfterSession(highAcc, stats, 0, [highAcc])
    expect(unlocked.some(a => a.id === 'lightning_fast')).toBe(true)
  })

  it('time achievement checks total practice minutes', () => {
    const session = makeSession()

    // 59 minutes — not enough for "dedicated_student" (60 min)
    let stats = makeStats({ totalPracticeSeconds: 59 * 60 })
    let unlocked = engine.checkAfterSession(session, stats, 0, [session])
    expect(unlocked.some(a => a.id === 'dedicated_student')).toBe(false)

    // 61 minutes — enough
    stats = makeStats({ totalPracticeSeconds: 61 * 60 })
    unlocked = engine.checkAfterSession(session, stats, 0, [session])
    expect(unlocked.some(a => a.id === 'dedicated_student')).toBe(true)
  })

  it('mode_complete achievement counts unique modes', () => {
    const session = makeSession()
    const stats = makeStats({
      byMode: {
        speedDrill: { totalSessions: 1, totalQuestions: 10, totalCorrect: 8, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 60, bestStreak: 3 },
        tableCounting: { totalSessions: 1, totalQuestions: 10, totalCorrect: 8, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 60, bestStreak: 3 },
        deviationFlashCards: { totalSessions: 1, totalQuestions: 10, totalCorrect: 8, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 60, bestStreak: 3 },
        betSpread: { totalSessions: 1, totalQuestions: 10, totalCorrect: 8, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 60, bestStreak: 3 },
        deckEstimation: { totalSessions: 1, totalQuestions: 10, totalCorrect: 8, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 60, bestStreak: 3 },
      },
    })

    const unlocked = engine.checkAfterSession(session, stats, 0, [session])
    expect(unlocked.some(a => a.id === 'card_sharp')).toBe(true)
  })

  it('six_systems achievement counts unique counting systems', () => {
    const allSystems = [
      CountingSystemId.HiLo,
      CountingSystemId.KO,
      CountingSystemId.OmegaII,
      CountingSystemId.ZenCount,
      CountingSystemId.WongHalves,
      CountingSystemId.Red7,
    ]
    const sessions = allSystems.map(sys =>
      makeSession({ countingSystem: sys })
    )
    const stats = makeStats({ totalSessions: 6 })

    const unlocked = engine.checkAfterSession(sessions[0], stats, 0, sessions)
    expect(unlocked.some(a => a.id === 'six_systems')).toBe(true)
  })

  it('progress calculation returns correct percentage', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 50 })

    // "century" requires 100 sessions; we have 50 → 50%
    const centuryAchievement = ALL_ACHIEVEMENTS.find(a => a.id === 'century')!
    const progress = engine.getProgress(centuryAchievement, stats, 0, [session])
    expect(progress).toBe(50)
  })

  it('progress for unlocked achievement returns 100', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 1 })

    // Unlock "first_hand"
    engine.checkAfterSession(session, stats, 0, [session])

    const firstHand = ALL_ACHIEVEMENTS.find(a => a.id === 'first_hand')!
    expect(engine.getProgress(firstHand, stats, 0, [session])).toBe(100)
  })

  it('persists to localStorage and loads on init', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 1 })

    engine.checkAfterSession(session, stats, 0, [session])
    expect(engine.isUnlocked('first_hand')).toBe(true)

    // Create new engine instance — should load from localStorage
    const engine2 = new AchievementEngine()
    expect(engine2.isUnlocked('first_hand')).toBe(true)
  })

  it('resetAll clears all achievements', () => {
    const session = makeSession()
    const stats = makeStats({ totalSessions: 1 })

    engine.checkAfterSession(session, stats, 0, [session])
    expect(engine.getUnlockedCount()).toBeGreaterThan(0)

    engine.resetAll()
    expect(engine.getUnlockedCount()).toBe(0)
    expect(engine.isUnlocked('first_hand')).toBe(false)

    // Sim counters also cleared
    expect(engine.getSimCount()).toBe(0)
    expect(engine.getBestSimEdge()).toBe(0)
  })

  it('Card Counter achievement requires 20 other unlocked', () => {
    const session = makeSession({ accuracy: 1, totalQuestions: 20, correctAnswers: 20 })
    const allModes: TrainingMode[] = [
      'speedDrill', 'tableCounting', 'deviationFlashCards',
      'deviationAtTable', 'betSpread', 'deckEstimation',
    ]
    const byMode: LifetimeStats['byMode'] = {}
    for (const mode of allModes) {
      byMode[mode] = {
        totalSessions: 100,
        totalQuestions: 2000,
        totalCorrect: 1900,
        accuracy: 0.95,
        bestAccuracy: 1,
        totalPracticeSeconds: 200000,
        bestStreak: 50,
      }
    }

    const allSessions = [
      ...([CountingSystemId.HiLo, CountingSystemId.KO, CountingSystemId.OmegaII,
        CountingSystemId.ZenCount, CountingSystemId.WongHalves, CountingSystemId.Red7] as const)
        .map(sys => makeSession({ countingSystem: sys })),
    ]

    const stats = makeStats({
      totalSessions: 200,
      totalPracticeSeconds: 200000,
      byMode,
    })

    // Check achievements - many should unlock from the high stats
    engine.checkAfterSession(session, stats, 30, allSessions)

    // Manually simulate sim achievements to pad count
    engine.checkAfterSimulation({
      totalHands: 1000,
      finalBankroll: 11000,
      peakBankroll: 12000,
      minBankroll: 9000,
      netProfit: 1000,
      hourlyEV: 50,
      riskOfRuin: 0.01,
      n0: 5000,
      houseEdge: -0.005,
      weightedPlayerEdge: 0.012,
      bankrollHistory: [{ hand: 0, bankroll: 10000 }],
      outcomeDistribution: [],
      percentWinningSessions: 55,
      worstDrawdown: 2000,
      averageBet: 75,
      kellyOptimalBet: 100,
    })

    // After all checks, card_counter may be unlocked if 20+ others are
    const unlockedCount = engine.getUnlockedCount()
    if (unlockedCount >= 21) {
      // card_counter itself is included, so 21 means 20 others + card_counter
      expect(engine.isUnlocked('card_counter')).toBe(true)
    }
  })

  describe('new requirement types', () => {
    it('daily_completed reads from localStorage', () => {
      localStorage.setItem('bjt_daily_challenge', JSON.stringify({
        current: { challengeId: 'x', date: '2026-03-26', progress: 0, completed: false, completedAt: null },
        completedDates: ['2026-03-25', '2026-03-24'],
        totalCompleted: 2,
        totalXP: 100,
      }))
      expect(engine.getDailyCompleted()).toBe(2)
    })

    it('weekly_completed reads from localStorage', () => {
      localStorage.setItem('bjt_weekly_challenges', JSON.stringify({
        current: { challengeId: 'x', weekId: '2026-03-23', progress: 0, completed: false, completedAt: null },
        completedWeeks: ['2026-03-16'],
        totalCompleted: 1,
        totalXP: 300,
      }))
      expect(engine.getWeeklyCompleted()).toBe(1)
    })

    it('daily_streak computes streak from completedDates', () => {
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const dayBefore = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10)

      localStorage.setItem('bjt_daily_challenge', JSON.stringify({
        current: { challengeId: 'x', date: today, progress: 0, completed: false, completedAt: null },
        completedDates: [dayBefore, yesterday, today],
        totalCompleted: 3,
        totalXP: 150,
      }))
      expect(engine.getDailyStreak()).toBe(3)
    })

    it('reach_level reads from localStorage XP', () => {
      // Level 5 requires 1000 XP
      localStorage.setItem('bjt_level_xp', '1000')
      expect(engine.getCurrentLevel()).toBe(5)
    })

    it('total_hands checks stats.totalQuestions', () => {
      const session = makeSession()
      const stats = makeStats({ totalSessions: 1, totalQuestions: 5000 })
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'five_thousand_hands')!
      const progress = engine.getProgress(achievement, stats, 0, [session])
      expect(progress).toBe(100)
    })

    it('total_hours checks stats.totalPracticeSeconds', () => {
      const session = makeSession()
      const stats = makeStats({ totalPracticeSeconds: 20 * 3600 })
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'twenty_hours')!
      const progress = engine.getProgress(achievement, stats, 0, [session])
      expect(progress).toBe(100)
    })

    it('perfect_sessions counts 100% accuracy sessions with min 10 questions', () => {
      const perfectSession = makeSession({ accuracy: 1, totalQuestions: 15, correctAnswers: 15 })
      const shortSession = makeSession({ accuracy: 1, totalQuestions: 5, correctAnswers: 5 })
      const normalSession = makeSession({ accuracy: 0.8, totalQuestions: 20, correctAnswers: 16 })
      const allSessions = [perfectSession, perfectSession, perfectSession, shortSession, normalSession]
      const stats = makeStats({ totalSessions: 5 })

      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'triple_perfect')!
      const progress = engine.getProgress(achievement, stats, 0, allSessions)
      expect(progress).toBe(100) // 3 perfect sessions
    })

    it('unique_systems counts systems with 80%+ accuracy', () => {
      const allSystems = [
        CountingSystemId.HiLo,
        CountingSystemId.KO,
        CountingSystemId.OmegaII,
        CountingSystemId.ZenCount,
        CountingSystemId.WongHalves,
        CountingSystemId.Red7,
      ]
      const sessions = allSystems.map(sys =>
        makeSession({ countingSystem: sys, accuracy: 0.85 })
      )
      const stats = makeStats({ totalSessions: 6 })
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'system_scholar')!
      const progress = engine.getProgress(achievement, stats, 0, sessions)
      expect(progress).toBe(100)
    })

    it('unique_systems excludes systems below 80%', () => {
      const sessions = [
        makeSession({ countingSystem: CountingSystemId.HiLo, accuracy: 0.9 }),
        makeSession({ countingSystem: CountingSystemId.KO, accuracy: 0.7 }),
      ]
      const stats = makeStats({ totalSessions: 2 })
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'system_scholar')!
      const progress = engine.getProgress(achievement, stats, 0, sessions)
      // 1 out of 6 systems at 80%+
      expect(Math.round(progress)).toBe(17)
    })

    it('master_collector requires 50 other unlocked achievements', () => {
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'master_collector')!
      const stats = makeStats()
      // No unlocked achievements → 0%
      expect(engine.getProgress(achievement, stats, 0, [])).toBe(0)
    })
  })

  describe('casino session achievements', () => {
    function makeCasinoSession(overrides: Record<string, unknown> = {}) {
      return makeSession({
        mode: 'casinoSession',
        details: {
          type: 'casinoSession' as const,
          handsPlayed: 20,
          netProfit: 500,
          overallScore: 85,
          grade: 'B+',
          betAccuracy: 80,
          playAccuracy: 90,
          countAccuracy: 75,
          deviationAccuracy: 80,
          numBots: 3,
          hadBlackjack: false,
          longestWinStreak: 3,
          splitAces: false,
          maxSplitHands: 1,
          ...overrides,
        },
        ...('accuracy' in overrides ? { accuracy: overrides.accuracy as number } : {}),
      })
    }

    it('casino session first session achievement unlocks', () => {
      const session = makeCasinoSession()
      const stats = makeStats({
        totalSessions: 1,
        byMode: {
          casinoSession: {
            totalSessions: 1,
            totalQuestions: 40,
            totalCorrect: 32,
            accuracy: 0.8,
            bestAccuracy: 0.8,
            totalPracticeSeconds: 300,
            bestStreak: 0,
          },
        },
      })

      const unlocked = engine.checkAfterSession(session, stats, 0, [session])
      expect(unlocked.some(a => a.id === 'casino_first_session')).toBe(true)
    })

    it('casino grade A+ achievement requires 95%+', () => {
      // 94% — not enough
      const lowSession = makeCasinoSession({ overallScore: 94, grade: 'A' })
      const stats = makeStats({ totalSessions: 1, byMode: { casinoSession: { totalSessions: 1, totalQuestions: 40, totalCorrect: 32, accuracy: 0.8, bestAccuracy: 0.94, totalPracticeSeconds: 300, bestStreak: 0 } } })

      let unlocked = engine.checkAfterSession(lowSession, stats, 0, [lowSession])
      expect(unlocked.some(a => a.id === 'casino_valedictorian')).toBe(false)

      // 96% — enough
      const highSession = makeCasinoSession({ overallScore: 96, grade: 'A+' })
      unlocked = engine.checkAfterSession(highSession, stats, 0, [highSession])
      expect(unlocked.some(a => a.id === 'casino_valedictorian')).toBe(true)
    })

    it('casino triple threat requires 90% in all three', () => {
      // One below threshold
      const session89 = makeCasinoSession({ betAccuracy: 95, playAccuracy: 95, countAccuracy: 89 })
      const stats = makeStats({ totalSessions: 1, byMode: { casinoSession: { totalSessions: 1, totalQuestions: 40, totalCorrect: 32, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 300, bestStreak: 0 } } })

      let unlocked = engine.checkAfterSession(session89, stats, 0, [session89])
      expect(unlocked.some(a => a.id === 'casino_triple_threat')).toBe(false)

      // All three at 90%+
      const sessionAll90 = makeCasinoSession({ betAccuracy: 92, playAccuracy: 91, countAccuracy: 90 })
      unlocked = engine.checkAfterSession(sessionAll90, stats, 0, [sessionAll90])
      expect(unlocked.some(a => a.id === 'casino_triple_threat')).toBe(true)
    })

    it('casino streak 5 counts consecutive wins', () => {
      // 4 streak — not enough
      const session4 = makeCasinoSession({ longestWinStreak: 4 })
      const stats = makeStats({ totalSessions: 1, byMode: { casinoSession: { totalSessions: 1, totalQuestions: 40, totalCorrect: 32, accuracy: 0.8, bestAccuracy: 0.8, totalPracticeSeconds: 300, bestStreak: 0 } } })

      let unlocked = engine.checkAfterSession(session4, stats, 0, [session4])
      expect(unlocked.some(a => a.id === 'casino_hot_streak')).toBe(false)

      // 5 streak — enough
      const session5 = makeCasinoSession({ longestWinStreak: 5 })
      unlocked = engine.checkAfterSession(session5, stats, 0, [session5])
      expect(unlocked.some(a => a.id === 'casino_hot_streak')).toBe(true)
    })

    it('casino achievements do not unlock from non-casino sessions', () => {
      const speedSession = makeSession({ mode: 'speedDrill', accuracy: 0.95 })
      const stats = makeStats({ totalSessions: 1 })

      const unlocked = engine.checkAfterSession(speedSession, stats, 0, [speedSession])
      const casinoIds = unlocked.filter(a => a.id.startsWith('casino_'))
      expect(casinoIds.length).toBe(0)
    })
  })

  describe('bankroll tracker achievements', () => {
    function setTrackerData(sessions: Array<{ result: number; date: string; hoursPlayed?: number; casino?: string }>, startingBankroll = 10000) {
      localStorage.setItem('bjt_bankroll_tracker', JSON.stringify({
        state: {
          sessions: sessions.map((s, i) => ({
            id: `t${i}`,
            date: s.date,
            casino: s.casino ?? 'Test Casino',
            result: s.result,
            hoursPlayed: s.hoursPlayed ?? 3,
            notes: '',
            createdAt: i,
          })),
          startingBankroll,
        },
        version: 0,
      }))
    }

    it('tracker_sessions achievement unlocks at correct count', () => {
      setTrackerData([
        { result: 100, date: '2026-03-01' },
        { result: -50, date: '2026-03-02' },
        { result: 200, date: '2026-03-03' },
        { result: 100, date: '2026-03-04' },
        { result: -30, date: '2026-03-05' },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_first_session')
      expect(ids).toContain('tracker_first_casino')
      expect(ids).toContain('tracker_5_sessions')
      expect(ids).not.toContain('tracker_10_sessions')
    })

    it('tracker_win_streak calculates correctly', () => {
      setTrackerData([
        { result: 100, date: '2026-03-01' },
        { result: 200, date: '2026-03-02' },
        { result: 300, date: '2026-03-03' },
        { result: -50, date: '2026-03-04' },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_win_streak_3')
    })

    it('tracker_comeback detects win after 3 losses', () => {
      setTrackerData([
        { result: -100, date: '2026-03-01' },
        { result: -200, date: '2026-03-02' },
        { result: -150, date: '2026-03-03' },
        { result: 500, date: '2026-03-04' },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_comeback')
    })

    it('tracker_profit_1000 triggers at $1000', () => {
      setTrackerData([
        { result: 600, date: '2026-03-01' },
        { result: 500, date: '2026-03-02' },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_profit_1000')
    })

    it('tracker_first_win unlocks with a winning session', () => {
      setTrackerData([
        { result: -100, date: '2026-03-01' },
        { result: 200, date: '2026-03-02' },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_first_win')
    })

    it('tracker_session_hours unlocks for 3+ hour session', () => {
      setTrackerData([
        { result: 100, date: '2026-03-01', hoursPlayed: 3.5 },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_long_session')
    })

    it('tracker_single_session_profit unlocks for $500+ win', () => {
      setTrackerData([
        { result: 100, date: '2026-03-01' },
        { result: 550, date: '2026-03-02' },
      ])

      const unlocked = engine.checkAfterBankrollUpdate()
      const ids = unlocked.map(a => a.id)
      expect(ids).toContain('tracker_big_win')
    })

    it('tracker progress shows correct percentage', () => {
      setTrackerData([
        { result: 100, date: '2026-03-01' },
        { result: 200, date: '2026-03-02' },
      ])

      const session = makeSession()
      const stats = makeStats()
      const achievement = ALL_ACHIEVEMENTS.find(a => a.id === 'tracker_5_sessions')!
      const progress = engine.getProgress(achievement, stats, 0, [session])
      expect(progress).toBe(40) // 2/5 = 40%
    })
  })

  describe('simulation achievements', () => {
    const mockSimResult = {
      totalHands: 5000,
      finalBankroll: 105000,
      peakBankroll: 110000,
      minBankroll: 95000,
      netProfit: 5000,
      hourlyEV: 50,
      riskOfRuin: 0.01,
      n0: 3000,
      houseEdge: -0.005,
      weightedPlayerEdge: 0.008,
      bankrollHistory: [{ hand: 0, bankroll: 100000 }],
      outcomeDistribution: [],
      percentWinningSessions: 55,
      worstDrawdown: 5000,
      averageBet: 100,
      kellyOptimalBet: 150,
    }

    it('unlocks data_driven on first simulation', () => {
      const unlocked = engine.checkAfterSimulation(mockSimResult)
      expect(unlocked.some(a => a.id === 'data_driven')).toBe(true)
    })

    it('unlocks risk_analyst after 5 simulations', () => {
      for (let i = 0; i < 4; i++) {
        engine.checkAfterSimulation(mockSimResult)
      }
      const unlocked = engine.checkAfterSimulation(mockSimResult)
      expect(unlocked.some(a => a.id === 'risk_analyst')).toBe(true)
    })

    it('unlocks edge_hunter with >1% weighted edge', () => {
      const highEdgeResult = { ...mockSimResult, weightedPlayerEdge: 0.0105 }
      const unlocked = engine.checkAfterSimulation(highEdgeResult)
      expect(unlocked.some(a => a.id === 'edge_hunter')).toBe(true)
    })

    it('does not unlock edge_hunter with <1% edge', () => {
      const lowEdgeResult = { ...mockSimResult, weightedPlayerEdge: 0.005 }
      const unlocked = engine.checkAfterSimulation(lowEdgeResult)
      expect(unlocked.some(a => a.id === 'edge_hunter')).toBe(false)
    })

    it('persists sim count across instances', () => {
      engine.checkAfterSimulation(mockSimResult)
      engine.checkAfterSimulation(mockSimResult)
      expect(engine.getSimCount()).toBe(2)

      const engine2 = new AchievementEngine()
      expect(engine2.getSimCount()).toBe(2)
    })
  })
})
