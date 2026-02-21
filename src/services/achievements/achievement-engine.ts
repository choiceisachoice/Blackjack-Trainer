import type { Achievement, UnlockedAchievement } from './achievement-types'
import type { TrainingSessionResult, LifetimeStats, TrainingMode } from '../stats-types'
import type { SimulationResult } from '../../engine/simulation/types'
import { ALL_ACHIEVEMENTS } from './achievement-list'

const STORAGE_KEY = 'bjt_achievements'
const SIM_COUNT_KEY = 'bjt_sim_count'
const SIM_BEST_EDGE_KEY = 'bjt_sim_best_edge'

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

    // Check "Card Counter" meta achievement after potentially unlocking others
    const cardCounter = ALL_ACHIEVEMENTS.find(a => a.id === 'card_counter')
    if (cardCounter && !this.isUnlocked('card_counter')) {
      // Count unlocked excluding card_counter itself
      const otherUnlocked = this.unlocked.filter(u => u.achievementId !== 'card_counter').length
      if (otherUnlocked >= 20) {
        this.unlock('card_counter')
        newlyUnlocked.push(cardCounter)
      }
    }

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

    // Check "Card Counter" meta achievement
    const cardCounter = ALL_ACHIEVEMENTS.find(a => a.id === 'card_counter')
    if (cardCounter && !this.isUnlocked('card_counter')) {
      const otherUnlocked = this.unlocked.filter(u => u.achievementId !== 'card_counter').length
      if (otherUnlocked >= 20) {
        this.unlock('card_counter')
        newlyUnlocked.push(cardCounter)
      }
    }

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
