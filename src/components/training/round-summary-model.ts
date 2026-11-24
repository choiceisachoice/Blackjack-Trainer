import { minAnswersFor, provesAccuracy } from '../../services/accuracy-sample'
import { CURRICULUM, deriveStageProgress, stageIndex, type StageId } from '../../services/curriculum'
import { LEVELS, type LevelDefinition } from '../../services/level-system'
import type { Achievement, AchievementRequirementType } from '../../services/achievements/achievement-types'
import type { TrainingMode, TrainingSessionResult } from '../../services/stats-types'
import { medalProgress } from '../achievements/medal-progress'

/**
 * The derivations behind the round summary — what a finished round means
 * against the learner's own history, the level ladder, the plan and the
 * awards. Pure: everything comes in as arguments, so each figure the summary
 * shows can be tested without a store, a clock or a screen.
 */

/** Right answers out of all answers. */
export interface RoundScore {
  correct: number
  total: number
}

/**
 * The round's score as a whole percentage, rounded **down** — the same rule
 * as a personal best and the plan's bar, so the summary can never show "90 %"
 * beside a 90 % mark the round did not clear.
 *
 * @param score - Right answers out of all answers
 */
export function roundPercent(score: RoundScore): number {
  if (score.total <= 0) return 0
  const correct = Math.max(0, Math.min(score.correct, score.total))
  return Math.floor((correct / score.total) * 100)
}

/** One word for the round, from the top down. */
export type RoundVerdict = 'perfect' | 'excellent' | 'strong' | 'solid' | 'practice'

/**
 * The verdict word for a round, or null when the round was too short for its
 * accuracy to say anything (`minAnswersFor`) — three right answers are not
 * "Excellent".
 *
 * The steps follow the XP rules rather than taste: 85 % and 95 % are where the
 * accuracy bonus steps up (x1.25, x1.5), so "Strong" and "Excellent" are the
 * two words the reward already stands behind.
 *
 * @param score - The round's score
 * @param mode - The mode it was played in
 */
export function roundVerdict(score: RoundScore, mode: TrainingMode): RoundVerdict | null {
  if (score.total < minAnswersFor(mode)) return null
  const pct = roundPercent(score)
  if (pct >= 100) return 'perfect'
  if (pct >= 95) return 'excellent'
  if (pct >= 85) return 'strong'
  if (pct >= 70) return 'solid'
  return 'practice'
}

/** How the round stands against the learner's earlier rounds in this mode. */
export type BestComparison =
  /** No earlier round of this mode with enough answers to count. */
  | { kind: 'first' }
  /** This round was too short to be compared. `previous` is still shown. */
  | { kind: 'short'; previous: number | null }
  /** Beat the best by at least a whole point. */
  | { kind: 'new'; previous: number; gain: number }
  | { kind: 'equal'; previous: number }
  /** Below the best; `gap` in percentage points, at least 1. */
  | { kind: 'below'; previous: number; gap: number }

/**
 * Compare a round with the best earlier round of the same mode.
 *
 * Only rounds large enough to prove their accuracy count, on both sides —
 * the same rule as the personal-best XP (`personalBestXP`), so the summary and
 * the reward agree on what a best is.
 *
 * @param score - This round
 * @param mode - Its mode
 * @param earlier - Sessions recorded before this round (any mode; filtered here)
 */
export function compareWithBest(
  score: RoundScore,
  mode: TrainingMode,
  earlier: readonly TrainingSessionResult[],
): BestComparison {
  const proven = earlier.filter(s => s.mode === mode && provesAccuracy(s))
  const previous = proven.length > 0
    ? Math.max(...proven.map(s => roundPercent({ correct: s.correctAnswers, total: s.totalQuestions })))
    : null
  if (score.total < minAnswersFor(mode)) return { kind: 'short', previous }
  if (previous === null) return { kind: 'first' }
  const pct = roundPercent(score)
  if (pct > previous) return { kind: 'new', previous, gain: pct - previous }
  if (pct === previous) return { kind: 'equal', previous }
  return { kind: 'below', previous, gap: previous - pct }
}

