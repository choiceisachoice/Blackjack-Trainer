import type { Achievement, UnlockedAchievement } from './achievement-types'
import type { TrainingSessionResult, LifetimeStats, TrainingMode, CasinoSessionDetails } from '../stats-types'
import type { SimulationResult } from '../../engine/simulation/types'
import { ALL_ACHIEVEMENTS } from './achievement-list'
import { LEVELS } from '../level-system'
import { todayKey, dayKeyOffset, daysBetweenKeys } from '../date-utils'
import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'

/** Minimum accuracy for a single deviation to count as "mastered". */
const MASTERY_ACCURACY = 0.75

/**
 * Minimum sample sizes before a casino accuracy/grade achievement can unlock.
 * Without these, an empty denominator (counting turned off, no deviation
 * situation, a 2-hand session) defaults to 100% and hands out gold/diamond
 * achievements for skill that was never demonstrated.
 */
const MIN_COUNT_CHECKS = 5
const MIN_DEVIATION_SITUATIONS = 3
const MIN_GRADE_HANDS = 20

const STORAGE_KEY = 'bjt_achievements'
const SIM_COUNT_KEY = 'bjt_sim_count'
const SIM_BEST_EDGE_KEY = 'bjt_sim_best_edge'
const DAILY_CHALLENGE_KEY = 'bjt_daily_challenge'
const WEEKLY_CHALLENGE_KEY = 'bjt_weekly_challenges'
const LEVEL_XP_KEY = 'bjt_level_xp'
const BANKROLL_TRACKER_KEY = 'bjt_bankroll_tracker'

/** Shape of a tracked session in the bankroll tracker store. */
interface TrackerSession {
  result: number
  hoursPlayed: number
  casino: string
  date: string
}

/** Speed level mapping: achievement value → max speedMs threshold. */
const SPEED_LEVEL_MS: Record<number, number> = {
  1: 1000,  // Normal
  2: 500,   // Fast
}

/** The five core training modes used for breadth / variety achievements. */
const CORE_MODES: TrainingMode[] = [
  'speedDrill', 'deviationFlashCards', 'betSpread', 'deckEstimation', 'casinoSession',
]

/**
 * Achievement engine that tracks and awards achievements.
 *
 * Stores unlock state in localStorage. Exposes methods to check
 * session-based and simulation-based achievements.
 */
export class AchievementEngine {
  private unlocked: UnlockedAchievement[] = []

  constructor() {
    this.loadFromStorage()
  }

  /**
   * Check all achievements after a training session.
   * Returns newly unlocked achievements.
   */
  checkAfterSession(
    session: TrainingSessionResult,
    stats: LifetimeStats,
    dayStreak: number,
    allSessions: TrainingSessionResult[],
  ): Achievement[] {
    const newlyUnlocked: Achievement[] = []

    for (const achievement of ALL_ACHIEVEMENTS) {
      if (this.isUnlocked(achievement.id)) continue
      if (this.meetsRequirement(achievement, session, stats, dayStreak, allSessions)) {
        this.unlock(achievement.id)
        newlyUnlocked.push(achievement)
      }
    }

    // Check meta achievements after potentially unlocking others
    this.checkMetaAchievements(newlyUnlocked)

    return newlyUnlocked
  }

  /**
   * Check simulation-related achievements after a bankroll simulation.
   * Returns newly unlocked achievements.
   */
  checkAfterSimulation(result: SimulationResult): Achievement[] {
    const newlyUnlocked: Achievement[] = []

    // Increment sim count
    const simCount = this.getSimCount() + 1
    this.setSimCount(simCount)

    // Track best edge (in basis points)
    const edgeBps = Math.round(result.weightedPlayerEdge * 10000)
    const bestEdge = this.getBestSimEdge()
    if (edgeBps > bestEdge) {
      this.setBestSimEdge(edgeBps)
    }

    // Check "Data Driven" — first sim
    const dataDriven = ALL_ACHIEVEMENTS.find(a => a.id === 'data_driven')
    if (dataDriven && !this.isUnlocked('data_driven') && simCount >= 1) {
      this.unlock('data_driven')
      newlyUnlocked.push(dataDriven)
    }

    // Check "Risk Analyst" — 5 sims
    const riskAnalyst = ALL_ACHIEVEMENTS.find(a => a.id === 'risk_analyst')
    if (riskAnalyst && !this.isUnlocked('risk_analyst') && simCount >= 5) {
      this.unlock('risk_analyst')
      newlyUnlocked.push(riskAnalyst)
    }

    // Check "Edge Hunter" — >1% weighted edge (100 bps)
    const edgeHunter = ALL_ACHIEVEMENTS.find(a => a.id === 'edge_hunter')
    if (edgeHunter && !this.isUnlocked('edge_hunter') && edgeBps >= 100) {
      this.unlock('edge_hunter')
      newlyUnlocked.push(edgeHunter)
    }

    // Check meta achievements
    this.checkMetaAchievements(newlyUnlocked)

    return newlyUnlocked
  }

