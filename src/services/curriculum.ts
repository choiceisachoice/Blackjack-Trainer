import type { AppMode } from '../store/app-store'
import type { TrainingSessionResult } from './stats-types'
import { isProMode } from './pro-features'

/**
 * The training path, in the order card counting has to be learned.
 *
 * This is deliberately ONE ordered curriculum rather than separate tracks per
 * skill level. The subject has a hard dependency chain — you cannot size bets
 * by a count you can't keep, and you cannot count a game whose basic strategy
 * you don't know — so the only meaningful difference between a beginner and an
 * experienced counter is *where they start*, not which path they walk.
 *
 * Progress is derived from recorded sessions wherever it can be measured.
 * Reading is the one thing the app cannot verify, so those stages are marked
 * complete by the user and stored separately — stated honestly rather than
 * pretending a page view is knowledge.
 */

export type StageId =
  | 'rules'
  | 'basic-strategy'
  | 'hi-lo'
  | 'true-count'
  | 'deviations'
  | 'bet-spread'
  | 'table'

/** What a stage asks you to drill, and how well. */
export interface DrillRequirement {
  /** Shown to the user, e.g. "3 sessions at 85% or better". */
  description: string
  minSessions: number
  /** Accuracy floor as a fraction (0.85 = 85%). */
  minAccuracy: number
  /** Which recorded sessions count toward this stage. */
  counts: (s: TrainingSessionResult) => boolean
  /** The screen this drill lives on. */
  mode: AppMode
}

export interface CurriculumStage {
  id: StageId
  title: string
  /** What you will be able to do once this stage is done. */
  goal: string
  /** Why it matters — the motivation, not the mechanics. */
  why: string
  /** Reading that comes first, if any. */
  read?: { label: string; mode: AppMode }
  /** Measurable practice, if any. Stages without one are read-only. */
  drill?: DrillRequirement
}

/** A flashcards session that actually contained count-based deviation questions. */
function hasDeviationQuestions(s: TrainingSessionResult): boolean {
  if (s.mode !== 'deviationFlashCards') return false
  const details = s.details as { perDeviation?: Record<string, unknown> } | undefined
  return Object.keys(details?.perDeviation ?? {}).length > 0
}

