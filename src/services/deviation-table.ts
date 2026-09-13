import { ILLUSTRIOUS_18, FAB_4 } from '../engine/counting/deviations'
import type { Deviation } from '../engine/counting/types'

/**
 * One line of a deviation table, as the Learn page prints it.
 *
 * Derived from the engine's own list rather than written out again: the
 * table on the public page and the grading at the casino table must never
 * disagree about an index, and the only way to guarantee that is one source.
 */
export interface DeviationRow {
  /** Player hand key as the engine writes it — `16`, `10,10`, `A,7` — or `*` for any hand. */
  hand: string
  /** Whether the row applies to any hand (insurance). */
  anyHand: boolean
  /** Dealer upcard key, `2`–`10` or `A`. */
  dealer: string
  /** True count at or above which `above` applies. */
  index: number
  /** Engine action name at or above the index, e.g. `Stand`. */
  above: string
  /** Engine action name below the index. */
  below: string
}

/**
 * Turn a deviation list into table rows, in the engine's order — which for
 * the Illustrious 18 is by value, insurance first.
 *
 * @param list - The engine's deviations
 */
export function deviationRows(list: readonly Deviation[]): DeviationRow[] {
  return list.map(d => ({
    hand: d.playerHand,
    anyHand: d.playerHand === '*',
    dealer: d.dealerUpcard,
    index: d.trueCountThreshold,
    above: d.actionAbove,
    below: d.actionBelow,
  }))
}

/** The Illustrious 18, as rows. */
export const ILLUSTRIOUS_18_ROWS: readonly DeviationRow[] = deviationRows(ILLUSTRIOUS_18)

/** The Fab 4, as rows. */
export const FAB_4_ROWS: readonly DeviationRow[] = deviationRows(FAB_4)