  /**
   * Check bankroll-tracker achievements after a session is added/edited/deleted.
   * Returns newly unlocked achievements.
   */
  checkAfterBankrollUpdate(): Achievement[] {
    const newlyUnlocked: Achievement[] = []

    for (const achievement of ALL_ACHIEVEMENTS) {
      if (achievement.category !== 'bankrollTracker') continue
      if (this.isUnlocked(achievement.id)) continue
      if (this.meetsBankrollRequirement(achievement)) {
        this.unlock(achievement.id)
        newlyUnlocked.push(achievement)
      }
    }

    // Check meta achievements
    this.checkMetaAchievements(newlyUnlocked)

    return newlyUnlocked
  }

  /** Check if an achievement is unlocked. */
  isUnlocked(id: string): boolean {
    return this.unlocked.some(u => u.achievementId === id)
  }

  /** Get all unlocked achievements. */
  getUnlocked(): UnlockedAchievement[] {
    return [...this.unlocked]
  }

  /**
   * Re-read the unlock set from localStorage. Used after the local caches are
   * wiped (sign-out / a different user signing in) so the in-memory singleton
   * cannot keep serving the previous user's unlocks.
   */
  reloadFromStorage(): void {
    this.unlocked = []
    this.loadFromStorage()
  }

  /** Get number of unlocked achievements. */
  getUnlockedCount(): number {
    return this.unlocked.length
  }

  /**
   * Merge a remote unlock set into the local one (a union — an achievement
   * stays unlocked if either side has it, keeping the earliest unlock time).
   * Unknown remote ids are ignored so a stale cloud row can't inflate the count.
   * Persists the merged set and returns the entries that existed only locally,
   * so the caller can push those up to the cloud.
   */
  mergeUnlocked(remote: UnlockedAchievement[]): UnlockedAchievement[] {
    const knownRemote = remote.filter(r => ALL_ACHIEVEMENTS.some(a => a.id === r.achievementId))
    const localOnly = this.unlocked.filter(
      local => !knownRemote.some(r => r.achievementId === local.achievementId),
    )

    const byId = new Map<string, UnlockedAchievement>()
    for (const u of this.unlocked) byId.set(u.achievementId, u)
    for (const r of knownRemote) {
      const existing = byId.get(r.achievementId)
      if (!existing) {
        byId.set(r.achievementId, r)
      } else if (r.unlockedAt < existing.unlockedAt) {
        byId.set(r.achievementId, { ...existing, unlockedAt: r.unlockedAt })
      }
    }

    this.unlocked = [...byId.values()]
    this.saveToStorage()
    return localOnly
  }