export const CURRICULUM: CurriculumStage[] = [
  {
    id: 'rules',
    title: 'The game itself',
    goal: 'Know how a hand of blackjack is played, and what every term means.',
    why: 'Everything after this assumes hit, stand, soft, upcard and bust are second nature.',
    read: { label: 'Read: the game', mode: 'learn' },
  },
  {
    id: 'basic-strategy',
    title: 'Basic strategy',
    goal: 'Play the mathematically correct move for every hand, without thinking.',
    why: 'Counting adds about one percent. Playing basic strategy wrong costs you more than counting can ever win back — so this comes first.',
    read: { label: 'Read: strategy', mode: 'learn' },
    drill: {
      description: '3 Flashcards sessions at 85% or better',
      minSessions: 3,
      minAccuracy: 0.85,
      counts: s => s.mode === 'deviationFlashCards',
      mode: 'deviationTraining',
    },
  },
  {
    id: 'hi-lo',
    title: 'The Hi-Lo count',
    goal: 'Keep an accurate running count through a whole shoe at table speed.',
    why: 'This is the skill the whole edge rests on. Everything later is a calculation on top of this number.',
    read: { label: 'Read: Hi-Lo', mode: 'learn' },
    drill: {
      description: '3 Speed Drills at 90% or better',
      minSessions: 3,
      minAccuracy: 0.9,
      counts: s => s.mode === 'speedDrill',
      mode: 'speedDrill',
    },
  },
  {
    id: 'true-count',
    title: 'True count',
    goal: 'Convert the running count into the true count by judging the decks left.',
    why: 'A running count of +6 is weak with six decks left and strong with one. The true count is what your bets and deviations actually key off.',
    read: { label: 'Read: true count', mode: 'learn' },
    drill: {
      description: '3 Deck Estimation sessions at 80% or better',
      minSessions: 3,
      minAccuracy: 0.8,
      counts: s => s.mode === 'deckEstimation',
      mode: 'deckEstimation',
    },
  },
  {
    id: 'deviations',
    title: 'Deviations',
    goal: 'Know when the count overrides basic strategy — the Illustrious 18 and Fab 4.',
    why: 'This is where the count starts changing decisions, not just bet sizes. Most of the playing edge sits in a handful of plays.',
    read: { label: 'Read: deviations', mode: 'learn' },
    drill: {
      description: '3 deviation Flashcards sessions at 80% or better',
      minSessions: 3,
      minAccuracy: 0.8,
      counts: hasDeviationQuestions,
      mode: 'deviationTraining',
    },
  },
  {
    id: 'bet-spread',
    title: 'Bet spread',
    goal: 'Size your bet to the true count, so the edge turns into money.',
    why: 'Almost all of a counter’s profit comes from betting more when the odds are yours. A perfect count with a flat bet earns nothing.',
    drill: {
      description: '3 Bet Spread sessions at 85% or better',
      minSessions: 3,
      minAccuracy: 0.85,
      counts: s => s.mode === 'betSpread',
      mode: 'betSpread',
    },
  },
  {
    id: 'table',
    title: 'The whole thing, at the table',
    goal: 'Hold the count, play correctly and size bets — all at once, under pressure.',
    why: 'Each skill is easy alone. The job is doing all of them at once while the table talks.',
    drill: {
      description: '3 Casino Sessions played',
      minSessions: 3,
      minAccuracy: 0,
      counts: s => s.mode === 'casinoSession',
      mode: 'casinoSession',
    },
  },
]

/** Stage order lookup — the array index is the canonical order. */
export function stageIndex(id: StageId): number {
  return CURRICULUM.findIndex(s => s.id === id)
}

/** Whether a stage needs Pro, derived from the screen its drill lives on. */
export function stageNeedsPro(stage: CurriculumStage): boolean {
  return stage.drill ? isProMode(stage.drill.mode) : false
}

export interface StageProgress {
  stage: CurriculumStage
  /** Qualifying sessions completed so far (capped at the target). */
  current: number
  /** Sessions required; 0 for read-only stages. */
  target: number
  done: boolean
  /** True when this stage has no measurable drill and was ticked by the user. */
  readOnly: boolean
  locked: boolean
  /**
   * Every session attempted on this drill, whether or not it cleared the bar.
   *
   * Separate from `current` on purpose: the bar decides when a stage is
   * *finished*, it must not decide whether the work *happened*. Ten sessions at
   * 89% and ten at 50% both leave `current` at 0, and showing only that number
   * tells someone half a point from mastery that they have achieved nothing.
   */
  attempts: number
  /**
   * Best accuracy on this drill as a whole percentage, or null if untouched.
   *
   * Rounded **down**, so a 89.6% best can never be displayed as "90%" beside a
   * 90% bar it did not actually clear. Understating slightly is the safe
   * direction; a number that contradicts the verdict next to it is not.
   */
  best: number | null
  /** The stage's accuracy floor as a whole percentage. */
  bar: number
}

/**
 * How a stage is going, in the four shapes the UI actually needs.
 *
 * A union rather than loose fields because the interesting case — attempted,
 * nothing cleared — is exactly the one a bare `0/3` erases, and giving it a
 * name makes it impossible to forget when rendering.
 */
export type StageEffort =
  | { kind: 'untouched' }
  | { kind: 'locked' }
  /** Attempted, nothing has cleared the bar yet. `gap` is in percentage points. */
  | { kind: 'below'; best: number; bar: number; gap: number; attempts: number }
  /** At least one session cleared, but not enough of them. */
  | { kind: 'partial'; cleared: number; target: number }
  | { kind: 'done' }

