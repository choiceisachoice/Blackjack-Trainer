import { create } from 'zustand'
import { computeLifetimeStats, getDeviceSessionResults, storage } from '../services/storage/storage-service'
import type {
  TrainingSessionResult,
  TrainingMode,
  LifetimeStats,
  SessionDetails,
} from '../services/stats-types'
import { useAppStore } from './app-store'
import { useAchievementStore } from './achievement-store'
import { useChallengeStore } from './challenge-store'
import { useWeeklyChallengeStore } from './weekly-challenge-store'
import { useLevelStore } from './level-store'
import type { CountingSystemId } from '../engine/counting/types'
import { dayKey, todayKey, dayKeyOffset, weekStartKey, daysBetweenKeys } from '../services/date-utils'

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
    /**
     * The id the record is stored under; a random one when omitted.
     *
     * Passing one makes the call idempotent: a session with this id that is
     * already in the list is not recorded again — no second row, no second XP.
     * The Casino Session passes the id it gave the table when it started, so a
     * table cashed out from two tabs, or by hand and by the automatic cash-out
     * at once, is one session.
     */
    id?: string
    /**
     * When the session ended (ms since epoch); now when omitted. For a session
     * that is recorded after the fact — a table left open and cashed out a day
     * later ended when its last hand was played, not when it was found.
     */
    endTime?: number
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
    } catch (e) {
      /*
       * The cloud could not be read: no network, or a request that never
       * answered (the storage facade turns that into a failure after a few
       * seconds, which is what keeps `isLoading` from staying true forever).
       *
       * What is already on screen stays. Only an empty store is filled from
       * the device's own copy — after a reload on a bad connection that copy
       * is all there is, and judging the day from nothing would hand out the
       * daily XP limit a second time.
       */
      console.warn('stats could not be loaded from the cloud; keeping what this device has', e)
      let fallback: TrainingSessionResult[] = []
      if (get().sessions.length === 0) {
        try {
          fallback = await getDeviceSessionResults()
        } catch { /* storage unavailable: nothing to fall back to */ }
      }
      // Checked again after the await: a session finished meanwhile wins.
      if (fallback.length > 0 && get().sessions.length === 0) {
        fallback.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        set({ sessions: fallback, lifetimeStats: computeLifetimeStats(fallback), isLoading: false })
      } else {
        set({ isLoading: false })
      }
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
    id,
    endTime,
  }) {
    // Recorded already: nothing below may run a second time (see `id`).
    if (id !== undefined && get().sessions.some(s => s.id === id)) return

    const now = endTime ?? Date.now()
    const durationSeconds = Math.round((now - startTime) / 1000)

    const result: TrainingSessionResult = {
      id: id ?? crypto.randomUUID(),
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

    // Lifetime stats are derived from the list already in hand, not re-read from
    // storage. Re-reading meant a second network round trip on the finish path,
    // and — now that the cloud write no longer blocks — it would have returned
    // figures that did not yet include the session the player just finished.
    // Computing from `allSessions` is both instant and consistent with what is
    // on screen.
    //
    // The list is newest first, and stays so: a session recorded after the
    // fact (a casino table cashed out a day later carries its own, older
    // times) goes where it belongs, not to the head. At the head it showed as
    // the latest session until the next load re-sorted the list.
    const earlier = get().sessions
    const startedAt = new Date(result.timestamp).getTime()
    const at = earlier.findIndex(s => new Date(s.timestamp).getTime() <= startedAt)
    const allSessions = at === -1
      ? [...earlier, result]
      : [...earlier.slice(0, at), result, ...earlier.slice(at)]
    const lifetimeStats = computeLifetimeStats(allSessions)
    set(() => ({
      sessions: allSessions,
      lifetimeStats,
    }))

    // Award session XP first, then challenge XP, THEN check achievements — so a
    // level reached from this session's own XP is already applied when the
    // reach_level achievements are evaluated (they read persisted XP). Otherwise
    // "I hit Level 5" wouldn't unlock until the next session.
    // The sessions before this one decide how much of the day's limit is left.
    useLevelStore.getState().addSessionXP(result, earlier)

    // Update daily challenge progress. Bucket by the user's LOCAL day, the same
    // calendar the challenge engines credit against (see services/date-utils).
    //
    // Only for a session that ended today. One recorded after the fact ended
    // when it ended: yesterday's table, found this morning, is not progress
    // on today's challenge.
    const today = todayKey()
    const endedOn = dayKey(now)
    if (endedOn === today) {
      const todaySessions = allSessions.filter(s => dayKey(s.timestamp) === today)
      useChallengeStore.getState().updateProgress(result, todaySessions)
    }

    // Update weekly challenge progress (local ISO week, Monday-start) — by
    // the same rule, for a session that ended this week.
    const weekStart = weekStartKey()
    if (endedOn >= weekStart) {
      const weekSessions = allSessions.filter(s => dayKey(s.timestamp) >= weekStart)
      useWeeklyChallengeStore.getState().updateProgress(result, weekSessions)
    }

    // Achievements last, so they see this session's level and challenge XP.
    const dayStreak = get().getTrainingStreak()
    useAchievementStore.getState().checkAchievements(
      result, lifetimeStats, dayStreak, allSessions,
    )

    /*
     * Persistence comes last, and cannot cost anything above it.
     *
     * Two reasons, and both were live defects. The write used to run *first*,
     * so a local failure — quota, private browsing, a serialisation error —
     * skipped the session, the XP, the challenge progress and the achievement
     * check, and did it as an unhandled rejection with nothing on screen.
     *
     * And neither caller awaits this. `useSessionSave` fires it on unmount and
     * again on `pagehide`, where the page is already being torn down: work
     * scheduled after the first suspension point is not guaranteed to run. So
     * everything that matters is finished synchronously before this line, and
     * what is left is genuinely best-effort.
     *
     * Swallowed on purpose rather than rethrown: there is no caller to catch it.
     * The session stands for this run either way, and if the player is signed in
     * the cloud copy stands past the reload too.
     */
    try {
      await storage.saveSessionResult(result)
    } catch (e) {
      console.error('session could not be persisted; it still counts for this run', e)
    }
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

    // Weight by questions answered, so a 3-question session can't swing the
    // trend as much as a 100-question one (matches analytics-derive's accuracyOf).
    const weightedAccuracy = (group: TrainingSessionResult[]): number => {
      const totalQ = group.reduce((sum, s) => sum + s.totalQuestions, 0)
      if (totalQ === 0) return 0
      return group.reduce((sum, s) => sum + s.accuracy * s.totalQuestions, 0) / totalQ
    }

    const diff = weightedAccuracy(recent5) - weightedAccuracy(prev5)
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

    // Unique LOCAL training days, most recent first.
    const dates = [...new Set(sessions.map(s => dayKey(s.timestamp)))]
      .sort((a, b) => b.localeCompare(a))

    // The streak is alive only if the last training day is today or yesterday.
    if (dates[0] !== todayKey() && dates[0] !== dayKeyOffset(-1)) return 0

    let streak = 1
    for (let i = 1; i < dates.length; i++) {
      if (daysBetweenKeys(dates[i], dates[i - 1]) === 1) {
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