  /**
   * Get progress percentage (0-100) for an achievement.
   */
  getProgress(
    achievement: Achievement,
    stats: LifetimeStats,
    dayStreak: number,
    allSessions: TrainingSessionResult[],
  ): number {
    if (this.isUnlocked(achievement.id)) return 100

    const req = achievement.requirement

    switch (req.type) {
      case 'sessions': {
        const count = req.mode
          ? (stats.byMode[req.mode]?.totalSessions ?? 0)
          : stats.totalSessions
        return Math.min(100, (count / req.value) * 100)
      }

      case 'meta_unlocks': {
        const otherUnlocked = this.unlocked.filter(u => u.achievementId !== achievement.id).length
        return Math.min(100, (otherUnlocked / req.value) * 100)
      }

      case 'accuracy': {
        if (req.mode) {
          const modeStats = stats.byMode[req.mode]
          if (!modeStats) return 0
          return Math.min(100, (modeStats.bestAccuracy * 100 / req.value) * 100)
        }
        // Generic: best session accuracy across all sessions
        const bestSession = allSessions.reduce(
          (best, s) => (s.accuracy > best ? s.accuracy : best), 0)
        return Math.min(100, (bestSession * 100 / req.value) * 100)
      }

      case 'streak':
        return Math.min(100, (dayStreak / req.value) * 100)

      case 'hands': {
        const modeStats = req.mode ? stats.byMode[req.mode] : null
        const hands = modeStats?.totalQuestions ?? 0
        return Math.min(100, (hands / req.value) * 100)
      }

      case 'time': {
        const minutes = stats.totalPracticeSeconds / 60
        return Math.min(100, (minutes / req.value) * 100)
      }

      case 'perfect':
        return 0 // Binary: either you have it or you don't

      case 'speed':
        return 0 // Binary

      case 'mode_complete': {
        const uniqueModes = Object.keys(stats.byMode).filter(
          m => (stats.byMode[m as TrainingMode]?.totalSessions ?? 0) > 0
        )
        return Math.min(100, (uniqueModes.length / req.value) * 100)
      }

      case 'bankroll_sim': {
        if (achievement.id === 'edge_hunter') {
          const bestEdge = this.getBestSimEdge()
          return Math.min(100, (bestEdge / 100) * 100)
        }
        const simCount = this.getSimCount()
        return Math.min(100, (simCount / req.value) * 100)
      }

      // Casino session achievements: binary (0 or 100) based on best session
      case 'casino_bots':
      case 'casino_hands':
      case 'casino_grade':
      case 'casino_bet_accuracy':
      case 'casino_play_accuracy':
      case 'casino_count_accuracy':
      case 'casino_triple':
      case 'casino_profit':
      case 'casino_blackjack':
      case 'casino_streak':
      case 'casino_split_aces':
      case 'casino_max_split':
      case 'casino_deviation_accuracy':
        return this.getCasinoProgress(allSessions, req.type, req.value)

      case 'casino_grade_count': {
        let cnt = 0
        for (const s of allSessions) {
          if (s.mode === 'casinoSession' && s.details.type === 'casinoSession') {
            const d = s.details as CasinoSessionDetails
            if (d.overallScore >= 95) cnt++
          }
        }
        return Math.min(100, (cnt / req.value) * 100)
      }

      case 'daily_completed':
        return Math.min(100, (this.getDailyCompleted() / req.value) * 100)

      case 'weekly_completed':
        return Math.min(100, (this.getWeeklyCompleted() / req.value) * 100)

      case 'daily_streak':
        return Math.min(100, (this.getDailyStreak() / req.value) * 100)

      case 'reach_level':
        return Math.min(100, (this.getCurrentLevel() / req.value) * 100)

      case 'total_hands':
        return Math.min(100, (stats.totalQuestions / req.value) * 100)

      case 'total_hours': {
        const hours = stats.totalPracticeSeconds / 3600
        return Math.min(100, (hours / req.value) * 100)
      }

      case 'perfect_sessions':
        return Math.min(100, (this.countPerfectSessions(allSessions) / req.value) * 100)

      case 'speed_drill_perfect':
        return 0 // Binary

      case 'tracker_sessions':
        return Math.min(100, (this.getTrackerSessions().length / req.value) * 100)

      case 'tracker_first_win':
        return this.getTrackerSessions().some(s => s.result > 0) ? 100 : 0

      case 'tracker_win_streak':
        return Math.min(100, (this.getTrackerWinStreak() / req.value) * 100)

      case 'tracker_total_profit':
        return req.value > 0 ? Math.min(100, (this.getTrackerProfit() / req.value) * 100) : 0

      case 'tracker_total_hours':
        return req.value > 0 ? Math.min(100, (this.getTrackerHours() / req.value) * 100) : 0

      case 'tracker_session_hours':
        return this.getTrackerLongestSession() >= req.value ? 100 : 0

      case 'tracker_single_session_profit':
        return this.getTrackerBestSession() >= req.value ? 100 : 0

      case 'tracker_comeback':
        return this.getTrackerHasComeback(req.value) ? 100 : 0

      // ── Balance-pass requirement types ──
      case 'sustained_accuracy': {
        if (!req.mode || !req.window) return 0
        const { count, avg } = this.sustainedAccuracy(allSessions, req.mode, req.window)
        const accProgress = (avg * 100 / req.value) * 100
        const countCap = (count / req.window) * 100
        return Math.min(100, Math.max(0, Math.min(accProgress, countCap)))
      }

      case 'all_modes_accuracy':
        return Math.min(100, (this.coreModesAtAccuracy(stats, req.value) / CORE_MODES.length) * 100)

      case 'session_streak':
        return Math.min(100, (this.bestSessionStreak(allSessions) / req.value) * 100)

      case 'quickfire_accuracy':
        return Math.min(100, (this.bestQuickFireAccuracy(allSessions) * 100 / req.value) * 100)

      case 'speed_accuracy':
        return Math.min(100, (this.bestFastSpeedAccuracy(allSessions) * 100 / req.value) * 100)

      case 'session_duration':
        return Math.min(100, (this.longestSessionMinutes(allSessions) / req.value) * 100)

      case 'modes_in_day': {
        // Best single-day coverage across all recorded days.
        const byDay = new Map<string, Set<TrainingMode>>()
        for (const s of allSessions) {
          if (!CORE_MODES.includes(s.mode)) continue
          const day = s.timestamp.slice(0, 10)
          const set = byDay.get(day) ?? new Set<TrainingMode>()
          set.add(s.mode)
          byDay.set(day, set)
        }
        const best = [...byDay.values()].reduce((m, set) => Math.max(m, set.size), 0)
        return Math.min(100, (best / req.value) * 100)
      }

      case 'night_session':
        return this.hasNightSession(allSessions) ? 100 : 0

      case 'deviation_set_mastery': {
        if (!req.deviationSet) return 0
        const { mastered, total } = this.masteredCountForSet(allSessions, req.deviationSet, req.value)
        return total > 0 ? Math.min(100, (mastered / total) * 100) : 0
      }

      default:
        return 0
    }
  }

