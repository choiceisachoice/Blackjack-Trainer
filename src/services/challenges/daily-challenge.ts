import type { TrainingSessionResult } from '../stats-types'
import type {
  ChallengeDefinition,
  DailyChallengeState,
  DailyChallengeStorage,
} from './challenge-types'
import { CHALLENGE_XP } from './challenge-types'
import { CHALLENGE_POOL } from './challenge-pool'
import { selectChallenge, hashToIndex, isReachable, type LearnerContext } from './challenge-selection'
import { todayKey, dayKeyOffset, shiftDayKey } from '../date-utils'

const STORAGE_KEY = 'bjt_daily_challenge'

/**
 * Core engine for the Daily Challenge system.
 *
 * Deterministically selects one challenge per day from the pool.
 * Tracks progress, completion, streaks, and XP via localStorage.
 */
export class DailyChallengeEngine {
  private storage: DailyChallengeStorage
  private context: LearnerContext

  /**
   * @param context Where the learner stands. Defaults to unplaced and free —
   *   the safe assumption until the store knows better, because it can only
   *   narrow the pool to things anyone can open.
   */
  constructor(context: LearnerContext = { stage: null, isPro: false }) {
    this.context = context
    this.storage = this.loadFromStorage()
    this.ensureTodaysChallenge()
  }

  /**
   * djb2 hash of a date string → bounded index into the pool.
   * Deterministic: same date always returns the same index.
   */
  hashDateToIndex(dateStr: string, poolSize: number): number {
    return hashToIndex(dateStr, poolSize)
  }

  /**
   * Tell the engine where the learner stands, so selection can fit them.
   *
   * Set by the challenge store from the training plan and the entitlement.
   * Until it is set, selection behaves as it always did.
   */
  setLearnerContext(context: LearnerContext): void {
    this.context = context
    this.ensureTodaysChallenge()

    // The engine is constructed before the store knows who the learner is, so
    // a fresh day can be picked with the default context. Re-pick when the
    // stored challenge turns out to be out of reach — but only while progress
    // is still zero, so nobody ever loses work to a re-selection.
    const current = this.getTodayChallenge()
    if (this.storage.current.progress === 0 && !isReachable(current, context)) {
      const replacement = selectChallenge(CHALLENGE_POOL, todayKey(), context)
      if (replacement.id !== current.id) {
        this.storage.current = { ...this.storage.current, challengeId: replacement.id }
        this.saveToStorage()
      }
    }
  }

  /**
   * Get today's challenge definition.
   *
   * Once a day's challenge has been chosen it is read back from storage rather
   * than reselected. Progress is stored against it, so re-deriving it from the
   * current context would swap the challenge out from under a half-finished
   * one the moment the learner completed a stage or upgraded to Pro.
   */
  getTodayChallenge(): ChallengeDefinition {
    const today = todayKey()
    // Optional chaining is load-bearing: the constructor builds default storage
    // by asking for today's challenge, so this runs once before `storage` is
    // assigned. No stored state then — selecting fresh is the correct answer.
    const current = this.storage?.current
    if (current?.date === today) {
      const stored = CHALLENGE_POOL.find(c => c.id === current.challengeId)
      if (stored) return stored
    }
    return selectChallenge(CHALLENGE_POOL, today, this.context)
  }

  /** Get the current state for today's challenge. */
  getState(): DailyChallengeState {
    this.ensureTodaysChallenge()
    return { ...this.storage.current }
  }

  /** Get total challenges completed all-time. */
  getTotalCompleted(): number {
    return this.storage.totalCompleted
  }

  /** Get total XP earned all-time. */
  getTotalXP(): number {
    return this.storage.totalXP
  }

  /**
   * Calculate the current completion streak.
   *
   * Counts consecutive completed days backward from today (or yesterday
   * if today isn't completed yet).
   */
  getStreak(): number {
    const dates = [...this.storage.completedDates].sort((a, b) => b.localeCompare(a))
    if (dates.length === 0) return 0

    const today = todayKey()
    const yesterday = dayKeyOffset(-1)

    // Streak must start from today or yesterday
    if (dates[0] !== today && dates[0] !== yesterday) return 0

    const dateSet = new Set(dates)
    let streak = 0
    let checkDate = dates[0] === today ? today : yesterday

    while (dateSet.has(checkDate)) {
      streak++
      checkDate = shiftDayKey(checkDate, -1)
    }

    return streak
  }

