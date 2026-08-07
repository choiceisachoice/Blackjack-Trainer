import { CURRICULUM, stageIndex, type StageId } from './curriculum'
import { levelForStage, isCompleteBeginner } from './starting-point'
import type { AppMode } from '../store/app-store'

/**
 * The first move suggested on the home screen, chosen from the one answer the
 * learner gave.
 *
 * ## Why this exists
 *
 * Answering the starting-point question used to lead to a result screen that
 * explained the placement and then handed over a plan. That screen is gone, so
 * the "here is why you are here and what to do about it" job moved onto the
 * home screen where the learner actually lands — as one card they can act on or
 * dismiss, rather than a page they have to get past.
 *
 * ## Why it is derived rather than stored
 *
 * The recommendation is a pure function of the placement, and the placement is
 * already persisted. Storing the advice as well would be the same fact written
 * in two places, which is how the two end up disagreeing after a curriculum
 * change. Only two things are stored: which level was picked (for the wording)
 * and whether the card has been dealt with.
 */

// ── What to suggest ──────────────────────────────────────────────────

export type FirstMoveKind = 'read' | 'drill'

export interface FirstMove {
  kind: FirstMoveKind
  /** The screen this move opens. */
  mode: AppMode
  /** Button text — an action, not a noun. */
  action: string
  /** One line saying what they will do there. */
  detail: string
  /** The stage this move belongs to. */
  stage: StageId
}

/**
 * The move that fits a placement.
 *
 * Falls out of the curriculum rather than being a second opinion about it: the
 * first stage is reading with no drill attached, so a complete beginner is sent
 * to the Learn page because that is genuinely the only thing on their plan.
 * Every later stage has a drill, so those are sent to it. A stage that somehow
 * has neither falls back to reading, which is never wrong.
 */
export function firstMoveFor(stage: StageId): FirstMove {
  const s = CURRICULUM[stageIndex(stage)] ?? CURRICULUM[0]

  if (s.drill) {
    return {
      kind: 'drill',
      mode: s.drill.mode,
      action: 'Start training',
      detail: s.drill.description,
      stage: s.id,
    }
  }

  return {
    kind: 'read',
    mode: s.read?.mode ?? 'learn',
    action: 'Open the Learn page',
    detail: 'Read it through end to end — it is written for someone starting from nothing.',
    stage: s.id,
  }
}

/** The headline for the recommendation card, worded for the level that was picked. */
export function recommendationHeadline(stage: StageId): string {
  const level = levelForStage(stage)
  const s = CURRICULUM[stageIndex(stage)] ?? CURRICULUM[0]

  return isCompleteBeginner(level.value)
    ? 'Start by reading, not drilling'
    : `Start at ${s.title.charAt(0).toLowerCase()}${s.title.slice(1)}`
}

/**
 * Why this move, in the learner's terms.
 *
 * A recommendation nobody understands is a command, and a command in a product
 * someone chose to use is worse than no advice at all.
 */
export function recommendationReason(stage: StageId): string {
  const level = levelForStage(stage)
  const s = CURRICULUM[stageIndex(stage)] ?? CURRICULUM[0]
  const skipped = stageIndex(stage)

  if (isCompleteBeginner(level.value)) {
    return 'You said you have never played, so there is nothing to drill yet — the Learn page covers the game itself first, and the drills open up as you go.'
  }

  const ahead = skipped === 1
    ? 'The first stage is already behind you.'
    : `The first ${skipped} stages are already behind you.`

  return `${ahead} ${s.why}`
}

// ── Persistence ──────────────────────────────────────────────────────

const LEVEL_KEY = 'bjt_start_level'
const DISMISSED_KEY = 'bjt_recommendation_done'
const TOUR_KEY = 'bjt_tour_seen'

/** Remember the level that was picked, so the card can be worded for it. */
export function setRecommendation(level: string): void {
  try {
    localStorage.setItem(LEVEL_KEY, level)
    // A fresh answer re-opens the card. Someone who retakes the question is
    // asking to be pointed somewhere again.
    localStorage.removeItem(DISMISSED_KEY)
  } catch {
    /* storage unavailable — the card simply derives from the placement instead */
  }
}

/** The stored level answer, or null if the question was skipped or predates this. */
export function getStartLevel(): string | null {
  try {
    return localStorage.getItem(LEVEL_KEY)
  } catch {
    return null
  }
}

/** Whether the recommendation card has been acted on or dismissed. */
export function isRecommendationDone(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Put the card away.
 *
 * Called both when it is dismissed and when its action is taken — a suggestion
 * you have followed should not still be sitting there suggesting it.
 */
export function setRecommendationDone(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    /* storage unavailable — the card reappears next visit, which is harmless */
  }
}

/** Whether the guided tour has already run. */
export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember that the tour ran, so it never starts itself twice. */
export function setTourSeen(): void {
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    /* storage unavailable — the tour can be re-run from the card, no worse */
  }
}

/** Every key this module owns, so a local reset can clear them all. */
export const RECOMMENDATION_KEYS = [LEVEL_KEY, DISMISSED_KEY, TOUR_KEY] as const
