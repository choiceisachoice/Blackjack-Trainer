import type { TrainingMode } from '../stats-types'
import type { AppMode } from '../../store/app-store'
import { CURRICULUM, stageIndex, type StageId } from '../curriculum'
import { isProMode } from '../pro-features'

/**
 * Picks challenges that fit the learner instead of the calendar.
 *
 * The challenge pools were selected by `djb2(date) % poolSize` alone, which
 * knows nothing about who is playing. Two consequences, both real:
 *
 *  - 6 of the 24 daily challenges and every mode-bound weekly challenge require
 *    a Pro-gated screen, so a free account drew a challenge it could not even
 *    open roughly one day in four.
 *  - A learner on their first week could be asked to hit a bet-spread target,
 *    a skill four stages ahead of anything they have been taught.
 *
 * Filtering the pool *before* the date hash keeps the useful property — one
 * challenge per day, the same for everyone on that day and stable across
 * reloads — while making it something the learner can actually act on. That is
 * what ties the daily challenge to the training plan: doing today's challenge
 * moves the current stage forward rather than pulling in a random direction.
 */

/** A challenge, seen only through the part that matters for selection. */
export interface ModeBound {
  requiredMode?: TrainingMode
}

/** Where the learner is, as far as challenge selection is concerned. */
export interface LearnerContext {
  /** Current curriculum stage, or null if the placement test is untaken. */
  stage: StageId | null
  isPro: boolean
  /**
   * Sessions per week the learner said they had time for. Omitted when they
   * have not answered, in which case no pace filtering happens at all.
   */
  sessionsPerWeek?: number
}

/**
 * Whether a challenge is achievable at the learner's stated pace.
 *
 * Only applied to challenges counted in *sessions*, because that is the one
 * unit the pace answer is expressed in. Targets measured in hands, minutes,
 * accuracy or streaks are left alone rather than converted through invented
 * exchange rates.
 *
 * "Play 5 sessions today" is not a challenge for someone who told us they have
 * twenty minutes a week — it is a guaranteed failure dressed as a goal.
 */
export function isPaceable(
  challenge: ModeBound & { type?: string; target?: number },
  ctx: LearnerContext,
  period: 'day' | 'week',
): boolean {
  if (ctx.sessionsPerWeek == null) return true
  if (challenge.type !== 'play_sessions' || challenge.target == null) return true

  const allowance = period === 'week'
    ? ctx.sessionsPerWeek
    // A day's share, rounded up, plus one so a good day is still rewarded.
    : Math.ceil(ctx.sessionsPerWeek / 7) + 1

  return challenge.target <= allowance
}

/**
 * Training modes and app screens name the same things differently
 * (`deviationFlashCards` is recorded for the `deviationTraining` screen), so
 * the two have to be reconciled before a stage can be looked up.
 */
const MODE_SCREEN: Partial<Record<TrainingMode, AppMode>> = {
  speedDrill: 'speedDrill',
  deviationFlashCards: 'deviationTraining',
  deviationAtTable: 'deviationTraining',
  tableCounting: 'speedDrill',
  betSpread: 'betSpread',
  deckEstimation: 'deckEstimation',
  casinoSession: 'casinoSession',
}

/**
 * Which stage owns which mode.
 *
 * Stated rather than derived, because the relation genuinely is not a function
 * of the screen: basic strategy and deviations are both drilled on the
 * Flashcards screen, and only the questions inside a session tell them apart.
 * `stagesAgreeWithScreens` guards this table against drifting from the
 * curriculum.
 */
const MODE_STAGE: Partial<Record<TrainingMode, StageId>> = {
  speedDrill: 'hi-lo',
  tableCounting: 'hi-lo',
  deviationFlashCards: 'basic-strategy',
  deviationAtTable: 'deviations',
  betSpread: 'bet-spread',
  deckEstimation: 'true-count',
  casinoSession: 'table',
}

/** The curriculum stage that teaches a training mode, or null if none does. */
export function stageForMode(mode: TrainingMode): StageId | null {
  return MODE_STAGE[mode] ?? null
}

/** The screen a training mode is practised on, or null if it has none. */
export function screenForMode(mode: TrainingMode): AppMode | null {
  return MODE_SCREEN[mode] ?? null
}

/**
 * Every mapped mode must sit on the screen its stage actually drills.
 *
 * Exported so a test can assert it: the mapping above is hand-written, and a
 * curriculum change that moved a drill to another screen would otherwise
 * silently start selecting the wrong challenges.
 */
export function stagesAgreeWithScreens(): boolean {
  return Object.entries(MODE_STAGE).every(([mode, stageId]) => {
    const stage = CURRICULUM.find(s => s.id === stageId)
    return stage?.drill?.mode === MODE_SCREEN[mode as TrainingMode]
  })
}

/** Whether the learner could open the screen this challenge needs. */
export function isReachable(challenge: ModeBound, ctx: LearnerContext): boolean {
  if (!challenge.requiredMode) return true

  const screen = MODE_SCREEN[challenge.requiredMode]
  if (screen && isProMode(screen) && !ctx.isPro) return false

  // Unplaced learners get everything that isn't locked — no plan, no opinion.
  if (!ctx.stage) return true

  const owner = stageForMode(challenge.requiredMode)
  if (!owner) return true
  // Anything at or below where they are is fair game; further ahead is not.
  return stageIndex(owner) <= stageIndex(ctx.stage)
}

/**
 * Narrow a pool to what this learner can act on.
 *
 * Falls back deliberately rather than returning nothing: first to challenges
 * with no mode requirement at all, then to the untouched pool. A learner must
 * always have a challenge, even if the only honest one is generic.
 */
export function eligibleChallenges<T extends ModeBound>(
  pool: readonly T[],
  ctx: LearnerContext,
  period: 'day' | 'week' = 'day',
): T[] {
  const fitting = pool.filter(c => isReachable(c, ctx) && isPaceable(c, ctx, period))
  if (fitting.length > 0) return fitting

  // Reachability matters more than pace: an over-ambitious challenge is
  // discouraging, but an unopenable one is impossible.
  const reachable = pool.filter(c => isReachable(c, ctx))
  if (reachable.length > 0) return reachable

  const generic = pool.filter(c => !c.requiredMode)
  return generic.length > 0 ? generic : [...pool]
}

/**
 * djb2 hash of a key string → bounded index.
 *
 * Deterministic: the same key and pool size always give the same index, which
 * is what makes "today's challenge" stable across reloads and devices.
 */
export function hashToIndex(key: string, poolSize: number): number {
  if (poolSize <= 0) return 0
  let hash = 5381
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0
  }
  return ((hash % poolSize) + poolSize) % poolSize
}

/**
 * Pick one challenge for a period: filter to what fits, then hash the date.
 *
 * The order matters. Hashing first and filtering after would either skip days
 * or bias the result toward whatever sits next in the array; filtering first
 * keeps every eligible challenge equally likely.
 */
export function selectChallenge<T extends ModeBound>(
  pool: readonly T[],
  periodKey: string,
  ctx: LearnerContext,
  period: 'day' | 'week' = 'day',
): T {
  const eligible = eligibleChallenges(pool, ctx, period)
  return eligible[hashToIndex(periodKey, eligible.length)]
}