/** Classify a stage's progress. Pure; reads nothing but what it is given. */
export function stageEffort(p: StageProgress): StageEffort {
  if (p.done) return { kind: 'done' }
  if (p.locked) return { kind: 'locked' }
  if (p.readOnly || p.attempts === 0 || p.best === null) return { kind: 'untouched' }
  if (p.current > 0) return { kind: 'partial', cleared: p.current, target: p.target }
  return {
    kind: 'below',
    best: p.best,
    bar: p.bar,
    // At least 1, because `best` is floored: a 89.6% best against a 90% bar
    // would otherwise round to a gap of 0 and read as though it had cleared.
    gap: Math.max(1, p.bar - p.best),
    attempts: p.attempts,
  }
}

/**
 * Work out where the learner stands on one stage.
 *
 * A session counts only if it both matches the stage and cleared the accuracy
 * floor — "I did three sessions" is not the same as "I can do this", and the
 * bar is what makes the plan worth following.
 */
export function deriveStageProgress(
  stage: CurriculumStage,
  sessions: readonly TrainingSessionResult[],
  readStages: readonly StageId[],
  isPro: boolean,
): StageProgress {
  const locked = stageNeedsPro(stage) && !isPro

  if (!stage.drill) {
    return {
      stage,
      current: readStages.includes(stage.id) ? 1 : 0,
      target: 1,
      done: readStages.includes(stage.id),
      readOnly: true,
      locked,
      attempts: 0,
      best: null,
      bar: 0,
    }
  }

  const { minSessions, minAccuracy, counts } = stage.drill
  const attempted = sessions.filter(counts)
  const qualifying = attempted.filter(s => s.accuracy >= minAccuracy).length

  return {
    stage,
    current: Math.min(qualifying, minSessions),
    target: minSessions,
    done: qualifying >= minSessions,
    readOnly: false,
    locked,
    attempts: attempted.length,
    best: attempted.length
      ? Math.floor(Math.max(...attempted.map(s => s.accuracy)) * 100)
      : null,
    bar: Math.round(minAccuracy * 100),
  }
}

/** Progress across the whole path, in order. */
export function deriveCurriculum(
  sessions: readonly TrainingSessionResult[],
  readStages: readonly StageId[],
  isPro: boolean,
): StageProgress[] {
  return CURRICULUM.map(stage => deriveStageProgress(stage, sessions, readStages, isPro))
}

/**
 * The stage the learner should work on now: the first unfinished one at or
 * after their placement. Everything before the placement is treated as already
 * known, so an experienced counter is never sent back to the rules.
 */
export function currentStage(
  progress: readonly StageProgress[],
  placement: StageId,
): StageProgress | null {
  const from = stageIndex(placement)
  return progress.slice(from).find(p => !p.done) ?? null
}

/**
 * The next stage the learner can actually open, when the one they are on is
 * Pro-gated.
 *
 * The curriculum interleaves free and Pro stages — true count is Pro but
 * deviations, the stage after it, is not. Without this a free learner who
 * finishes Hi-Lo is told "next: true count", cannot open it, and is never told
 * that the stage beyond is theirs to train. The paywall stays honest; the dead
 * end does not.
 *
 * Returns null when the current stage is already open, or when nothing further
 * is reachable.
 */
export function nextUnlockedStage(
  progress: readonly StageProgress[],
  placement: StageId,
  until: StageId | null = null,
): StageProgress | null {
  const current = currentStage(progress, placement)
  if (!current || !current.locked) return null

  const from = stageIndex(current.stage.id) + 1
  // `until` bounds the search at the learner's goal. Without it the plan
  // offered a stage as "open to you now" while labelling that same stage
  // "beyond your goal" further down the page — one screen contradicting itself.
  const to = until ? stageIndex(until) + 1 : progress.length
  return progress.slice(from, to).find(p => !p.done && !p.locked) ?? null
}

