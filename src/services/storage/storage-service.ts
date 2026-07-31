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

  /**
   * Replace the whole local session array.
   *
   * Needed by the sign-in migration: when a legacy session gets a fresh uuid,
   * the new id has to be written back locally too. Going through
   * `saveSessionResult` would append instead of replace and duplicate the
   * entire history on every sync.
   */
  async replaceAllSessionResults(results: TrainingSessionResult[]): Promise<void> {
    this.writeSessions(results)
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

  /**
   * Save a finished session — locally first, and to the cloud in the background.
   *
   * This is the one write in the app that sits directly between a person and
   * their reward. It used to `await` the cloud before the store was updated, so
   * on a slow connection the XP, the achievements and the level-up all waited on
   * a network round trip: the drill ended and then nothing happened for a
   * second, at exactly the moment that should feel immediate.
   *
   * Now the local write is the one that gates the UI — it is synchronous in
   * practice — and the cloud push is fire-and-forget. That is not a shortcut: a
   * push that fails leaves a local copy behind, and local sessions are re-pushed
   * on the next sign-in (upsert on id, so no duplicates). The old code already
   * relied on exactly that fallback; the only change is that it no longer waits
   * to find out whether it is needed.
   *
   * Deliberately *not* applied to anything touching identity, entitlement or
   * money. Showing "you are Pro" before the signed webhook has confirmed it is
   * not a faster interface, it is a wrong one.
   */
  async saveSessionResult(result: TrainingSessionResult): Promise<void> {
    // The two writes are started independently, and that ordering is load-bearing.
    // Awaiting the local one first meant a *local* failure — a full quota, private
    // browsing — also skipped the cloud push, cancelling the more durable of the
    // two copies because the fragile one had failed. They fail separately now.
    const localWrite = this.local.saveSessionResult(result)

    if (this.impl() !== this.local) {
      this.cloud.saveSessionResult(result).catch(e => {
        console.error('cloud session save failed; the local copy stands', e)
      })
    }

    // Still surfaced to the caller: `recordSession` logs it and carries on, and
    // a silent local failure would otherwise be indistinguishable from success.
    await localWrite
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
