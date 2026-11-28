import { provesAccuracy } from '../accuracy-sample'
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
import {
  confirmSessionsUploaded,
  getPendingSessionIds,
  markSessionPending,
  markUploadFailed,
} from './pending-sessions'
import { withTimeout } from './with-timeout'
import { getLocalOwner } from './local-owner'

/**
 * How long a cloud write may take before it counts as failed. The session is
 * on the device either way; this only decides when the learner is told that
 * it is waiting to be uploaded.
 */
export const CLOUD_SAVE_TIMEOUT_MS = 12_000

/**
 * How long a cloud read may take. Without a limit a request that never
 * answers left `loadStats` — and every screen waiting on it — loading forever.
 */
export const CLOUD_READ_TIMEOUT_MS = 12_000

/** Keys used in localStorage. */
const SESSIONS_KEY = 'bjt_sessions'

/**
 * Ids of the sessions on this device the cloud has confirmed holding.
 *
 * Two jobs. The push sends only what is not in here (plus what is waiting),
 * instead of the whole of `bjt_sessions` on every page load — a payload that
 * grew with every session against a fixed time limit. And a session in here
 * that the cloud's full history no longer lists was deleted there (a reset on
 * another device), so this device drops its copy instead of uploading it
 * again.
 *
 * Ids are only ever added on a confirmed write or when the cloud's answer
 * lists them, and they stay after their session is dropped: a copy written
 * back by a stale snapshot is then recognised as deleted again rather than
 * mistaken for new. The `bjt_` prefix puts it under the sign-out wipe, with
 * the sessions it describes.
 */
export const SYNCED_SESSIONS_KEY = 'bjt_synced_sessions'