/** Recent form on one stage's drill. */
export interface StageTrend {
  /** Accuracy of the most recent matching sessions as percentages, oldest first. */
  points: number[]
  /** How many of those cleared the stage's accuracy floor. */
  cleared: number
  /** The floor itself, as a percentage. */
  floor: number
}

/**
 * How the last few attempts at a stage's drill actually went.
 *
 * The plan shows a count of qualifying sessions, which answers "how far" but
 * not "how am I doing" — three near misses and three disasters look identical
 * at 0/3. This gives the plan the same evidence the analytics page works from,
 * so the two never tell different stories about the same sessions.
 *
 * Returns null for stages with no measurable drill.
 */
export function stageTrend(
  stage: CurriculumStage,
  sessions: readonly TrainingSessionResult[],
  limit = 10,
): StageTrend | null {
  if (!stage.drill) return null
  const { counts, minAccuracy } = stage.drill

  const matching = sessions
    .filter(counts)
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-limit)

  return {
    points: matching.map(s => Math.round(s.accuracy * 100)),
    cleared: matching.filter(s => s.accuracy >= minAccuracy).length,
    floor: Math.round(minAccuracy * 100),
  }
}

/**
 * The stage the learner is working on right now, or null if they have not been
 * placed yet.
 *
 * This is the single answer to "where is this user" that the rest of the app
 * reads — challenges, XP and analytics all key off it rather than each forming
 * their own opinion from session history.
 */
export function activeStage(
  sessions: readonly TrainingSessionResult[],
  isPro: boolean,
): StageId | null {
  const placement = getPlacement()
  if (!placement) return null
  const progress = deriveCurriculum(sessions, getReadStages(), isPro)
  return currentStage(progress, placement)?.stage.id ?? null
}

// ── Persistence ──────────────────────────────────────────────────────
// Local-first, like the rest of the app: the plan works offline and the
// placement follows the account once profile sync carries it.

const PLACEMENT_KEY = 'bjt_placement'
const READ_STAGES_KEY = 'bjt_read_stages'

const isStageId = (v: string): v is StageId => CURRICULUM.some(s => s.id === v)

/** The stage the assessment placed this learner at, or null if untaken. */
export function getPlacement(): StageId | null {
  try {
    const raw = localStorage.getItem(PLACEMENT_KEY)
    return raw && isStageId(raw) ? raw : null
  } catch {
    return null
  }
}

const SKIPPED_KEY = 'bjt_placement_skipped'

/**
 * Whether the learner declined the placement test.
 *
 * Recorded so the decision sticks. Asking again on every visit is not a
 * question, it is nagging — and the plan has to be useful without an answer
 * anyway, or it is a gate rather than a plan.
 */
export function hasSkippedPlacement(): boolean {
  try {
    return localStorage.getItem(SKIPPED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setPlacementSkipped(): void {
  try {
    localStorage.setItem(SKIPPED_KEY, 'true')
  } catch {
    /* storage unavailable — worst case is being offered the test again */
  }
}

/** Forget the skip, so taking the test later works normally. */
export function clearPlacementSkip(): void {
  try {
    localStorage.removeItem(SKIPPED_KEY)
  } catch {
    /* storage unavailable */
  }
}

export function setPlacement(stage: StageId): void {
  try {
    localStorage.setItem(PLACEMENT_KEY, stage)
  } catch {
    /* storage unavailable — the plan falls back to starting at the beginning */
  }
}

/** Reading stages the learner has confirmed. Unknown ids are dropped. */
export function getReadStages(): StageId[] {
  try {
    const raw = localStorage.getItem(READ_STAGES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is StageId => typeof v === 'string' && isStageId(v)) : []
  } catch {
    return []
  }
}

/** Mark a reading stage confirmed. Idempotent. */
export function markStageRead(id: StageId): void {
  const next = Array.from(new Set([...getReadStages(), id]))
  try {
    localStorage.setItem(READ_STAGES_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable */
  }
}