  /** Clear all achievements and sim tracking data. */
  resetAll(): void {
    this.unlocked = []
    this.saveToStorage()
    try {
      localStorage.removeItem(SIM_COUNT_KEY)
      localStorage.removeItem(SIM_BEST_EDGE_KEY)
    } catch { /* ignore */ }
  }

  // ── Private helpers ──────────────────────────────────

  private meetsRequirement(
    achievement: Achievement,
    session: TrainingSessionResult,
    stats: LifetimeStats,
    dayStreak: number,
    allSessions: TrainingSessionResult[],
  ): boolean {
    const req = achievement.requirement

    switch (req.type) {
      case 'sessions': {
        if (achievement.id === 'card_counter') return false // handled separately
        if (achievement.id === 'master_collector') return false // handled separately
        const count = req.mode
          ? (stats.byMode[req.mode]?.totalSessions ?? 0)
          : stats.totalSessions
        return count >= req.value
      }

      case 'accuracy': {
        if (req.mode) {
          // Mode-specific: check mode's best accuracy
          const modeStats = stats.byMode[req.mode]
          return modeStats ? modeStats.bestAccuracy * 100 >= req.value : false
        }
        // Generic: check current session accuracy
        return session.accuracy * 100 >= req.value
      }

      case 'streak':
        return dayStreak >= req.value

      case 'hands': {
        const modeStats = req.mode ? stats.byMode[req.mode] : null
        return (modeStats?.totalQuestions ?? 0) >= req.value
      }

      case 'time':
        return stats.totalPracticeSeconds / 60 >= req.value

      case 'perfect':
        return session.accuracy === 1 && session.totalQuestions >= req.value

      case 'speed':
        return this.checkSpeedAchievement(session, req.value)

      case 'mode_complete': {
        const uniqueModes = Object.keys(stats.byMode).filter(
          m => (stats.byMode[m as TrainingMode]?.totalSessions ?? 0) > 0
        )
        return uniqueModes.length >= req.value
      }

      case 'bankroll_sim':
        return false // Handled in checkAfterSimulation

      // Casino session achievements — check the current session's details
      case 'casino_bots':
      case 'casino_hands':
      case 'casino_grade':
      case 'casino_bet_accuracy':
      case 'casino_play_accuracy':
      case 'casino_count_accuracy':
      case 'casino_triple':
      case 'casino_profit':
      case 'casino_blackjack':
      case 'casino_streak':
      case 'casino_split_aces':
      case 'casino_max_split':
      case 'casino_deviation_accuracy':
        return this.checkCasinoAchievement(session, req.type, req.value)

      case 'casino_grade_count':
        return this.checkCasinoGradeCount(allSessions, req.value)

      // ── Balance-pass requirement types ──
      case 'sustained_accuracy': {
        if (!req.mode || !req.window) return false
        const { count, avg } = this.sustainedAccuracy(allSessions, req.mode, req.window)
        return count >= req.window && avg * 100 >= req.value
      }

      case 'all_modes_accuracy':
        return this.coreModesAtAccuracy(stats, req.value) >= CORE_MODES.length

      case 'session_streak':
        return session.bestStreak >= req.value

      case 'quickfire_accuracy':
        return session.mode === 'deckEstimation' &&
               session.details.type === 'deckEstimation' &&
               session.details.quickFire &&
               session.accuracy * 100 >= req.value

      case 'speed_accuracy':
        return session.mode === 'speedDrill' &&
               session.details.type === 'speedDrill' &&
               session.details.speedMs <= SPEED_LEVEL_MS[2] &&
               session.accuracy * 100 >= req.value

      case 'session_duration':
        return session.durationSeconds / 60 >= req.value

      case 'modes_in_day':
        return this.coreModesOnDay(session, allSessions) >= req.value

      case 'night_session':
        return new Date(session.timestamp).getHours() < 5

      case 'deviation_set_mastery': {
        if (!req.deviationSet) return false
        const { mastered, total } = this.masteredCountForSet(allSessions, req.deviationSet, req.value)
        return total > 0 && mastered >= total
      }

      case 'meta_unlocks':
        return false // handled by checkMetaAchievements

      case 'daily_completed':
        return this.getDailyCompleted() >= req.value

      case 'weekly_completed':
        return this.getWeeklyCompleted() >= req.value

      case 'daily_streak':
        return this.getDailyStreak() >= req.value

      case 'reach_level':
        return this.getCurrentLevel() >= req.value

      case 'total_hands':
        return stats.totalQuestions >= req.value

      case 'total_hours':
        return stats.totalPracticeSeconds / 3600 >= req.value

      case 'perfect_sessions':
        return this.countPerfectSessions(allSessions) >= req.value

      case 'speed_drill_perfect':
        return this.checkSpeedDrillPerfect(session, req.value)

      // Bankroll tracker achievements — handled by checkAfterBankrollUpdate
      case 'tracker_sessions':
      case 'tracker_first_win':
      case 'tracker_win_streak':
      case 'tracker_total_profit':
      case 'tracker_total_hours':
      case 'tracker_session_hours':
      case 'tracker_single_session_profit':
      case 'tracker_comeback':
        return false

      default:
        return false
    }
  }

