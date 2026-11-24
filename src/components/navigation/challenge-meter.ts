import type { ChallengeType, WeeklyChallengeType } from '../../services/challenges/challenge-types'

/** How a challenge's progress is drawn. */
export interface ChallengeMeter {
  /**
   * `pips` — one slot per unit, for small counts ("5 in a row" is five
   * slots to fill, not a 0% bar). `bar` — everything else.
   */
  kind: 'pips' | 'bar'
  /** 0–100, for the bar. */
  percent: number
  /** Slots filled, for pips. */
  filled: number
  /** Slots in all, for pips. */
  steps: number
  /**
   * Units still missing, or null where "missing" is not a count — a best time,
   * an accuracy, a profit. Zero once complete.
   */
  remaining: number | null
}

/** Above this many units a row of slots becomes a smear; it is a bar then. */
export const MAX_PIPS = 10

/**
 * Types whose progress is a best value rather than a tally: the bar can show
 * how close it is, but "3 to go" would be a wrong sentence.
 */
const NOT_A_TALLY: ReadonlySet<ChallengeType | WeeklyChallengeType> = new Set([
  'speed_time',
  'achieve_accuracy',
  'earn_profit',
])

/**
 * Turn a challenge's raw progress into something worth drawing.
 *
 * The cards used to show a full-width 8px bar at 0 and "0 / 5" under it — an
 * empty strip that said nothing about what filling it takes. Small tallies
 * now get one slot per unit and every tally says how many are left.
 *
 * `speed_time` keeps its own rule: lower is better, so progress toward the
 * target is `target / best`, held under 100% until the challenge is actually
 * complete.
 */
export function challengeMeter({
  type,
  progress,
  target,
  completed,
}: {
  type: ChallengeType | WeeklyChallengeType
  progress: number
  target: number
  completed: boolean
}): ChallengeMeter {
  const safeTarget = Math.max(target, 1)

  if (type === 'speed_time') {
    const percent = completed ? 100 : progress > 0 ? Math.min(99, Math.round((target / progress) * 100)) : 0
    return { kind: 'bar', percent, filled: 0, steps: 0, remaining: null }
  }

  const done = completed ? safeTarget : Math.min(Math.max(progress, 0), safeTarget)
  const percent = Math.round((done / safeTarget) * 100)
  const remaining = NOT_A_TALLY.has(type) ? null : safeTarget - done

  if (!NOT_A_TALLY.has(type) && safeTarget <= MAX_PIPS) {
    return { kind: 'pips', percent, filled: done, steps: safeTarget, remaining }
  }
  return { kind: 'bar', percent, filled: 0, steps: 0, remaining }
}
