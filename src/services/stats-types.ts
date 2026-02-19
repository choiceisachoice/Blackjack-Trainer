import type { CountingSystemId } from '../engine/counting/types'

/** All training modes that produce session results. */
export type TrainingMode =
  | 'speedDrill'
  | 'tableCounting'
  | 'deviationFlashCards'
  | 'deviationAtTable'
  | 'betSpread'
  | 'deckEstimation'

// ── Mode-specific detail interfaces ──

/** Speed Drill session details. */
export interface SpeedDrillDetails {
  type: 'speedDrill'
  /** Number of cards per round. */
  cardsPerRound: number
  /** Card display speed in ms. */
  speedMs: number
  /** RC error per round (0 = correct). */
  rcErrors: number[]
}

/** Table Counting session details. */
export interface TableCountingDetails {
  type: 'tableCounting'
  /** Difficulty level. */
  difficulty: 'easy' | 'normal' | 'hard'
  /** What count types were queried. */
  queryType: 'rc' | 'tc' | 'both'
  /** Number of hands played. */
  handsPlayed: number
  /** RC accuracy: correct / total prompts. */
  rcCorrect: number
  rcTotal: number
  /** TC accuracy: correct / total prompts. */
  tcCorrect: number
  tcTotal: number
}

/** Deviation Training session details (both flash cards and at-the-table). */
export interface DeviationDetails {
  type: 'deviationFlashCards' | 'deviationAtTable'
  /** Which deviation set was trained. */
  deviationSet: 'i18' | 'fab4' | 'all'
  /** Per-deviation results: key is deviation name. */
  perDeviation: Record<string, { correct: number; incorrect: number }>
  /** For at-the-table: average TC error. */
  avgTcError?: number
}

/** Bet Spread session details. */
export interface BetSpreadDetails {
  type: 'betSpread'
  /** Question mode used. */
  questionMode: 'A' | 'B' | 'C' | 'random'
  /** TC accuracy (for Type C questions). */
  tcCorrect: number
  tcTotal: number
  /** Bet accuracy across all types. */
  betCorrect: number
  betTotal: number
}

/** Deck Estimation session details. */
export interface DeckEstimationDetails {
  type: 'deckEstimation'
  /** Deck count in shoe. */
  deckCount: number
  /** Precision mode. */
  accuracyMode: 'half' | 'whole'
  /** Whether Quick Fire mode was used. */
  quickFire: boolean
  /** Each estimation: actual decks remaining, user estimate, error. */
  estimations: { actual: number; estimated: number | null; error: number }[]
}

/** Discriminated union of all detail types. */
export type SessionDetails =
  | SpeedDrillDetails
  | TableCountingDetails
  | DeviationDetails
  | BetSpreadDetails
  | DeckEstimationDetails

/**
 * A single completed training session result.
 *
 * Saved to localStorage after each session with >= 3 questions answered.
 */
export interface TrainingSessionResult {
  /** Unique session ID. */
  id: string
  /** Training mode. */
  mode: TrainingMode
  /** ISO timestamp of session start. */
  timestamp: string
  /** Counting system in use. */
  countingSystem: CountingSystemId
  /** Session duration in seconds. */
  durationSeconds: number
  /** Total questions/prompts answered. */
  totalQuestions: number
  /** Number answered correctly. */
  correctAnswers: number
  /** Accuracy as 0–1 ratio. */
  accuracy: number
  /** Best streak during session. */
  bestStreak: number
  /** Mode-specific details. */
  details: SessionDetails
}

/** Per-mode aggregate statistics. */
export interface ModeStats {
  /** Total sessions for this mode. */
  totalSessions: number
  /** Total questions across all sessions. */
  totalQuestions: number
  /** Total correct across all sessions. */
  totalCorrect: number
  /** Overall accuracy 0–1. */
  accuracy: number
  /** Best single-session accuracy. */
  bestAccuracy: number
  /** Total practice time in seconds. */
  totalPracticeSeconds: number
  /** Best streak ever achieved. */
  bestStreak: number
}

/** Daily aggregate for trend tracking. */
export interface DailyStats {
  /** ISO date string (YYYY-MM-DD). */
  date: string
  /** Number of sessions that day. */
  sessions: number
  /** Total questions that day. */
  totalQuestions: number
  /** Total correct that day. */
  totalCorrect: number
  /** Total practice seconds that day. */
  practiceSeconds: number
}

/** Overall lifetime statistics, computed from all sessions. */
export interface LifetimeStats {
  /** Aggregate totals. */
  totalSessions: number
  totalQuestions: number
  totalCorrect: number
  totalPracticeSeconds: number
  overallAccuracy: number
  bestStreak: number
  /** Per-mode breakdown. */
  byMode: Partial<Record<TrainingMode, ModeStats>>
  /** Daily aggregates (last 90 days). */
  dailyStats: DailyStats[]
}
