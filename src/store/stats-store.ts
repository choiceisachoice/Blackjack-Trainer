import { create } from 'zustand'
import { storage } from '../services/storage/storage-service'
import type {
  TrainingSessionResult,
  TrainingMode,
  LifetimeStats,
  SessionDetails,
} from '../services/stats-types'
import { useAppStore } from './app-store'
import type { CountingSystemId } from '../engine/counting/types'

/** Accuracy trend direction. */
export type TrendDirection = 'improving' | 'stable' | 'declining'

/** State shape for the stats store. */
export interface StatsStoreState {
  /** All loaded sessions (most recent first). */
  sessions: TrainingSessionResult[]
  /** Cached lifetime stats. */
  lifetimeStats: LifetimeStats | null
  /** Whether initial load is in progress. */
  isLoading: boolean
}

/** Actions for the stats store. */
export interface StatsStoreActions {
  /** Load all sessions and lifetime stats from storage. */
  loadStats(): Promise<void>

  /**
   * Record a completed training session.
   *
   * Builds a TrainingSessionResult from the provided data,
   * saves to storage, and updates the cached stats.
   */
  recordSession(params: {
    mode: TrainingMode
    startTime: number
    totalQuestions: number
    correctAnswers: number
    bestStreak: number
    details: SessionDetails
    countingSystem?: CountingSystemId
  }): Promise<void>

  /**
   * Get accuracy trend for a mode (or all modes).
   *
   * Compares avg accuracy of last 5 sessions vs previous 5.
   */
  getAccuracyTrend(mode?: TrainingMode): TrendDirection

  /**
   * Get weakest deviations based on deviation training sessions.
   *
   * Returns deviation names sorted by lowest accuracy.
   */
  getWeakestDeviations(limit?: number): { name: string; accuracy: number }[]

  /**
   * Get the current training streak in consecutive days.
   */
  getTrainingStreak(): number

  /** Delete all stats and clear storage. */
  resetAllStats(): Promise<void>
}

export type StatsStore = StatsStoreState & StatsStoreActions

/**
 * Zustand store for training statistics and session history.
 *
 * Persists through the storage service (localStorage by default).
 */
export const useStatsStore = create<StatsStore>((set, get) => ({
  sessions: [],
  lifetimeStats: null,
  isLoading: false,

  async loadStats() {
    set({ isLoading: true })
    try {
      const [sessions, lifetimeStats] = await Promise.all([
        storage.getAllSessionResults(),
        storage.getLifetimeStats(),
      ])
      // Sort newest first
      sessions.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      set({ sessions, lifetimeStats, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  async recordSession({
    mode,
    startTime,
    totalQuestions,
    correctAnswers,
    bestStreak,
    details,
    countingSystem,
  }) {
    const now = Date.now()
    const durationSeconds = Math.round((now - startTime) / 1000)

    const result: TrainingSessionResult = {
      id: crypto.randomUUID(),
      mode,
      timestamp: new Date(startTime).toISOString(),
      countingSystem: countingSystem ?? useAppStore.getState().selectedSystem,
      durationSeconds,
      totalQuestions,
      correctAnswers,
      accuracy: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
      bestStreak,
      details,
    }

    await storage.saveSessionResult(result)

    // Update cached state
    const lifetimeStats = await storage.getLifetimeStats()
    set(state => ({
      sessions: [result, ...state.sessions],
      lifetimeStats,
    }))
  },

  getAccuracyTrend(mode?: TrainingMode): TrendDirection {
    let sessions = get().sessions
    if (mode) {
      sessions = sessions.filter(s => s.mode === mode)
    }
    if (sessions.length < 5) return 'stable'

    const recent5 = sessions.slice(0, 5)
    const prev5 = sessions.slice(5, 10)

    if (prev5.length === 0) return 'stable'

    const recentAvg =
      recent5.reduce((sum, s) => sum + s.accuracy, 0) / recent5.length
    const prevAvg =
      prev5.reduce((sum, s) => sum + s.accuracy, 0) / prev5.length

    const diff = recentAvg - prevAvg
    if (diff > 0.05) return 'improving'
    if (diff < -0.05) return 'declining'
    return 'stable'
  },

  getWeakestDeviations(limit = 5) {
    const sessions = get().sessions.filter(
      s =>
        s.mode === 'deviationFlashCards' || s.mode === 'deviationAtTable'
    )

    // Aggregate per-deviation results across all sessions
    const accum: Record<string, { correct: number; total: number }> = {}

    for (const session of sessions) {
      const details = session.details
      if (details.type !== 'deviationFlashCards' && details.type !== 'deviationAtTable') continue

      for (const [name, result] of Object.entries(details.perDeviation)) {
        if (!accum[name]) {
          accum[name] = { correct: 0, total: 0 }
        }
        accum[name].correct += result.correct
        accum[name].total += result.correct + result.incorrect
      }
    }

    return Object.entries(accum)
      .filter(([, v]) => v.total > 0)
      .map(([name, v]) => ({
        name,
        accuracy: v.correct / v.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit)
  },

  getTrainingStreak(): number {
    const sessions = get().sessions
    if (sessions.length === 0) return 0

    // Get unique dates (YYYY-MM-DD), sorted descending
    const dates = [...new Set(sessions.map(s => s.timestamp.slice(0, 10)))]
      .sort((a, b) => b.localeCompare(a))

    // Check if today or yesterday is in the list
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

    if (dates[0] !== today && dates[0] !== yesterday) return 0

    let streak = 1
    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1])
      const currDate = new Date(dates[i])
      const diffDays = (prevDate.getTime() - currDate.getTime()) / 86400000

      if (Math.abs(diffDays - 1) < 0.01) {
        streak++
      } else {
        break
      }
    }

    return streak
  },

  async resetAllStats() {
    await storage.clearAll()
    set({ sessions: [], lifetimeStats: null })
  },
}))