  /**
   * Check if a speed drill session qualifies for a speed achievement.
   * Maps speed level to max speedMs, requires 80%+ accuracy.
   */
  private checkSpeedAchievement(session: TrainingSessionResult, speedLevel: number): boolean {
    if (session.mode !== 'speedDrill') return false
    if (session.accuracy < 0.8) return false

    const details = session.details
    if (details.type !== 'speedDrill') return false

    const maxMs = SPEED_LEVEL_MS[speedLevel]
    if (!maxMs) return false

    return details.speedMs <= maxMs
  }

  /**
   * Get progress for a casino session achievement across all sessions.
   */
  private getCasinoProgress(
    allSessions: TrainingSessionResult[],
    type: string,
    target: number,
  ): number {
    let bestValue = 0

    for (const s of allSessions) {
      if (s.mode !== 'casinoSession' || s.details.type !== 'casinoSession') continue
      const d = s.details as CasinoSessionDetails

      let val = 0
      switch (type) {
        case 'casino_bots': val = d.numBots; break
        case 'casino_hands': val = d.handsPlayed; break
        case 'casino_grade': val = d.overallScore; break
        case 'casino_bet_accuracy': val = d.betAccuracy; break
        case 'casino_play_accuracy': val = d.playAccuracy; break
        case 'casino_count_accuracy': val = d.countAccuracy; break
        case 'casino_triple': val = Math.min(d.betAccuracy, d.playAccuracy, d.countAccuracy); break
        case 'casino_profit': val = d.netProfit; break
        case 'casino_blackjack': return d.hadBlackjack ? 100 : 0
        case 'casino_streak': val = d.longestWinStreak; break
        case 'casino_split_aces': return d.splitAces ? 100 : 0
        case 'casino_max_split': val = d.maxSplitHands; break
        case 'casino_deviation_accuracy': val = d.deviationAccuracy; break
      }
      if (val > bestValue) bestValue = val
    }

    return target > 0 ? Math.min(100, (bestValue / target) * 100) : 0
  }

  /**
   * Check a casino session achievement against the current session.
   */
  private checkCasinoAchievement(
    session: TrainingSessionResult,
    type: string,
    value: number,
  ): boolean {
    if (session.mode !== 'casinoSession') return false
    const d = session.details
    if (d.type !== 'casinoSession') return false
    const details = d as CasinoSessionDetails

    switch (type) {
      case 'casino_bots':
        return details.numBots >= value
      case 'casino_hands':
        return details.handsPlayed >= value
      case 'casino_grade':
        // A grade only means something over a real session, not two lucky hands.
        return details.handsPlayed >= MIN_GRADE_HANDS && details.overallScore >= value
      case 'casino_bet_accuracy':
        return details.betAccuracy >= value
      case 'casino_play_accuracy':
        return details.playAccuracy >= value
      case 'casino_count_accuracy':
        return (details.totalCountChecks ?? 0) >= MIN_COUNT_CHECKS &&
               details.countAccuracy >= value
      case 'casino_triple':
        return (details.totalCountChecks ?? 0) >= MIN_COUNT_CHECKS &&
               details.betAccuracy >= value &&
               details.playAccuracy >= value &&
               details.countAccuracy >= value
      case 'casino_profit':
        return details.netProfit >= value
      case 'casino_blackjack':
        return details.hadBlackjack
      case 'casino_streak':
        return details.longestWinStreak >= value
      case 'casino_split_aces':
        return details.splitAces
      case 'casino_max_split':
        return details.maxSplitHands >= value
      case 'casino_deviation_accuracy':
        return (details.totalDeviationSituations ?? 0) >= MIN_DEVIATION_SITUATIONS &&
               details.deviationAccuracy >= value
      default:
        return false
    }
  }

