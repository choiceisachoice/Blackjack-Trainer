import type {
  TrainingSessionResult,
  TrainingMode,
  LifetimeStats,
  ModeStats,
  DailyStats,
} from '../stats-types'
import { useAuthStore } from '../../store/auth-store'
import { isSupabaseConfigured } from '../supabase/client'
import { SupabaseStorageService } from '../supabase/supabase-storage'
import { dayKey, dayKeyOffset } from '../date-utils'

/** Keys used in localStorage. */
const SESSIONS_KEY = 'bjt_sessions'

/**
 * Async storage abstraction for training session persistence.
 *
 * Implementations: LocalStorageService (MVP), SupabaseStorageService (F-008).
 */
export interface StorageService {
  /** Save a completed session result. */
  saveSessionResult(result: TrainingSessionResult): Promise<void>

  /** Get sessions filtered by mode. */
  getSessionResults(mode: TrainingMode): Promise<TrainingSessionResult[]>

  /** Get all sessions across all modes. */
  getAllSessionResults(): Promise<TrainingSessionResult[]>

  /** Get sessions within a date range (inclusive). */
  getSessionResultsByDateRange(
    start: Date,
    end: Date
  ): Promise<TrainingSessionResult[]>

  /** Compute lifetime stats from all sessions. */
  getLifetimeStats(): Promise<LifetimeStats>

  /** Delete all stored data. */
  clearAll(): Promise<void>
}

/**
 * localStorage-backed implementation of StorageService.
 *
 * All sessions are stored as a JSON array under `bjt_sessions`.
 * LifetimeStats are computed on-the-fly from the session array.
 */
export class LocalStorageService implements StorageService {
  private readSessions(): TrainingSessionResult[] {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY)
      if (!raw) return []
      return JSON.parse(raw) as TrainingSessionResult[]
    } catch {
      return []
    }
  }

  private writeSessions(sessions: TrainingSessionResult[]): void {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
  }

  async saveSessionResult(result: TrainingSessionResult): Promise<void> {
    const sessions = this.readSessions()
    sessions.push(result)
    this.writeSessions(sessions)
  }

  async getSessionResults(mode: TrainingMode): Promise<TrainingSessionResult[]> {
    return this.readSessions().filter(s => s.mode === mode)
  }

  async getAllSessionResults(): Promise<TrainingSessionResult[]> {
    return this.readSessions()
  }

  async getSessionResultsByDateRange(
    start: Date,
    end: Date
  ): Promise<TrainingSessionResult[]> {
    const startMs = start.getTime()
    const endMs = end.getTime()
    return this.readSessions().filter(s => {
      const ts = new Date(s.timestamp).getTime()
      return ts >= startMs && ts <= endMs
    })
  }

  async getLifetimeStats(): Promise<LifetimeStats> {
    return computeLifetimeStats(this.readSessions())
  }

  async clearAll(): Promise<void> {
    localStorage.removeItem(SESSIONS_KEY)
  }
}

/**
 * Computes lifetime stats from a list of sessions.
 *
 * Pure function, usable for both local and remote implementations.
 */
