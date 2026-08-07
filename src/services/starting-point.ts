import { CURRICULUM, stageIndex, type StageId } from './curriculum'

/**
 * The one question the app asks before it opens: where are you starting from?
 *
 * ## What this replaced, and why
 *
 * There used to be six questions and an adaptive card test in front of the app —
 * goal, weekly time budget, casino experience, mental arithmetic, how you found
 * us, the experience ladder, then up to four real hands to verify the claim.
 * It was accurate. It was also a five-minute exam standing between someone and
 * a product they had not seen yet, and the two answers it needed most (goal and
 * pace) are editable inside the plan anyway — so they were being asked twice.
 *
 * One question survives. It is the only one whose answer nothing else can
 * supply: everything else the app can observe from what you actually do, and
 * the Learn page is right there for whatever the answer gets wrong.
 *
 * ## Why self-report is now trusted
 *
 * The old probe existed because people misjudge themselves and being placed too
 * far ahead is the failure that makes someone quit. That risk is real but it is
 * cheap here: the placement only decides where the plan *starts*, every earlier
 * stage stays open, and a learner who picked too high meets a drill they cannot
 * do within one session. An exam that prevents a two-minute correction is a bad
 * trade.
 */

export interface EntryOption {
  /** A capability, never a feeling — "intermediate" means nothing and cannot be checked. */
  label: string
  /** Sub-line: what this claim actually means, so people pick honestly. */
  hint: string
  value: string
  /**
   * The first stage this learner still has to work through — their placement.
   *
   * Note this is the stage *after* what they claim: someone who knows the rules
   * starts at basic strategy, not at the rules they already have. The last
   * option is the exception and stays on the final stage, because there is
   * nothing beyond it.
   */
  stage: StageId
}

/**
 * One rung per stage of the curriculum, so every answer leads somewhere
 * different. An earlier version had two options that both resolved to the same
 * placement — the two a beginner is most likely to pick were indistinguishable.
 */
export const ENTRY_OPTIONS: EntryOption[] = [
  {
    label: 'I’ve never played blackjack',
    hint: 'We’ll start at the very beginning — the game itself, before any counting.',
    value: 'new',
    stage: 'rules',
  },
  {
    label: 'I know how the game works',
    hint: 'Hit, stand, bust and the dealer’s rules are familiar.',
    value: 'rules',
    stage: 'basic-strategy',
  },
  {
    label: 'I know the right move for most hands',
    hint: 'When to hit, stand, double or split — without having to think.',
    value: 'strategy',
    stage: 'hi-lo',
  },
  {
    label: 'I can keep track of the cards as they come out',
    hint: 'Holding a running count through a whole shoe.',
    value: 'counting',
    stage: 'true-count',
  },
  {
    label: 'I adjust that count for how many cards are left',
    hint: 'Turning the running count into a true count.',
    value: 'truecount',
    stage: 'deviations',
  },
  {
    label: 'I change how I play when the count is high',
    hint: 'Overriding the strategy chart — the Illustrious 18.',
    value: 'deviations',
    stage: 'bet-spread',
  },
  {
    label: 'I’ve done all of this for money at a real table',
    hint: 'Spreading bets under pressure is familiar territory.',
    value: 'table',
    stage: 'table',
  },
]

/** The first option, used wherever an unanswered learner needs a floor. */
export const DEFAULT_ENTRY: EntryOption = ENTRY_OPTIONS[0]

/**
 * The stage a level answer places someone at.
 *
 * Falls back to the very beginning rather than throwing: a stored value from an
 * older build should drop someone to the start of the path, not break the plan.
 */
export function stageForLevel(value: string): StageId {
  return ENTRY_OPTIONS.find(o => o.value === value)?.stage ?? DEFAULT_ENTRY.stage
}

/** Position on the ladder, 0-based. `-1` for an unknown value. */
export function levelIndex(value: string): number {
  return ENTRY_OPTIONS.findIndex(o => o.value === value)
}

/**
 * The level answer that corresponds to a placement stage — the inverse of
 * `stageForLevel`.
 *
 * Needed because the placement is what gets persisted; the level answer itself
 * is only a means of picking it. Recovering the level from the stage lets the
 * recommendation survive a reload without storing the same fact twice.
 */
export function levelForStage(stage: StageId): EntryOption {
  return ENTRY_OPTIONS.find(o => o.stage === stage) ?? DEFAULT_ENTRY
}

/**
 * Whether this learner has never played at all.
 *
 * Singled out because it is the only answer where the honest first move is
 * reading rather than drilling — every other level has a drill that fits.
 */
export function isCompleteBeginner(value: string): boolean {
  return value === DEFAULT_ENTRY.value
}

/** How many stages of the curriculum this answer skips past. */
export function stagesSkipped(value: string): number {
  return stageIndex(stageForLevel(value))
}

/** Total stages on the path, for "stage 3 of 7"-style copy. */
export const TOTAL_STAGES = CURRICULUM.length