  /**
   * Check if the player has achieved A+ in N casino sessions.
   */
  private checkCasinoGradeCount(
    allSessions: TrainingSessionResult[],
    requiredCount: number,
  ): boolean {
    let count = 0
    for (const s of allSessions) {
      if (s.mode === 'casinoSession' && s.details.type === 'casinoSession') {
        const d = s.details as CasinoSessionDetails
        if (d.handsPlayed >= MIN_GRADE_HANDS && d.overallScore >= 95) count++
      }
    }
    return count >= requiredCount
  }

  /**
   * Check all meta achievements (unlock N other achievements). Runs after other
   * unlocks so a single action can cascade into a meta unlock.
   */
  private checkMetaAchievements(newlyUnlocked: Achievement[]): void {
    for (const achievement of ALL_ACHIEVEMENTS) {
      if (achievement.requirement.type !== 'meta_unlocks') continue
      if (this.isUnlocked(achievement.id)) continue
      const otherUnlocked = this.unlocked.filter(u => u.achievementId !== achievement.id).length
      if (otherUnlocked >= achievement.requirement.value) {
        this.unlock(achievement.id)
        newlyUnlocked.push(achievement)
      }
    }
  }

  /** Count how many of the five core modes hit `target`% best accuracy. */
  private coreModesAtAccuracy(stats: LifetimeStats, target: number): number {
    return CORE_MODES.filter(m => (stats.byMode[m]?.bestAccuracy ?? 0) * 100 >= target).length
  }

