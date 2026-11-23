import { Action } from '../../engine/rules/types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'
import type { StrategyAction } from '../../engine/strategy/types'
import { S17_STRATEGY, H17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'
import { DEALER_KEYS, resolveAction, type ChartAction } from '../strategy-chart/chart-primitives'
import type { KeyedText } from './flash-scene'

/**
 * What a flashcard teaches after the answer: the row of the strategy chart the
 * hand lives on, and one sentence of why.
 *
 * "Basic Strategy: Stand." was the whole explanation — the answer again, in a
 * sentence. A learner who got 16 v 7 wrong learnt that it was wrong and
 * nothing about the next 16. The chart row shows the pattern the cell belongs
 * to (stand against 2–6, hit against 7–A) and the reason names it.
 */

/** One row of the strategy chart, cut out for a question. */
export interface ChartRowExcerpt {
  /** The row as the chart labels it: "15", "A,7", "8,8". */
  hand: string
  /** The ten cells, in the chart's column order (2 … 10, A). */
  cells: ChartAction[]
  /** Which of them is the question's: the dealer's column. */
  column: number
  /**
   * True when the question is set at a table without surrender: the row is
   * then shown with each surrender cell's fallback, as the chart's own detail
   * panel says ("Without late surrender").
   */
  noSurrender: boolean
}

/** Without late surrender a surrender cell falls back to its second choice. */
function withoutSurrender(a: StrategyAction): ChartAction {
  if (a === 'Rh') return 'H'
  if (a === 'Rs') return 'S'
  if (a === 'Rp') return 'SP'
  return resolveAction(a)
}

/**
 * The chart row of a question, or null for the insurance question (insurance
 * is a side bet, not a chart cell).
 *
 * @param q - The question
 * @param dealerHitsSoft17 - Which chart: H17 when true, S17 otherwise — the
 *   same one the question was set from
 */
export function chartRowFor(q: FlashQuestion, dealerHitsSoft17: boolean): ChartRowExcerpt | null {
  if (q.hand === '*') return null
  const table = dealerHitsSoft17 ? H17_STRATEGY : S17_STRATEGY
  const sub = q.handKind === 'pair' ? table.pairs : q.handKind === 'soft' ? table.softTotals : table.hardTotals
  const row = sub[q.hand]
  if (!row) return null
  const column = DEALER_KEYS.indexOf(q.dealer as (typeof DEALER_KEYS)[number])
  if (column < 0) return null
  return {
    hand: q.hand,
    cells: DEALER_KEYS.map(d => (q.noSurrender ? withoutSurrender(row[d]) : resolveAction(row[d]))),
    column,
    noSurrender: q.noSurrender,
  }
}

/** The count rule behind a deviation question. */
export interface DeviationRule {
  /** True count from which `above` is played. */
  threshold: number
  /** The play at or above the threshold. */
  above: Action
  /** The play below it. */
  below: Action
}

/**
 * The index of a deviation question: from which true count the play changes.
 * Null for a basic-strategy question.
 */
export function deviationRuleFor(q: FlashQuestion): DeviationRule | null {
  if (!q.isDeviation || !q.deviationName) return null
  const dev = [...ILLUSTRIOUS_18, ...FAB_4].find(d => d.name === q.deviationName)
  if (!dev) return null
  return { threshold: dev.trueCountThreshold, above: dev.actionAbove, below: dev.actionBelow }
}

const why = (name: string, values?: Record<string, string | number>): KeyedText =>
  ({ key: `training.flash.why.${name}`, values })

/**
 * One sentence of why, for a basic-strategy question.
 *
 * Picked from the hand and the right play, so the sentence can never argue
 * for a different play than the one marked right. Each sentence names the
 * pattern rather than the cell — "the dealer's card is weak (2 to 6)" — since
 * the pattern is what carries over to the next hand. Every cell of both
 * charts is checked against its sentence in the tests.
 *
 * @param q - A basic-strategy question
 */
export function basicReason(q: FlashQuestion): KeyedText {
  const play = q.correctAction
  if (play === Action.Surrender) return why('surrender')

  if (q.handKind === 'pair') {
    const rank = q.hand.split(',')[0]
    const value = rank === 'A' ? 11 : Number(rank)
    if (play === Action.Split) return rank === 'A' || rank === '8' ? why('splitAlways') : why('split', { rank, n: value * 2 })
    if (rank === '10') return why('tensStand')
    if (rank === '5') return why('fivesAsTen')
    return why('pairAsTotal', { n: value * 2 })
  }

  if (q.handKind === 'soft') {
    const n = 11 + Number(q.hand.split(',')[1])
    if (play === Action.Double) return why('softDouble')
    if (play === Action.Stand) return why('softStand', { n })
    return n === 18 ? why('soft18Hit') : why('softHit', { n })
  }

  const n = Number(q.hand)
  if (n >= 17) return why('hardStand', { n })
  if (n <= 11) return play === Action.Double ? why('hardDouble', { n }) : why('hardHit', { n })
  if (play === Action.Stand) return why('stiffStand')
  if (n === 12 && (q.dealer === '2' || q.dealer === '3')) return why('twelveHit')
  return why('stiffHit', { n })
}