export function computeLifetimeStats(
  sessions: TrainingSessionResult[]
): LifetimeStats {
  const stats: LifetimeStats = {
    totalSessions: sessions.length,
    totalQuestions: 0,
    totalCorrect: 0,
    totalPracticeSeconds: 0,
    overallAccuracy: 0,
    bestStreak: 0,
    byMode: {},
    dailyStats: [],
  }

  if (sessions.length === 0) return stats

  // Per-mode accumulators
  const modeAccum: Record<
    string,
    {
      totalSessions: number
      totalQuestions: number
      totalCorrect: number
      totalPracticeSeconds: number
      bestAccuracy: number
      bestStreak: number
    }
  > = {}

  // Daily accumulators
  const dailyAccum: Record<
    string,
    { sessions: number; totalQuestions: number; totalCorrect: number; practiceSeconds: number }
  > = {}

  for (const session of sessions) {
    stats.totalQuestions += session.totalQuestions
    stats.totalCorrect += session.correctAnswers
    stats.totalPracticeSeconds += session.durationSeconds
    stats.bestStreak = Math.max(stats.bestStreak, session.bestStreak)

    // Mode accumulation
    if (!modeAccum[session.mode]) {
      modeAccum[session.mode] = {
        totalSessions: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        totalPracticeSeconds: 0,
        bestAccuracy: 0,
        bestStreak: 0,
      }
    }
    const mode = modeAccum[session.mode]
    mode.totalSessions++
    mode.totalQuestions += session.totalQuestions
    mode.totalCorrect += session.correctAnswers
    mode.totalPracticeSeconds += session.durationSeconds
    mode.bestAccuracy = Math.max(mode.bestAccuracy, session.accuracy)
    mode.bestStreak = Math.max(mode.bestStreak, session.bestStreak)

    // Daily accumulation
    const dateStr = dayKey(session.timestamp) // local YYYY-MM-DD
    if (!dailyAccum[dateStr]) {
      dailyAccum[dateStr] = { sessions: 0, totalQuestions: 0, totalCorrect: 0, practiceSeconds: 0 }
    }
    const day = dailyAccum[dateStr]
    day.sessions++
    day.totalQuestions += session.totalQuestions
    day.totalCorrect += session.correctAnswers
    day.practiceSeconds += session.durationSeconds
  }

  stats.overallAccuracy =
    stats.totalQuestions > 0 ? stats.totalCorrect / stats.totalQuestions : 0

  // Build byMode
  for (const [mode, accum] of Object.entries(modeAccum)) {
    const modeStats: ModeStats = {
      totalSessions: accum.totalSessions,
      totalQuestions: accum.totalQuestions,
      totalCorrect: accum.totalCorrect,
      accuracy:
        accum.totalQuestions > 0
          ? accum.totalCorrect / accum.totalQuestions
          : 0,
      bestAccuracy: accum.bestAccuracy,
      totalPracticeSeconds: accum.totalPracticeSeconds,
      bestStreak: accum.bestStreak,
    }
    stats.byMode[mode as TrainingSessionResult['mode']] = modeStats
  }

  // Build dailyStats — last 90 local days, sorted ascending
  const cutoffStr = dayKeyOffset(-90)

  const dailyEntries: DailyStats[] = Object.entries(dailyAccum)
    .filter(([date]) => date >= cutoffStr)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      sessions: d.sessions,
      totalQuestions: d.totalQuestions,
      totalCorrect: d.totalCorrect,
      practiceSeconds: d.practiceSeconds,
    }))

  stats.dailyStats = dailyEntries

  return stats
}

/**
 * Storage facade: delegates to Supabase when a user is signed in (and Supabase
 * is configured), otherwise to localStorage. This keeps the app fully offline
 * when logged out and syncs sessions to the cloud when logged in — without any
 * caller needing to know which backend is active.
 */
class SyncedStorageService implements StorageService {
  private readonly local = new LocalStorageService()
  private readonly cloud = new SupabaseStorageService()

  /** Pick the active backend for this call. */
  private impl(): StorageService {
    return isSupabaseConfigured && useAuthStore.getState().status === 'signedIn'
      ? this.cloud
      : this.local
  }

  async saveSessionResult(result: TrainingSessionResult): Promise<void> {
    if (this.impl() === this.local) {
      return this.local.saveSessionResult(result)
    }
    try {
      await this.cloud.saveSessionResult(result)
    } catch (e) {
      // Don't lose a finished session (and its XP/achievements) on a flaky
      // connection — keep a local copy. Local sessions are re-pushed to the
      // cloud on the next sign-in (upsert on id, so no duplicates).
      console.error('cloud session save failed; falling back to local', e)
      await this.local.saveSessionResult(result)
    }
  }
  getSessionResults(mode: TrainingMode): Promise<TrainingSessionResult[]> {
    return this.impl().getSessionResults(mode)
  }
  getAllSessionResults(): Promise<TrainingSessionResult[]> {
    return this.impl().getAllSessionResults()
  }
  getSessionResultsByDateRange(start: Date, end: Date): Promise<TrainingSessionResult[]> {
    return this.impl().getSessionResultsByDateRange(start, end)
  }
  getLifetimeStats(): Promise<LifetimeStats> {
    return this.impl().getLifetimeStats()
  }
  clearAll(): Promise<void> {
    return this.impl().clearAll()
  }
}

/** Singleton storage service instance (local when logged out, cloud when signed in). */
export const storage: StorageService = new SyncedStorageService()

/** Direct access to the localStorage backend (used by the one-time cloud migration). */
export const localStorageService = new LocalStorageService()
