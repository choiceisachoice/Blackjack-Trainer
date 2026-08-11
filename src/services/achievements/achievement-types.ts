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
  | 'casino_session'
  | 'challenges'
  | 'level_system'
  | 'milestones'
  | 'extreme'
  | 'counting_mastery'
  | 'bankrollTracker'

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
  | 'casino_bots'
  | 'casino_hands'
  | 'casino_grade'
  | 'casino_bet_accuracy'
  | 'casino_play_accuracy'
  | 'casino_count_accuracy'
  | 'casino_triple'
  | 'casino_profit'
  | 'casino_blackjack'
  | 'casino_streak'
  | 'casino_split_aces'
  | 'casino_max_split'
  | 'casino_grade_count'
  | 'daily_completed'
  | 'weekly_completed'
  | 'daily_streak'
  | 'reach_level'
  | 'total_hands'
  | 'total_hours'
  | 'perfect_sessions'
  | 'speed_drill_perfect'
  | 'unique_systems'
  | 'tracker_sessions'
  | 'tracker_first_win'
  | 'tracker_win_streak'
  | 'tracker_total_profit'
  | 'tracker_total_hours'
  | 'tracker_session_hours'
  | 'tracker_single_session_profit'
  | 'tracker_comeback'
  // ── Added in the 2026-07 balance pass ──
  /** Sustained accuracy: average >= value% over the last `window` sessions of `mode`. */
  | 'sustained_accuracy'
  /** Best accuracy >= value% in every one of the five core training modes. */
  | 'all_modes_accuracy'
  /** Best in-session answer streak >= value. */
  | 'session_streak'
  /** value% accuracy in a Quick Fire Deck Estimation session. */
  | 'quickfire_accuracy'
  /** value% accuracy in a Speed Drill at Fast speed (<=500ms). */
  | 'speed_accuracy'
  /** value% deviation accuracy in a Casino Session. */
  | 'casino_deviation_accuracy'
  /** A single session lasting >= value minutes. */
  | 'session_duration'
  /** Play >= value distinct core modes in a single calendar day. */
  | 'modes_in_day'
  /** Complete a session started after midnight (00:00–05:00). */
  | 'night_session'
  /** Meta: unlock >= value other achievements. */
  | 'meta_unlocks'
  /** Master every deviation in a set (>= `value` correct each, 75%+ accuracy). */
  | 'deviation_set_mastery'

/** Condition that must be met to unlock an achievement. */
export interface AchievementRequirement {
  /** The type of requirement check. */
  type: AchievementRequirementType
  /** Numeric threshold value (meaning depends on type). */
  value: number
  /** Optional: only counts for a specific training mode. */
  mode?: TrainingMode
  /** Optional: rolling window of sessions (used by `sustained_accuracy`). */
  window?: number
  /** Optional: which deviation set (used by `deviation_set_mastery`). */
  deviationSet?: 'i18' | 'fab4'
}

/** A single achievement definition. */
export interface Achievement {
  /**
   * Unique identifier — and the stem of this achievement's two message keys,
   * `ach.<id>.name` and `ach.<id>.desc`. The text itself lives in the message
   * files, so the 102 entries stay a table of requirements.
   */
  id: string
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
