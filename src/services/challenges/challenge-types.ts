import type { TrainingMode } from '../stats-types'

/** The kind of metric a challenge tracks. */
export type ChallengeType =
  | 'play_sessions'
  | 'play_hands'
  | 'achieve_accuracy'
  | 'win_streak'
  | 'earn_profit'
  | 'practice_mode'
  | 'count_check'
  | 'deviation_correct'
  | 'speed_time'
  | 'play_minutes'

/** Difficulty tier for a challenge. */
export type ChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'very_hard'

/** XP awarded per difficulty tier. */
export const CHALLENGE_XP: Record<ChallengeDifficulty, number> = {
  easy: 50,
  medium: 100,
  hard: 150,
  very_hard: 200,
}

/** A single challenge definition from the pool. */
export interface ChallengeDefinition {
  /** Unique identifier. */
  id: string
  /** Key for the display title, under `chal`. */
  titleKey: string
  /** Key for the line below it. */
  descKey: string
  /** Emoji icon. */
  icon: string
  /** What metric this challenge tracks. */
  type: ChallengeType
  /** Difficulty tier (determines XP). */
  difficulty: ChallengeDifficulty
  /** Numeric target to reach. */
  target: number
  /** How progress accumulates. */
  progressMode: 'cumulative_today' | 'single_session'
  /** If set, only sessions of this mode count. */
  requiredMode?: TrainingMode
}

/** Today's challenge state (progress tracking). */
export interface DailyChallengeState {
  /** ID of the active challenge definition. */
  challengeId: string
  /** Date string (YYYY-MM-DD) for this challenge. */
  date: string
  /** Current progress toward the target. */
  progress: number
  /** Whether the challenge has been completed. */
  completed: boolean
  /** ISO timestamp of completion, or null. */
  completedAt: string | null
}

/** Persisted data shape in localStorage. */
export interface DailyChallengeStorage {
  /** Current day's challenge state. */
  current: DailyChallengeState
  /** Array of date strings (YYYY-MM-DD) when challenges were completed. */
  completedDates: string[]
  /** Total challenges completed all-time. */
  totalCompleted: number
  /** Total XP earned all-time. */
  totalXP: number
}

// ── Weekly Challenge Types ──────────────────────────────────

/** Metric types tracked by weekly challenges. */
export type WeeklyChallengeType =
  | 'play_sessions'
  | 'play_hands'
  | 'play_minutes'
  | 'deviation_correct'
  | 'earn_profit'
  | 'win_streak'
  | 'unique_days'
  | 'unique_modes'
  | 'sessions_with_accuracy'
  | 'daily_challenges_completed'

/** A single weekly challenge definition. */
export interface WeeklyChallengeDefinition {
  /** Unique identifier. */
  id: string
  /** Key for the display title, under `chal`. */
  titleKey: string
  /** Key for the line below it. */
  descKey: string
  /** Emoji icon. */
  icon: string
  /** What metric this challenge tracks. */
  type: WeeklyChallengeType
  /** Difficulty tier. */
  difficulty: ChallengeDifficulty
  /** XP awarded on completion (varies per challenge, not per tier). */
  xpReward: number
  /** Numeric target to reach. */
  target: number
  /** If set, only sessions of this mode count. */
  requiredMode?: TrainingMode
  /** Minimum accuracy (0-100) for sessions_with_accuracy type. */
  minAccuracy?: number
}

/** Current week's challenge state (progress tracking). */
export interface WeeklyChallengeState {
  /** ID of the active challenge definition. */
  challengeId: string
  /** Monday date string (YYYY-MM-DD) identifying this week. */
  weekId: string
  /** Current progress toward the target. */
  progress: number
  /** Whether the challenge has been completed. */
  completed: boolean
  /** ISO timestamp of completion, or null. */
  completedAt: string | null
}

/** Persisted weekly challenge data in localStorage. */
export interface WeeklyChallengeStorage {
  /** Current week's challenge state. */
  current: WeeklyChallengeState
  /** Array of weekId strings (Monday dates) when challenges were completed. */
  completedWeeks: string[]
  /** Total weekly challenges completed all-time. */
  totalCompleted: number
  /** Total XP earned from weekly challenges. */
  totalXP: number
}