  /**
   * Update challenge progress based on a completed session.
   *
   * @param session The just-completed session.
   * @param allTodaySessions All sessions recorded today (including the new one).
   * @returns `true` if the challenge was just completed by this update.
   */
  updateProgress(
    session: TrainingSessionResult,
    allTodaySessions: TrainingSessionResult[],
  ): boolean {
    this.ensureTodaysChallenge()

    // Already completed — no-op
    if (this.storage.current.completed) return false

    const challenge = this.getTodayChallenge()
    const wasBelowTarget = !this.isComplete(this.storage.current.progress, challenge)

    if (challenge.progressMode === 'cumulative_today') {
      this.updateCumulative(challenge, allTodaySessions)
    } else {
      this.updateSingleSession(challenge, session)
    }

    const nowComplete = this.isComplete(this.storage.current.progress, challenge)

    if (wasBelowTarget && nowComplete) {
      this.storage.current.completed = true
      this.storage.current.completedAt = new Date().toISOString()
      const today = todayKey()
      if (!this.storage.completedDates.includes(today)) {
        this.storage.completedDates.push(today)
      }
      this.storage.totalCompleted++
      this.storage.totalXP += CHALLENGE_XP[challenge.difficulty]
      this.saveToStorage()
      return true
    }

    this.saveToStorage()
    return false
  }

  /** Reload state from localStorage (useful after external mutation in tests). */
  reloadFromStorage(): void {
    this.storage = this.loadFromStorage()
  }

  /** Clear all challenge data from localStorage. */
  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY)
    this.storage = {
      current: this.createFreshState(),
      completedDates: [],
      totalCompleted: 0,
      totalXP: 0,
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private isComplete(progress: number, challenge: ChallengeDefinition): boolean {
    if (challenge.type === 'speed_time') {
      // For speed challenges, lower is better: progress <= target means complete
      return progress > 0 && progress <= challenge.target
    }
    return progress >= challenge.target
  }

  private updateCumulative(
    challenge: ChallengeDefinition,
    allTodaySessions: TrainingSessionResult[],
  ): void {
    const filtered = challenge.requiredMode
      ? allTodaySessions.filter(s => s.mode === challenge.requiredMode)
      : allTodaySessions

    switch (challenge.type) {
      case 'play_sessions':
        this.storage.current.progress = filtered.length
        break
      case 'play_hands':
        this.storage.current.progress = filtered.reduce((sum, s) => sum + s.totalQuestions, 0)
        break
      case 'play_minutes':
        this.storage.current.progress = Math.floor(
          filtered.reduce((sum, s) => sum + s.durationSeconds, 0) / 60
        )
        break
      case 'practice_mode':
        this.storage.current.progress = filtered.length
        break
      case 'deviation_correct': {
        // Sum correctAnswers from deviation sessions only
        const devSessions = allTodaySessions.filter(
          s => s.mode === 'deviationFlashCards' || s.mode === 'deviationAtTable'
        )
        this.storage.current.progress = devSessions.reduce(
          (sum, s) => sum + s.correctAnswers, 0
        )
        break
      }
      default:
        break
    }
  }

  private updateSingleSession(
    challenge: ChallengeDefinition,
    session: TrainingSessionResult,
  ): void {
    // Check mode restriction
    if (challenge.requiredMode && session.mode !== challenge.requiredMode) return

    let value = 0

    switch (challenge.type) {
      case 'achieve_accuracy':
        value = Math.round(session.accuracy * 100)
        break
      case 'win_streak':
        value = session.bestStreak
        break
      case 'earn_profit': {
        if (session.details.type === 'casinoSession') {
          value = Math.max(0, session.details.netProfit)
        }
        break
      }
      case 'count_check': {
        if (session.details.type === 'casinoSession') {
          value = session.details.countAccuracy
        }
        break
      }
      case 'speed_time': {
        if (session.totalQuestions > 0) {
          value = Math.round((session.durationSeconds / session.totalQuestions) * 1000)
        }
        break
      }
      default:
        break
    }

    if (challenge.type === 'speed_time') {
      // For speed: keep the lowest (best) non-zero value
      if (value > 0 && (this.storage.current.progress === 0 || value < this.storage.current.progress)) {
        this.storage.current.progress = value
      }
    } else {
      // For all others: keep the maximum
      if (value > this.storage.current.progress) {
        this.storage.current.progress = value
      }
    }
  }

  private ensureTodaysChallenge(): void {
    const today = todayKey()
    if (this.storage.current.date !== today) {
      this.storage.current = this.createFreshState()
      this.saveToStorage()
    }
  }

  private createFreshState(): DailyChallengeState {
    const today = todayKey()
    const challenge = this.getTodayChallenge()
    return {
      challengeId: challenge.id,
      date: today,
      progress: 0,
      completed: false,
      completedAt: null,
    }
  }

  private loadFromStorage(): DailyChallengeStorage {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return this.createDefaultStorage()
      const parsed = JSON.parse(raw) as DailyChallengeStorage
      // Validate shape
      if (!parsed.current || !Array.isArray(parsed.completedDates)) {
        return this.createDefaultStorage()
      }
      return parsed
    } catch {
      return this.createDefaultStorage()
    }
  }

  private saveToStorage(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.storage))
  }

  private createDefaultStorage(): DailyChallengeStorage {
    return {
      current: this.createFreshState(),
      completedDates: [],
      totalCompleted: 0,
      totalXP: 0,
    }
  }
}

/** Singleton instance for app-wide use. */
export const dailyChallengeEngine = new DailyChallengeEngine()
