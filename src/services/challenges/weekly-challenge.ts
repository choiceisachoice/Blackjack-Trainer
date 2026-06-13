import type { TrainingSessionResult } from '../stats-types'
import type {
  WeeklyChallengeDefinition,
  WeeklyChallengeState,
  WeeklyChallengeStorage,
} from './challenge-types'
import { WEEKLY_CHALLENGE_POOL } from './weekly-challenge-pool'

const STORAGE_KEY = 'bjt_weekly_challenges'

/**
 * Core engine for the Weekly Challenge system.
 *
 * Deterministically selects one challenge per week (Mon–Sun) from the pool.
 * Tracks progress, completion, streaks, and XP via localStorage.
 */
export class WeeklyChallengeEngine {
  private storage: WeeklyChallengeStorage

  constructor() {
    this.storage = this.loadFromStorage()
    this.ensureThisWeeksChallenge()
  }

  /**
   * djb2 hash of a string → bounded index into a pool.
   * Deterministic: same string always returns the same index.
   */
  hashToIndex(str: string, poolSize: number): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
    }
    return ((hash % poolSize) + poolSize) % poolSize
  }

  /**
   * Get the Monday (YYYY-MM-DD) of the current week (ISO 8601).
   */
  getWeekId(): string {
    const now = new Date()
    const day = now.getDay() // 0=Sun, 1=Mon, …, 6=Sat (local)
    const diff = day === 0 ? -6 : 1 - day // offset to Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  }

  /** Get this week's challenge definition. */
  getThisWeekChallenge(): WeeklyChallengeDefinition {
    const weekId = this.getWeekId()
    const idx = this.hashToIndex(weekId, WEEKLY_CHALLENGE_POOL.length)
    return WEEKLY_CHALLENGE_POOL[idx]
  }

  /** Get the current state for this week's challenge. */
  getState(): WeeklyChallengeState {
    this.ensureThisWeeksChallenge()
    return { ...this.storage.current }
  }

  /** Get total weekly challenges completed all-time. */
  getTotalCompleted(): number {
    return this.storage.totalCompleted
  }

  /** Get total XP earned from weekly challenges all-time. */
  getTotalXP(): number {
    return this.storage.totalXP
  }

  /**
   * Calculate the current weekly completion streak.
   *
   * Counts consecutive completed weeks backward from this week
   * (or last week if this week isn't completed yet).
   */
  getStreak(): number {
    const weeks = [...this.storage.completedWeeks].sort((a, b) => b.localeCompare(a))
    if (weeks.length === 0) return 0

    const thisWeek = this.getWeekId()
    const lastWeek = this.getWeekIdOffset(-1)

    // Streak must start from this week or last week
    if (weeks[0] !== thisWeek && weeks[0] !== lastWeek) return 0

    const weekSet = new Set(weeks)
    let streak = 0
    let checkWeek = weeks[0] === thisWeek ? thisWeek : lastWeek

    while (weekSet.has(checkWeek)) {
      streak++
      // Move to previous Monday
      checkWeek = this.getPreviousMonday(checkWeek)
    }

    return streak
  }

  /**
   * Get time remaining until the end of the week (Sunday 23:59:59).
   */
  getTimeRemaining(): { days: number; hours: number; minutes: number } {
    const now = new Date()
    const day = now.getDay() // 0=Sun, 1=Mon, …, 6=Sat (local)
    const daysUntilSunday = day === 0 ? 0 : 7 - day
    // End of week = Sunday 23:59:59 local time
    const endOfWeek = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday,
      23, 59, 59,
    )

    const diffMs = Math.max(0, endOfWeek.getTime() - now.getTime())
    const totalMinutes = Math.floor(diffMs / 60000)
    const totalHours = Math.floor(totalMinutes / 60)
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    const minutes = totalMinutes % 60

    return { days, hours, minutes }
  }

  /**
   * Update challenge progress based on a completed session.
   *
   * @param session The just-completed session.
   * @param allWeekSessions All sessions recorded this week (including the new one).
   * @returns `true` if the challenge was just completed by this update.
   */
  updateProgress(
    session: TrainingSessionResult,
    allWeekSessions: TrainingSessionResult[],
  ): boolean {
    this.ensureThisWeeksChallenge()

    // Already completed — no-op
    if (this.storage.current.completed) return false

    const challenge = this.getThisWeekChallenge()
    const wasBelowTarget = this.storage.current.progress < challenge.target

    this.computeProgress(challenge, session, allWeekSessions)

    const nowComplete = this.storage.current.progress >= challenge.target

    if (wasBelowTarget && nowComplete) {
      this.storage.current.completed = true
      this.storage.current.completedAt = new Date().toISOString()
      const weekId = this.getWeekId()
      if (!this.storage.completedWeeks.includes(weekId)) {
        this.storage.completedWeeks.push(weekId)
      }
      this.storage.totalCompleted++
      this.storage.totalXP += challenge.xpReward
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

  /** Clear all weekly challenge data from localStorage. */
  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY)
    this.storage = {
      current: this.createFreshState(),
      completedWeeks: [],
      totalCompleted: 0,
      totalXP: 0,
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private computeProgress(
    challenge: WeeklyChallengeDefinition,
    session: TrainingSessionResult,
    allWeekSessions: TrainingSessionResult[],
  ): void {
    const filtered = challenge.requiredMode
      ? allWeekSessions.filter(s => s.mode === challenge.requiredMode)
      : allWeekSessions

    switch (challenge.type) {
      case 'play_sessions':
        this.storage.current.progress = filtered.length
        break

      case 'play_hands':
        this.storage.current.progress = filtered.reduce(
          (sum, s) => sum + s.totalQuestions, 0,
        )
        break

      case 'play_minutes':
        this.storage.current.progress = Math.floor(
          filtered.reduce((sum, s) => sum + s.durationSeconds, 0) / 60,
        )
        break

      case 'deviation_correct': {
        const devSessions = allWeekSessions.filter(
          s => s.mode === 'deviationFlashCards' || s.mode === 'deviationAtTable',
        )
        this.storage.current.progress = devSessions.reduce(
          (sum, s) => sum + s.correctAnswers, 0,
        )
        break
      }

      case 'earn_profit': {
        const totalProfit = filtered.reduce((sum, s) => {
          if (s.details.type === 'casinoSession') {
            return sum + s.details.netProfit
          }
          return sum
        }, 0)
        this.storage.current.progress = Math.max(0, totalProfit)
        break
      }

      case 'unique_days': {
        const dates = new Set(
          filtered.map(s => s.timestamp.slice(0, 10)),
        )
        this.storage.current.progress = dates.size
        break
      }

      case 'unique_modes': {
        const modes = new Set(
          filtered.map(s => s.mode),
        )
        this.storage.current.progress = modes.size
        break
      }

      case 'sessions_with_accuracy': {
        const minAcc = (challenge.minAccuracy ?? 0) / 100
        const qualifying = filtered.filter(s => s.accuracy >= minAcc)
        this.storage.current.progress = qualifying.length
        break
      }

      case 'daily_challenges_completed': {
        this.storage.current.progress = this.countDailyChallengesThisWeek()
        break
      }

      case 'win_streak': {
        // Keep max bestStreak across all qualifying sessions
        if (challenge.requiredMode && session.mode !== challenge.requiredMode) break
        const maxStreak = filtered.reduce(
          (max, s) => Math.max(max, s.bestStreak), 0,
        )
        this.storage.current.progress = Math.max(
          this.storage.current.progress, maxStreak,
        )
        break
      }

      default:
        break
    }
  }

  /**
   * Count daily challenges completed during the current week
   * by reading the daily challenge localStorage.
   */
  private countDailyChallengesThisWeek(): number {
    try {
      const raw = localStorage.getItem('bjt_daily_challenge')
      if (!raw) return 0
      const data = JSON.parse(raw)
      if (!Array.isArray(data.completedDates)) return 0

      const weekId = this.getWeekId()
      const mondayDate = new Date(weekId + 'T00:00:00Z')
      const sundayEnd = new Date(mondayDate)
      sundayEnd.setUTCDate(sundayEnd.getUTCDate() + 7)

      return data.completedDates.filter((dateStr: string) => {
        const d = new Date(dateStr + 'T12:00:00Z')
        return d >= mondayDate && d < sundayEnd
      }).length
    } catch {
      return 0
    }
  }

  private ensureThisWeeksChallenge(): void {
    const weekId = this.getWeekId()
    if (this.storage.current.weekId !== weekId) {
      this.storage.current = this.createFreshState()
      this.saveToStorage()
    }
  }

  private createFreshState(): WeeklyChallengeState {
    const weekId = this.getWeekId()
    const challenge = this.getThisWeekChallenge()
    return {
      challengeId: challenge.id,
      weekId,
      progress: 0,
      completed: false,
      completedAt: null,
    }
  }

  /**
   * Get the Monday of N weeks offset from the current week.
   */
  private getWeekIdOffset(offsetWeeks: number): string {
    const weekId = this.getWeekId()
    const d = new Date(weekId + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + offsetWeeks * 7)
    return d.toISOString().slice(0, 10)
  }

  /** Get the Monday before a given Monday date string. */
  private getPreviousMonday(mondayStr: string): string {
    const d = new Date(mondayStr + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - 7)
    return d.toISOString().slice(0, 10)
  }

  private loadFromStorage(): WeeklyChallengeStorage {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return this.createDefaultStorage()
      const parsed = JSON.parse(raw) as WeeklyChallengeStorage
      if (!parsed.current || !Array.isArray(parsed.completedWeeks)) {
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

  private createDefaultStorage(): WeeklyChallengeStorage {
    return {
      current: this.createFreshState(),
      completedWeeks: [],
      totalCompleted: 0,
      totalXP: 0,
    }
  }
}

/** Singleton instance for app-wide use. */
export const weeklyChallengeEngine = new WeeklyChallengeEngine()