/** Where the level bar starts and ends for one award. */
export interface XpFill {
  /** The level after the award. */
  level: LevelDefinition
  /** The level after that, or null at the top of the ladder. */
  next: LevelDefinition | null
  /** The bar before the award, 0–1 of the current level. 0 after a level-up. */
  from: number
  /** The bar after the award, 0–1. */
  to: number
  /** The award took the learner up one or more levels. */
  leveledUp: boolean
  /** XP still missing to the next level; 0 at the top. */
  toNext: number
}

function levelAt(xp: number): LevelDefinition {
  for (let i = LEVELS.length - 1; i >= 0; i--) if (xp >= LEVELS[i].xpRequired) return LEVELS[i]
  return LEVELS[0]
}

function share(xp: number, level: LevelDefinition, next: LevelDefinition | null): number {
  if (!next) return 1
  const span = next.xpRequired - level.xpRequired
  return span > 0 ? Math.max(0, Math.min(1, (xp - level.xpRequired) / span)) : 1
}

/**
 * The level bar for an award: where it stood before and where it stands now.
 *
 * After a level-up the bar of the new level starts empty — what was filled
 * of the old one belongs to a bar that is no longer on screen.
 *
 * @param totalXP - Total XP after the award
 * @param amount - What the award credited
 */
export function xpFill(totalXP: number, amount: number): XpFill {
  const total = Math.max(0, totalXP)
  const before = Math.max(0, total - Math.max(0, amount))
  const level = levelAt(total)
  const next = LEVELS.find(l => l.level === level.level + 1) ?? null
  const leveledUp = levelAt(before).level < level.level
  return {
    level,
    next,
    from: leveledUp ? 0 : share(before, level, next),
    to: share(total, level, next),
    leveledUp,
    toNext: next ? Math.max(0, next.xpRequired - total) : 0,
  }
}

/** The plan's stage, as far as this round moved it. */
export interface StageLine {
  stage: StageId
  /** Translation key of the stage title. */
  titleKey: string
  /** Sessions above the mark so far, capped at the target. */
  cleared: number
  target: number
  /** Different days with a good session, capped. */
  days: number
  targetDays: number
  /** The stage's accuracy mark as a whole percentage. */
  bar: number
  /** This round was above the mark (and long enough to count). */
  roundCleared: boolean
  /** The stage is finished. */
  done: boolean
}

/**
 * The stage line for a round, or null when the round is not work on the stage
 * the learner was on.
 *
 * The stage is the one that was current **before** the round: a round that
 * finishes a stage moves the plan on, and the summary is about the stage it
 * finished, not the next one. A round that the stage does not count (a basic
 * strategy round while the plan asks for deviations) gets no line rather than
 * a progress figure it did not move.
 *
 * The counting itself is the plan's own (`deriveStageProgress`), so the two
 * screens cannot disagree.
 *
 * @param stage - The stage that was current before the round, or null
 * @param session - The round as recorded
 * @param sessions - Every recorded session, this round included
 * @param readStages - Stages marked as read
 * @param isPro - Whether Pro is unlocked
 * @param claimed - Stages already paid
 */
export function stageLine(
  stage: StageId | null,
  session: TrainingSessionResult | null,
  sessions: readonly TrainingSessionResult[],
  readStages: readonly StageId[],
  isPro: boolean,
  claimed: readonly StageId[] = [],
): StageLine | null {
  if (!stage || !session) return null
  const def = CURRICULUM[stageIndex(stage)]
  if (!def?.drill || !def.drill.counts(session)) return null
  const p = deriveStageProgress(def, sessions, readStages, isPro, claimed)
  return {
    stage,
    titleKey: def.titleKey,
    cleared: p.current,
    target: p.target,
    days: p.days,
    targetDays: p.targetDays,
    bar: p.bar,
    roundCleared: provesAccuracy(session) && session.accuracy >= def.drill.minAccuracy,
    done: p.done,
  }
}

