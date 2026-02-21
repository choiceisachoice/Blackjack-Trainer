import type { TrainingMode } from '../stats-types'

/** Achievement tier levels, from least to most prestigious. */
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'diamond'

/** Categories for grouping achievements. */
export type AchievementCategory =
  | 'getting_started'
  | 'dedication'
  | 'mastery'
  | 'speed'
  | 'counting'
  | 'deviations'
  | 'simulation'
  | 'ultimate'

/** Requirement types for achievement unlock conditions. */
export type AchievementRequirementType =
  | 'sessions'
  | 'accuracy'
  | 'streak'
  | 'hands'
  | 'speed'
  | 'mode_complete'
  | 'time'
  | 'perfect'
  | 'bankroll_sim'

/** Condition that must be met to unlock an achievement. */
export interface AchievementRequirement {
  /** The type of requirement check. */
  type: AchievementRequirementType
  /** Numeric threshold value (meaning depends on type). */
  value: number
  /** Optional: only counts for a specific training mode. */
  mode?: TrainingMode
}

/** A single achievement definition. */
export interface Achievement {
  /** Unique identifier. */
  id: string
  /** Display name. */
  name: string
  /** Human-readable description of how to unlock. */
  description: string
  /** Emoji icon for display. */
  icon: string
  /** Category for grouping in the gallery. */
  category: AchievementCategory
  /** Unlock condition. */
  requirement: AchievementRequirement
  /** Difficulty/prestige tier. */
  tier: AchievementTier
}

/** Record of a single unlocked achievement. */
export interface UnlockedAchievement {
  /** References Achievement.id. */
  achievementId: string
  /** Timestamp (ms since epoch) when unlocked. */
  unlockedAt: number
}