/** Ids of the sessions the cloud has confirmed holding (see `SYNCED_SESSIONS_KEY`). */
export function getSyncedSessionIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SYNCED_SESSIONS_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Record that the cloud holds these sessions. */
export function markSessionsSynced(ids: readonly string[]): void {
  if (ids.length === 0) return
  const known = getSyncedSessionIds()
  const before = known.size
  ids.forEach(id => known.add(id))
  if (known.size === before) return
  try {
    localStorage.setItem(SYNCED_SESSIONS_KEY, JSON.stringify([...known]))
  } catch { /* storage full: the next push sends these again, which is harmless */ }
}

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

  /**
   * Remove these sessions from the device. Read and written in one
   * synchronous step, so a session saved meanwhile is not overwritten.
   */
  async dropSessionResults(ids: ReadonlySet<string>): Promise<void> {
    const sessions = this.readSessions()
    const kept = sessions.filter(s => !ids.has(s.id))
    if (kept.length !== sessions.length) this.writeSessions(kept)
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
    localStorage.removeItem(SYNCED_SESSIONS_KEY)
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
    // A best needs a sample: three right answers are not "100%".
    if (provesAccuracy(session)) mode.bestAccuracy = Math.max(mode.bestAccuracy, session.accuracy)
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
      // Marked as waiting *before* the request leaves, and written to storage:
      // if the tab is closed with the request in flight, or the request never
      // answers, the next page load still knows this session has to go up.
      markSessionPending(result.id)
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const push = offline
        // No request when the browser itself says there is no network: it
        // could only fail, after making supabase-js retry a token refresh.
        ? Promise.reject(new Error('offline'))
        : withTimeout(this.cloud.saveSessionResult(result), CLOUD_SAVE_TIMEOUT_MS, 'cloud session save')
      push.then(
        () => {
          confirmSessionsUploaded([result.id])
          markSessionsSynced([result.id])
        },
        e => {
          markUploadFailed()
          console.error('cloud session save failed; the local copy stands and will be uploaded later', e)
        },
      )
    }

    // Still surfaced to the caller: `recordSession` logs it and carries on, and
    // a silent local failure would otherwise be indistinguishable from success.
    await localWrite
  }
  getSessionResults(mode: TrainingMode): Promise<TrainingSessionResult[]> {
    return this.impl().getSessionResults(mode)
  }
  /**
   * All sessions. From the cloud when signed in — plus any session that is on
   * this device and not confirmed in the cloud yet.
   *
   * Without that second half, a session saved while offline disappeared from
   * the history the moment any screen reloaded the stats: the cloud's list is
   * the source of truth, and the cloud had not heard of it.
   *
   * "Not confirmed yet" is not the whole of it, though. A read that left
   * before a session's upload and came back after it found the session
   * neither in its answer nor on the waiting list — the upload had been
   * confirmed in between — and the session just finished dropped out of the
   * history until the next reload. So everything this device holds for the
   * signed-in account and the answer lacks is kept, waiting or not — unless
   * the cloud had confirmed it before this read left (`SYNCED_SESSIONS_KEY`):
   * a confirmed session the cloud's whole history no longer lists was deleted
   * there, by a reset on another device, and this device's copy goes too.
   * Otherwise the next push would upload it again and the reset would not
   * stick. A session still waiting is never dropped; nor is one confirmed
   * while the read was out, which the read could not have seen.
   */
  async getAllSessionResults(): Promise<TrainingSessionResult[]> {
    if (this.impl() === this.local) return this.local.getAllSessionResults()
    // Before the request: only what was confirmed before it left can be
    // judged missing from its answer.
    const syncedBefore = getSyncedSessionIds()
    const { userId: readFor, sessions: fromCloud } = await withTimeout(
      this.cloud.readHistory(), CLOUD_READ_TIMEOUT_MS, 'cloud session read',
    )
    // Both read after the answer, so they describe the device as it is now.
    const pending = getPendingSessionIds()
    const userId = useAuthStore.getState().user?.id
    const ownDevice = !!userId && getLocalOwner() === userId
    if (pending.length === 0 && !ownDevice) return fromCloud
    const known = new Set(fromCloud.map(s => s.id))
    const local = await this.local.getAllSessionResults()
    let gone = new Set<string>()
    if (ownDevice) {
      markSessionsSynced(local.filter(s => known.has(s.id)).map(s => s.id))
      // Only an answer for this very account is a full account of its history.
      if (readFor === userId) {
        gone = new Set(local
          .filter(s => !known.has(s.id) && syncedBefore.has(s.id) && !pending.includes(s.id))
          .map(s => s.id))
        if (gone.size > 0) await this.local.dropSessionResults(gone)
      }
    }
    const onDevice = local
      .filter(s => !known.has(s.id) && !gone.has(s.id) && (ownDevice || pending.includes(s.id)))
    return onDevice.length > 0 ? [...onDevice, ...fromCloud] : fromCloud
  }
  getSessionResultsByDateRange(start: Date, end: Date): Promise<TrainingSessionResult[]> {
    return this.impl().getSessionResultsByDateRange(start, end)
  }
  async getLifetimeStats(): Promise<LifetimeStats> {
    // Derived from the same list as above, so the figures include a session
    // that is still waiting for the cloud.
    return computeLifetimeStats(await this.getAllSessionResults())
  }
  /**
   * Delete the whole history — the cloud's and this device's.
   *
   * Signed in, only the cloud's used to go. The device's copy stayed in
   * `bjt_sessions`, and since the sign-in merge uploads whatever is in there,
   * the sessions recorded on this device were back in the account on the next
   * page load. The cloud goes first: if that fails, nothing has been deleted,
   * which is what the reset screens tell the reader.
   */
  async clearAll(): Promise<void> {
    if (this.impl() !== this.local) {
      await this.cloud.clearAll()
      confirmSessionsUploaded(getPendingSessionIds())
    }
    await this.local.clearAll()
  }
}

/** Singleton storage service instance (local when logged out, cloud when signed in). */
export const storage: StorageService = new SyncedStorageService()

/** Direct access to the localStorage backend (used by the one-time cloud migration). */
export const localStorageService = new LocalStorageService()

/**
 * The sessions held on this device, for when the cloud cannot be read.
 *
 * Not the whole history — only what was recorded here since the last sign-in —
 * so it is a stand-in for an empty screen, never a replacement for a list
 * that is already loaded. Empty unless the local caches belong to the account
 * that is signed in: on a shared device the wipe that enforces that runs a
 * moment after sign-in, and nobody is shown the previous person's history in
 * the gap.
 */
export async function getDeviceSessionResults(): Promise<TrainingSessionResult[]> {
  if (isSupabaseConfigured) {
    const userId = useAuthStore.getState().user?.id
    if (!userId || getLocalOwner() !== userId) return []
  }
  return localStorageService.getAllSessionResults()
}
