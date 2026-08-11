import type { AppMode } from '../store/app-store'
import type { TrainingSessionResult } from './stats-types'
import { isProMode } from './pro-features'
import type { Translate } from '../i18n/translate'

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
  /**
   * Key for the sentence shown to the user, e.g. "3 sessions at 85% or
   * better". It is interpolated from `minSessions` and `minAccuracy` rather
   * than written out, so the promise and the threshold cannot drift apart —
   * they used to be two separate edits.
   */
  descriptionKey: string
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
  /**
   * Translation keys, not text. Every stage title, goal and reason is read on
   * the plan, the home screen, the analytics header and the recommendation
   * card — one place to translate them, four places that stay in step.
   */
  titleKey: string
  /** What you will be able to do once this stage is done. */
  goalKey: string
  /** Why it matters — the motivation, not the mechanics. */
  whyKey: string
  /** Reading that comes first, if any. */
  read?: { labelKey: string; mode: AppMode }
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
    titleKey: 'curriculum.rules.title',
    goalKey: 'curriculum.rules.goal',
    whyKey: 'curriculum.rules.why',
    read: { labelKey: 'curriculum.rules.read', mode: 'learn' },
  },
  {
    id: 'basic-strategy',
    titleKey: 'curriculum.basic-strategy.title',
    goalKey: 'curriculum.basic-strategy.goal',
    whyKey: 'curriculum.basic-strategy.why',
    read: { labelKey: 'curriculum.basic-strategy.read', mode: 'learn' },
    drill: {
      descriptionKey: 'curriculum.drill.flashcards',
      minSessions: 3,
      minAccuracy: 0.85,
      counts: s => s.mode === 'deviationFlashCards',
      mode: 'deviationTraining',
    },
  },
  {
    id: 'hi-lo',
    titleKey: 'curriculum.hi-lo.title',
    goalKey: 'curriculum.hi-lo.goal',
    whyKey: 'curriculum.hi-lo.why',
    read: { labelKey: 'curriculum.hi-lo.read', mode: 'learn' },
    drill: {
      descriptionKey: 'curriculum.drill.speedDrill',
      minSessions: 3,
      minAccuracy: 0.9,
      counts: s => s.mode === 'speedDrill',
      mode: 'speedDrill',
    },
  },
  {
    id: 'true-count',
    titleKey: 'curriculum.true-count.title',
    goalKey: 'curriculum.true-count.goal',
    whyKey: 'curriculum.true-count.why',
    read: { labelKey: 'curriculum.true-count.read', mode: 'learn' },
    drill: {
      descriptionKey: 'curriculum.drill.deckEstimation',
      minSessions: 3,
      minAccuracy: 0.8,
      counts: s => s.mode === 'deckEstimation',
      mode: 'deckEstimation',
    },
  },
  {
    id: 'deviations',
    titleKey: 'curriculum.deviations.title',
    goalKey: 'curriculum.deviations.goal',
    whyKey: 'curriculum.deviations.why',
    read: { labelKey: 'curriculum.deviations.read', mode: 'learn' },
    drill: {
      descriptionKey: 'curriculum.drill.deviations',
      minSessions: 3,
      minAccuracy: 0.8,
      counts: hasDeviationQuestions,
      mode: 'deviationTraining',
    },
  },
  {
    id: 'bet-spread',
    titleKey: 'curriculum.bet-spread.title',
    goalKey: 'curriculum.bet-spread.goal',
    whyKey: 'curriculum.bet-spread.why',
    drill: {
      descriptionKey: 'curriculum.drill.betSpread',
      minSessions: 3,
      minAccuracy: 0.85,
      counts: s => s.mode === 'betSpread',
      mode: 'betSpread',
    },
  },
  {
    id: 'table',
    titleKey: 'curriculum.table.title',
    goalKey: 'curriculum.table.goal',
    whyKey: 'curriculum.table.why',
    drill: {
      descriptionKey: 'curriculum.drill.casino',
      minSessions: 3,
      minAccuracy: 0,
      counts: s => s.mode === 'casinoSession',
      mode: 'casinoSession',
    },
  },
]

/**
 * The drill requirement as a sentence, with its own numbers filled in.
 *
 * Takes a translator rather than importing one: this module is pure and is
 * imported by tests and by the engine-facing services, neither of which should
 * pull in i18next.
 */
export function drillDescription(drill: DrillRequirement, t: Translate): string {
  return t(drill.descriptionKey, {
    n: drill.minSessions,
    pct: Math.round(drill.minAccuracy * 100),
  })
}

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
