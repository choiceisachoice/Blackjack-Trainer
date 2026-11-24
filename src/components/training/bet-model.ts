import { activeLocale } from '../../i18n'
import { BET_SPREAD, getMultiplier } from './bet-spread-math'

/**
 * The Bet Spread drill's pieces that are not drawn: what a question holds,
 * the chips the bet is built from, and the formats its numbers are written in.
 */

/** A: running count and decks given; B: the true count given; C: work out the true count, then bet. */
export type BetQuestionType = 'A' | 'B' | 'C'

/** One question of the drill. */
export interface BetQuestion {
  type: BetQuestionType
  /** The table minimum: one unit. */
  tableMin: number
  /** Running count (types A and C). */
  rc: number
  /** Decks left in the shoe, as the question states it (types A and C). */
  remainingDecks: number
  /**
   * Decks the shoe on the felt is drawn with. The question's own figure for
   * A and C; for B, where the true count is given, any level — the drawing
   * then says nothing the question does not.
   */
  shoeDecks: number
  /** The true count. */
  tc: number
  /** The right bet in dollars. */
  correctBet: number
}

/** One answered question, for the panel's list and the round's trail. */
export interface BetAnswer {
  question: BetQuestion
  /** The bet placed, in dollars. */
  bet: number
  /** The true count entered (type C only). */
  tcAnswer: number | null
  correct: boolean
}

/**
 * The chips in the rack: the casino's own denominations, in their colours
 * (red 5, green 25, black 100, purple 500, gold 1,000) — the same ones a
 * stack on the table is cut into, so what is placed is what is drawn.
 *
 * Every bet the drill asks for (1–16 units of a $5–$100 table) can be built
 * from these in at most six chips.
 */
export const BET_CHIPS = [5, 25, 100, 500, 1000] as const

/**
 * The most the felt takes: $5,000, a high-limit table's maximum, at every
 * table. Far above every right answer ($1,600 at most) and the same for every
 * table, so a chip that greys out never hints at one; it only keeps a held
 * key from building a bet nobody could read.
 */
export const BET_CAP = 5000

/**
 * The chip a key places: 1 for the smallest chip up to 5 for the largest.
 *
 * @returns The chip's value, or null for any other key
 */
export function chipForKey(key: string): number | null {
  const i = ['1', '2', '3', '4', '5'].indexOf(key)
  return i < 0 ? null : BET_CHIPS[i]
}

/**
 * Which step of the ramp a bet is, at a table minimum: 0 for one unit up to 4
 * for sixteen; -1 for a bet that is no step of the ramp ($35 at a $25 table).
 */
export function rampStepOfBet(bet: number, tableMin: number): number {
  return BET_SPREAD.findIndex(step => step.multiplier * tableMin === bet)
}

/** The ramp step a true count falls on (fractions floored, as the drill grades). */
export function rampStepOfTc(tc: number): number {
  const units = getMultiplier(tc)
  return BET_SPREAD.findIndex(step => step.multiplier === units)
}

/** The reason line of an answer, as a message key and its values. */
export interface BetReason {
  key: 'training.bet.reason' | 'training.bet.reasonPlain'
  values: { tc: string; step: string; count: number; min: string; bet: string }
}

/**
 * Why a bet is right, in one line: the true count, the step of the ramp it
 * falls on, the units of that step times the minimum.
 *
 * "TC +3.5 → TC +3: 4 units × $50 = $200" — the step is named when it says
 * something the count does not (a fraction floored, a count folded into
 * "≤ +1" or "≥ +5"); for "TC +3" on the step "TC +3" it is left out.
 */
export function betReason(q: Pick<BetQuestion, 'tc' | 'tableMin' | 'correctBet'>): BetReason {
  const step = BET_SPREAD[rampStepOfTc(q.tc)]
  const tc = `TC ${signed(q.tc)}`
  const same = step.minTC === step.maxTC && step.minTC === q.tc
  return {
    key: same ? 'training.bet.reasonPlain' : 'training.bet.reason',
    values: { tc, step: step.label, count: step.multiplier, min: money(q.tableMin), bet: money(q.correctBet) },
  }
}

/**
 * A number the way the reader's language writes it: "1.5" and "1,600" in
 * English, "1,5" and "1.600" in German.
 */
export function num(n: number): string {
  return n.toLocaleString(activeLocale(), { maximumFractionDigits: 2 })
}

/** A dollar amount: the sign, then the number in the reader's format. */
export function money(n: number): string {
  return `$${num(n)}`
}

/**
 * A count with its sign: "+3", "+0", "-1".
 *
 * An ASCII minus on purpose: the demo scripts and the tests read this text
 * back as a number.
 */
export function signed(n: number): string {
  return n >= 0 ? `+${num(n)}` : num(n)
}