  /** Average accuracy (0–1) over the most recent `window` sessions of `mode`. */
  private sustainedAccuracy(allSessions: TrainingSessionResult[], mode: TrainingMode, window: number): { count: number; avg: number } {
    const modeSessions = allSessions
      .filter(s => s.mode === mode)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, window)
    if (modeSessions.length === 0) return { count: 0, avg: 0 }
    const avg = modeSessions.reduce((sum, s) => sum + s.accuracy, 0) / modeSessions.length
    return { count: modeSessions.length, avg }
  }

  /** Distinct core modes played on the same calendar day as `session`. */
  private coreModesOnDay(session: TrainingSessionResult, allSessions: TrainingSessionResult[]): number {
    const day = session.timestamp.slice(0, 10)
    const modes = new Set(
      allSessions
        .filter(s => s.timestamp.slice(0, 10) === day && CORE_MODES.includes(s.mode))
        .map(s => s.mode),
    )
    // The just-finished session may not yet be in allSessions.
    if (CORE_MODES.includes(session.mode)) modes.add(session.mode)
    return modes.size
  }

  /** Best single-session answer streak across all sessions. */
  private bestSessionStreak(allSessions: TrainingSessionResult[]): number {
    return allSessions.reduce((best, s) => Math.max(best, s.bestStreak), 0)
  }

  /** Best accuracy (0–1) in a Quick Fire Deck Estimation session. */
  private bestQuickFireAccuracy(allSessions: TrainingSessionResult[]): number {
    return allSessions.reduce((best, s) =>
      s.mode === 'deckEstimation' && s.details.type === 'deckEstimation' && s.details.quickFire
        ? Math.max(best, s.accuracy) : best, 0)
  }

  /** Best accuracy (0–1) in a Fast-speed Speed Drill session. */
  private bestFastSpeedAccuracy(allSessions: TrainingSessionResult[]): number {
    return allSessions.reduce((best, s) =>
      s.mode === 'speedDrill' && s.details.type === 'speedDrill' && s.details.speedMs <= SPEED_LEVEL_MS[2]
        ? Math.max(best, s.accuracy) : best, 0)
  }

  /** Longest single session in minutes. */
  private longestSessionMinutes(allSessions: TrainingSessionResult[]): number {
    return allSessions.reduce((best, s) => Math.max(best, s.durationSeconds / 60), 0)
  }

  /** Whether any session was completed after midnight (00:00–04:59 local). */
  private hasNightSession(allSessions: TrainingSessionResult[]): boolean {
    return allSessions.some(s => new Date(s.timestamp).getHours() < 5)
  }

  /** Aggregate per-deviation results (by name) across all flashcard sessions. */
  private aggregateDeviations(allSessions: TrainingSessionResult[]): Record<string, { correct: number; incorrect: number }> {
    const acc: Record<string, { correct: number; incorrect: number }> = {}
    for (const s of allSessions) {
      if (s.details.type !== 'deviationFlashCards' && s.details.type !== 'deviationAtTable') continue
      for (const [name, r] of Object.entries(s.details.perDeviation)) {
        if (!acc[name]) acc[name] = { correct: 0, incorrect: 0 }
        acc[name].correct += r.correct
        acc[name].incorrect += r.incorrect
      }
    }
    return acc
  }

  /**
   * How many deviations in a set are "mastered" — `minCorrect`+ correct answers
   * at `MASTERY_ACCURACY`+ accuracy — plus the set's total size.
   */
  private masteredCountForSet(allSessions: TrainingSessionResult[], set: 'i18' | 'fab4', minCorrect: number): { mastered: number; total: number } {
    const names = [...new Set((set === 'fab4' ? FAB_4 : ILLUSTRIOUS_18).map(d => d.name))]
    const agg = this.aggregateDeviations(allSessions)
    let mastered = 0
    for (const name of names) {
      const r = agg[name]
      if (!r) continue
      const total = r.correct + r.incorrect
      if (r.correct >= minCorrect && total > 0 && r.correct / total >= MASTERY_ACCURACY) mastered++
    }
    return { mastered, total: names.length }
  }

  /** Get number of daily challenges completed from localStorage. */
  getDailyCompleted(): number {
    try {
      const raw = localStorage.getItem(DAILY_CHALLENGE_KEY)
      if (!raw) return 0
      const data = JSON.parse(raw)
      return data.totalCompleted ?? 0
    } catch { return 0 }
  }

  /** Get number of weekly challenges completed from localStorage. */
  getWeeklyCompleted(): number {
    try {
      const raw = localStorage.getItem(WEEKLY_CHALLENGE_KEY)
      if (!raw) return 0
      const data = JSON.parse(raw)
      return data.totalCompleted ?? 0
    } catch { return 0 }
  }

  /** Get the current daily challenge streak from localStorage. */
  getDailyStreak(): number {
    try {
      const raw = localStorage.getItem(DAILY_CHALLENGE_KEY)
      if (!raw) return 0
      const data = JSON.parse(raw)
      const dates: string[] = data.completedDates ?? []
      if (dates.length === 0) return 0

      // completedDates are LOCAL day keys (see daily-challenge / date-utils);
      // compare them on the same local calendar, never against a UTC "today".
      const sorted = [...dates].sort((a, b) => b.localeCompare(a))
      if (sorted[0] !== todayKey() && sorted[0] !== dayKeyOffset(-1)) return 0

      let streak = 1
      for (let i = 1; i < sorted.length; i++) {
        if (daysBetweenKeys(sorted[i], sorted[i - 1]) === 1) {
          streak++
        } else {
          break
        }
      }
      return streak
    } catch { return 0 }
  }

  /** Get the current player level number from localStorage XP. */
  getCurrentLevel(): number {
    try {
      const raw = localStorage.getItem(LEVEL_XP_KEY)
      const totalXP = raw ? (parseInt(raw, 10) || 0) : 0
      for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (totalXP >= LEVELS[i].xpRequired) {
          return LEVELS[i].level
        }
      }
      return 1
    } catch { return 1 }
  }

  /** Count sessions with 100% accuracy and >= 10 questions. */
  private countPerfectSessions(allSessions: TrainingSessionResult[]): number {
    return allSessions.filter(s => s.accuracy === 1 && s.totalQuestions >= 10).length
  }

  /** Check if current session is a perfect speed drill at the given speed level. */
  private checkSpeedDrillPerfect(session: TrainingSessionResult, speedLevel: number): boolean {
    if (session.mode !== 'speedDrill') return false
    if (session.accuracy < 1) return false
    if (session.details.type !== 'speedDrill') return false

    const maxMs = SPEED_LEVEL_MS[speedLevel]
    if (!maxMs) return false

    return session.details.speedMs <= maxMs
  }

  /** Check if a bankroll tracker achievement is met. */
  private meetsBankrollRequirement(achievement: Achievement): boolean {
    const req = achievement.requirement

    switch (req.type) {
      case 'tracker_sessions':
        return this.getTrackerSessions().length >= req.value
      case 'tracker_first_win':
        return this.getTrackerSessions().some(s => s.result > 0)
      case 'tracker_win_streak':
        return this.getTrackerWinStreak() >= req.value
      case 'tracker_total_profit':
        return this.getTrackerProfit() >= req.value
      case 'tracker_total_hours':
        return this.getTrackerHours() >= req.value
      case 'tracker_session_hours':
        return this.getTrackerLongestSession() >= req.value
      case 'tracker_single_session_profit':
        return this.getTrackerBestSession() >= req.value
      case 'tracker_comeback':
        return this.getTrackerHasComeback(req.value)
      default:
        return false
    }
  }

  /** Read tracked sessions from localStorage (Zustand persist format). */
  getTrackerSessions(): TrackerSession[] {
    try {
      const raw = localStorage.getItem(BANKROLL_TRACKER_KEY)
      if (!raw) return []
      const data = JSON.parse(raw)
      return data.state?.sessions ?? []
    } catch { return [] }
  }

  /** Get the longest win streak across tracked sessions. */
  private getTrackerWinStreak(): number {
    const sessions = this.getTrackerSessions()
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
    let maxStreak = 0
    let current = 0
    for (const s of sorted) {
      if (s.result > 0) {
        current++
        if (current > maxStreak) maxStreak = current
      } else {
        current = 0
      }
    }
    return maxStreak
  }

  /** Get total profit across tracked sessions. */
  private getTrackerProfit(): number {
    return this.getTrackerSessions().reduce((sum, s) => sum + s.result, 0)
  }

  /** Get total hours across tracked sessions. */
  private getTrackerHours(): number {
    return this.getTrackerSessions().reduce((sum, s) => sum + s.hoursPlayed, 0)
  }

  /** Get the longest single session in hours. */
  private getTrackerLongestSession(): number {
    const sessions = this.getTrackerSessions()
    if (sessions.length === 0) return 0
    return Math.max(...sessions.map(s => s.hoursPlayed))
  }

  /** Get the best single session profit. */
  private getTrackerBestSession(): number {
    const sessions = this.getTrackerSessions()
    if (sessions.length === 0) return 0
    return Math.max(...sessions.map(s => s.result))
  }

  /** Check if there was a win after N consecutive losses. */
  private getTrackerHasComeback(lossStreak: number): boolean {
    const sessions = [...this.getTrackerSessions()].sort((a, b) => a.date.localeCompare(b.date))
    let losses = 0
    for (const s of sessions) {
      if (s.result < 0) {
        losses++
      } else if (s.result > 0) {
        if (losses >= lossStreak) return true
        losses = 0
      } else {
        losses = 0
      }
    }
    return false
  }

  private unlock(id: string): void {
    if (this.isUnlocked(id)) return
    this.unlocked.push({
      achievementId: id,
      unlockedAt: Date.now(),
    })
    this.saveToStorage()
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        this.unlocked = JSON.parse(raw) as UnlockedAchievement[]
      }
    } catch {
      this.unlocked = []
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.unlocked))
    } catch { /* ignore */ }
  }

  /** Get the number of simulations run. */
  getSimCount(): number {
    try {
      const raw = localStorage.getItem(SIM_COUNT_KEY)
      return raw ? parseInt(raw, 10) || 0 : 0
    } catch {
      return 0
    }
  }

  private setSimCount(count: number): void {
    try {
      localStorage.setItem(SIM_COUNT_KEY, String(count))
    } catch { /* ignore */ }
  }

  /** Overwrite the simulation counters (used when hydrating from the cloud). */
  setSimCounters(count: number, bestEdgeBps: number): void {
    this.setSimCount(Math.max(0, Math.floor(count)))
    this.setBestSimEdge(Math.max(0, Math.floor(bestEdgeBps)))
  }

  /** Get the best simulation edge in basis points. */
  getBestSimEdge(): number {
    try {
      const raw = localStorage.getItem(SIM_BEST_EDGE_KEY)
      return raw ? parseInt(raw, 10) || 0 : 0
    } catch {
      return 0
    }
  }

  private setBestSimEdge(bps: number): void {
    try {
      localStorage.setItem(SIM_BEST_EDGE_KEY, String(bps))
    } catch { /* ignore */ }
  }
}

/** Singleton achievement engine instance. */
export const achievementEngine = new AchievementEngine()
