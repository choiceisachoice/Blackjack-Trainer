import type { StrategyAction } from '../../engine/strategy/types'
import { ILLUSTRIOUS_18 } from '../../engine/counting/deviations'

/**
 * The strategy chart's vocabulary, as a pure module.
 *
 * These lived inside `StrategyChart.tsx`, which also pulls in three stores and
 * the paywall. The landing page now shows an excerpt of the real chart, and it
 * needs the colours, the ink, the column order and the deviation map — not the
 * component. Moving them here lets the landing render the genuine article
 * without dragging the app's state layer into its chunk, and gives the
 * vocabulary a test of its own.
 */

/** Display action codes shown in chart cells. */
export type ChartAction = 'H' | 'S' | 'D' | 'SP' | 'SU'

/** Background colours for each chart action. */
export const ACTION_COLORS: Record<ChartAction, string> = {
  H: '#22c55e',
  S: '#eab308',
  D: '#3b82f6',
  SP: '#ef4444',
  SU: '#a855f7',
}

/**
 * The ink written on those fills.
 *
 * All five are saturated mid-tones, and white on a saturated mid-tone is the
 * classic near-miss: measured in the browser, white on #eab308 is **1.92:1**
 * and on #22c55e **2.28:1**, on the table people consult most. Dark ink clears
 * AA on every one of the five unchanged fills (H 8.37, S 9.94, D 5.18,
 * SP 5.07, SU 4.82). Not a theme token: these fills are the same everywhere,
 * so their ink must be too.
 */
export const ACTION_INK = '#10100c'

/** Dealer upcard columns in display order. */
export const DEALER_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'] as const

/** One dealer upcard column. */
export type DealerKey = (typeof DEALER_KEYS)[number]

/** Resolve a conditional StrategyAction to a simple ChartAction for display. */
export function resolveAction(action: StrategyAction): ChartAction {
  switch (action) {
    case 'H': return 'H'
    case 'S': return 'S'
    case 'D': return 'D'
    case 'Ds': return 'D'
    case 'P': return 'SP'
    case 'Rh': return 'SU'
    case 'Rs': return 'SU'
  }
}

/** A count-based deviation attached to a chart cell. */
export interface DevInfo {
  /** 1-based number in the Illustrious 18 list. */
  index: number
  /** True-count threshold at/above which `above` applies. */
  threshold: number
  /** Action at/above the threshold. */
  above: string
  /** Action below the threshold. */
  below: string
}

/**
 * Map of `playerHand|dealerUpcard` → deviation, derived from the engine's
 * Illustrious 18. Insurance (playerHand '*') is a side bet, not a chart cell.
 */
export const DEVIATION_CELLS: Record<string, DevInfo> = {}
ILLUSTRIOUS_18.forEach((d, i) => {
  if (d.playerHand === '*') return
  DEVIATION_CELLS[`${d.playerHand}|${d.dealerUpcard}`] = {
    index: i + 1,
    threshold: d.trueCountThreshold,
    above: d.actionAbove,
    below: d.actionBelow,
  }
})

/**
 * The translation key for an engine action name as the chart labels it.
 *
 * The deviation list carries the engine's `Action` values — `'Stand'`,
 * `'Hit'` — and both the chart's detail panel and the landing tile used to
 * print them verbatim, which put an English word inside every other language's
 * sentence ("Ab True Count 0 → Stand"). The chart already has translated
 * labels for its five cell codes; this maps the engine's name onto them.
 * Returns the name itself for anything without a cell code, so an unexpected
 * value shows as text rather than as a missing key.
 */
export function actionLabelKey(action: string): string {
  switch (action) {
    case 'Hit': return 'chart.action.H'
    case 'Stand': return 'chart.action.S'
    case 'Double': return 'chart.action.D'
    case 'Split': return 'chart.action.SP'
    case 'Surrender': return 'chart.action.SU'
    default: return action
  }
}

/** Format a true count with an explicit sign (e.g. "+2", "0", "−1"). */
export function formatTC(tc: number): string {
  if (tc > 0) return `+${tc}`
  if (tc < 0) return `−${Math.abs(tc)}`
  return '0'
}