/** One award with how far along it is, before and after the round. */
export interface AwardProgress {
  achievement: Achievement
  /** Progress now, 0–100. */
  percent: number
  /** Progress before the round, 0–100. */
  before: number
  /** Unlocked already (now). */
  unlocked: boolean
}

/** The award the summary points at next. */
export interface NearestAward {
  achievement: Achievement
  percent: number
  /** How many of the award's own units are done ("260" of 1,000 questions). */
  current: number
  /** How many it asks for. */
  target: number
  /** Units this round added, 0 when it did not move. */
  gain: number
}

/**
 * Awards whose progress is a count of something — sessions, questions,
 * hours, days — so "260 of 1,000" and "+10 this round" are true statements.
 *
 * Accuracy awards are left out on purpose. Their engine figure is the best
 * accuracy over the bar ("85 % of the way to 95 %"), and after a first round
 * at 70 % that reads "+73 this round" for an award the round did not come
 * near: a number that moves without meaning anything.
 */
const COUNTED: ReadonlySet<AchievementRequirementType> = new Set<AchievementRequirementType>([
  'sessions', 'hands', 'time', 'total_hands', 'total_hours', 'perfect_sessions', 'session_streak',
  'mode_complete', 'daily_completed', 'weekly_completed', 'daily_streak', 'streak', 'session_duration',
  'modes_in_day', 'reach_level',
])

/**
 * The locked award closest to unlocking that this mode can move.
 *
 * Candidates are this mode's awards and the general ones (no mode of their
 * own); another mode's award is not something this round worked towards.
 * All-or-nothing awards are left out — `medalProgress` says which — because
 * "0 %" on them is not a measurement, and so are accuracy awards (see
 * `COUNTED`). Ranked by: moved this round, then belongs to this mode, then
 * closest.
 *
 * @param awards - Every award with its progress before and after
 * @param mode - The mode the round was played in
 */
export function nearestAward(awards: readonly AwardProgress[], mode: TrainingMode): NearestAward | null {
  const units = (a: Achievement, pct: number) => Math.round((pct / 100) * a.requirement.value)
  const ranked = awards
    .filter(a => !a.unlocked && COUNTED.has(a.achievement.requirement.type))
    .filter(a => a.achievement.requirement.mode === undefined || a.achievement.requirement.mode === mode)
    .map(a => ({ a, p: medalProgress(a.achievement, a.percent) }))
    .filter((x): x is { a: AwardProgress; p: number } => x.p !== null && x.p > 0 && x.p < 100)
    .map(({ a, p }) => {
      const current = Math.min(units(a.achievement, p), a.achievement.requirement.value - 1)
      return {
        achievement: a.achievement,
        percent: Math.floor(p),
        current,
        target: a.achievement.requirement.value,
        gain: Math.max(0, current - units(a.achievement, a.before)),
        own: a.achievement.requirement.mode === mode,
      }
    })
    .sort((x, y) =>
      Number(y.gain > 0) - Number(x.gain > 0)
      || Number(y.own) - Number(x.own)
      || y.percent - x.percent)
  const top = ranked[0]
  return top
    ? { achievement: top.achievement, percent: top.percent, current: top.current, target: top.target, gain: top.gain }
    : null
}

/**
 * The session a round was recorded as: the one of this mode that was not in
 * the list before the round ended. Null when the round was too short to be
 * recorded.
 *
 * @param sessions - The recorded sessions now
 * @param before - Ids of the sessions recorded before the round ended
 * @param mode - The round's mode
 */
export function recordedRound(
  sessions: readonly TrainingSessionResult[],
  before: ReadonlySet<string>,
  mode: TrainingMode,
): TrainingSessionResult | null {
  return sessions.find(s => s.mode === mode && !before.has(s.id)) ?? null
}
