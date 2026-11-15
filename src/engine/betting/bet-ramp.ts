/**
 * The bet ramp — one of them.
 *
 * There were three. The Learn chapter and the FAQ taught, in every language:
 * one unit at a true count of +1 or below, two at +2, four at +3, eight at
 * +4, up to sixteen from +5. The Bet Spread drill and the casino table graded
 * against another: two units already at +1, then four, eight, twelve, sixteen
 * — each with its own copy of the table. And the drill's tip gave a third,
 * (true count − 1) × unit. A learner who followed the chapter was marked wrong
 * at every count from +1 to +4 by the mode the chapter sends them to.
 *
 * The taught ramp is the one that stands (decided 15 Nov 2026), because it is
 * the one the theory supports: each point of true count is worth about half a
 * percent, the house starts about half a percent ahead, so at +1 the game is
 * roughly even. A bet raised there adds variance and no expectation; the
 * ramp starts where the edge does, at +2, and doubles with each point.
 *
 * Pure data and two pure functions, in the engine: the drill and the table
 * both read it from here, so they cannot drift apart again.
 */

/** One step of the ramp: the integer true counts it covers and the units to bet. */
export interface BetRampStep {
  /** Lowest true count of the step (`-Infinity` for the bottom one). */
  readonly minTC: number
  /** Highest true count of the step (`Infinity` for the top one). */
  readonly maxTC: number
  /** Bet, in units of the table minimum. */
  readonly units: number
  /** How the step is written in the reference ladder. */
  readonly label: string
}

/** The ramp for six-deck Hi-Lo: a 1–16 spread, doubling from +2. */
export const BET_RAMP: readonly BetRampStep[] = [
  { minTC: -Infinity, maxTC: 1, units: 1, label: 'TC ≤ +1' },
  { minTC: 2, maxTC: 2, units: 2, label: 'TC +2' },
  { minTC: 3, maxTC: 3, units: 4, label: 'TC +3' },
  { minTC: 4, maxTC: 4, units: 8, label: 'TC +4' },
  { minTC: 5, maxTC: Infinity, units: 16, label: 'TC ≥ +5' },
]

/**
 * The index of the step a true count falls on.
 *
 * A fractional count is floored first: the edge at +1.5 is the edge of a count
 * that has not yet reached +2, and a bettor who rounds up is betting on cards
 * that are not out.
 *
 * @param trueCount - The true count, whole or fractional
 */
export function rampStepIndex(trueCount: number): number {
  const tc = Math.floor(trueCount)
  const i = BET_RAMP.findIndex(step => tc >= step.minTC && tc <= step.maxTC)
  return i < 0 ? 0 : i
}

/**
 * How many units the ramp bets at a true count.
 *
 * @param trueCount - The true count, whole or fractional
 * @returns Units of the table minimum, from 1 to 16
 */
export function rampUnits(trueCount: number): number {
  return BET_RAMP[rampStepIndex(trueCount)].units
}
