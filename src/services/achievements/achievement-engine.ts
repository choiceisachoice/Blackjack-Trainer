import type { Achievement, UnlockedAchievement } from './achievement-types'
import type { TrainingSessionResult, LifetimeStats, TrainingMode, CasinoSessionDetails } from '../stats-types'
import type { SimulationResult } from '../../engine/simulation/types'
import { ALL_ACHIEVEMENTS } from './achievement-list'
import { LEVELS } from '../level-system'

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
  3: 250,   // Blitz
}

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
    this.checkMetaAchievement('card_counter', 20, newlyUnlocked)
    this.checkMetaAchievement('master_collector', 50, newlyUnlocked)

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
    this.checkMetaAchievement('card_counter', 20, newlyUnlocked)
    this.checkMetaAchievement('master_collector', 50, newlyUnlocked)

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
    this.checkMetaAchievement('card_counter', 20, newlyUnlocked)
    this.checkMetaAchievement('master_collector', 50, newlyUnlocked)

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

  /** Get number of unlocked achievements. */
  getUnlockedCount(): number {
    return this.unlocked.length
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
        if (achievement.id === 'card_counter') {
          const otherUnlocked = this.unlocked.filter(u => u.achievementId !== 'card_counter').length
          return Math.min(100, (otherUnlocked / 20) * 100)
        }
        if (achievement.id === 'master_collector') {
          const otherUnlocked = this.unlocked.filter(u => u.achievementId !== 'master_collector').length
          return Math.min(100, (otherUnlocked / 50) * 100)
        }
        const count = req.mode
          ? (stats.byMode[req.mode]?.totalSessions ?? 0)
          : stats.totalSessions
        return Math.min(100, (count / req.value) * 100)
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
        if (achievement.id === 'six_systems') {
          const uniqueSystems = new Set(allSessions.map(s => s.countingSystem))
          return Math.min(100, (uniqueSystems.size / 6) * 100)
        }
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

      case 'unique_systems':
        return Math.min(100, (this.countUniqueSystemsWith80(allSessions) / req.value) * 100)

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
        if (achievement.id === 'six_systems') {
          const uniqueSystems = new Set(allSessions.map(s => s.countingSystem))
          return uniqueSystems.size >= 6
        }
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
        return this.checkCasinoAchievement(session, req.type, req.value)

      case 'casino_grade_count':
        return this.checkCasinoGradeCount(allSessions, req.value)

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

      case 'unique_systems':
        return this.countUniqueSystemsWith80(allSessions) >= req.value

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
        return details.overallScore >= value
      case 'casino_bet_accuracy':
        return details.betAccuracy >= value
      case 'casino_play_accuracy':
        return details.playAccuracy >= value
      case 'casino_count_accuracy':
        return details.countAccuracy >= value
      case 'casino_triple':
        return details.betAccuracy >= value &&
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
        if (d.overallScore >= 95) count++
      }
    }
    return count >= requiredCount
  }

  /**
   * Check a meta achievement that requires N other achievements unlocked.
   */
  private checkMetaAchievement(id: string, required: number, newlyUnlocked: Achievement[]): void {
    const achievement = ALL_ACHIEVEMENTS.find(a => a.id === id)
    if (achievement && !this.isUnlocked(id)) {
      const otherUnlocked = this.unlocked.filter(u => u.achievementId !== id).length
      if (otherUnlocked >= required) {
        this.unlock(id)
        newlyUnlocked.push(achievement)
      }
    }
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

      const sorted = [...dates].sort((a, b) => b.localeCompare(a))
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

      if (sorted[0] !== today && sorted[0] !== yesterday) return 0

      let streak = 1
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1])
        const curr = new Date(sorted[i])
        const diffDays = (prev.getTime() - curr.getTime()) / 86400000
        if (Math.abs(diffDays - 1) < 0.01) {
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

  /** Check if current session is a perfect Blitz speed drill. */
  private checkSpeedDrillPerfect(session: TrainingSessionResult, speedLevel: number): boolean {
    if (session.mode !== 'speedDrill') return false
    if (session.accuracy < 1) return false
    if (session.details.type !== 'speedDrill') return false

    const maxMs = SPEED_LEVEL_MS[speedLevel]
    if (!maxMs) return false

    return session.details.speedMs <= maxMs
  }

  /** Count unique counting systems used with 80%+ accuracy. */
  private countUniqueSystemsWith80(allSessions: TrainingSessionResult[]): number {
    const systemBest = new Map<string, number>()
    for (const s of allSessions) {
      const current = systemBest.get(s.countingSystem) ?? 0
      if (s.accuracy > current) {
        systemBest.set(s.countingSystem, s.accuracy)
      }
    }
    let count = 0
    for (const acc of systemBest.values()) {
      if (acc >= 0.8) count++
    }
    return count
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
