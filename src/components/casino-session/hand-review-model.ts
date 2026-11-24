import { isBlackjack } from '../../engine/rules/hand-utils'
import { Action, DEFAULT_RULES, type CasinoRules } from '../../engine/rules/types'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { CasinoSessionConfig, PlayDecision, PlayerHandRecord } from '../../engine/casino-session/types'
import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'
import { getOptimalAction } from '../../engine/strategy/basic-strategy'
import { DEALER_KEYS, type ChartAction } from '../strategy-chart/chart-primitives'
import type { ChartRowExcerpt } from '../training/flash-teach'
import type { KeyedText } from '../training/flash-scene'
import { chartHand, chartRank } from '../trial/trial-verdict'

/**
 * What the review after a hand at the casino table shows, worked out from the
 * hand's record — and nothing the record does not hold.
 *
 * The review used to be two 12px lines under the felt: "Bet: correct",
 * "Play: correct". This is the material for a real one: every decision of the
 * hand with the spot it was made on, the play made and the play that was
 * right (the chart's, or the index play the count called for and the rule
 * behind it), the bet against the count, the chart row of the hand as dealt,
 * and the verdict the session trail is drawn from. Pure, so all of it is
 * tested without a table.
 */

/** A spot as the strategy chart writes it: "16", "A,7", "8,8" against "2"–"10" or "A". */
export interface Spot {
  hand: string
  dealer: string
}

/** The index play that replaced the chart's play on a decision. */
export interface IndexPlay {
  /** Its name in the deviation tables: "16 vs 10". */
  name: string
  /** The chart's play there, which the count overrode. */
  basic: Action
  /** From which true count `above` is played, and `below` under it; null if the name is not in the tables. */
  rule: { threshold: number; above: Action; below: Action } | null
}

/** One graded decision of a hand. */
export type ReviewRow =
  | {
    kind: 'play'
    /** Which hand, from 1 — only when the round had more than one. */
    hand: number | null
    spot: Spot
    chosen: Action
    correct: Action
    isCorrect: boolean
    /** The true count it was graded at; null in basic play or for records without it. */
    trueCount: number | null
    index: IndexPlay | null
  }
  | {
    kind: 'insurance'
    took: boolean
    /** The right answer: take it or not. */
    take: boolean
    isCorrect: boolean
    /** The true count it was offered at; null in basic play. */
    trueCount: number | null
  }
  | {
    kind: 'count'
    rc: { you: number; actual: number; ok: boolean }
    tc: { you: number; actual: number; ok: boolean }
    isCorrect: boolean
  }

/** The bet against the count — only at a counting table. */
export interface BetReview {
  amount: number
  trueCount: number
  /** What the bet ramp asks for at that count. */
  right: number
  isCorrect: boolean
}

/** How a hand went: every graded item right, at least one wrong, or nothing graded at all. */
export type Verdict = 'right' | 'wrong' | 'none'

/** Everything the review of one hand shows. */
export interface HandReviewModel {
  handNumber: number
  rows: ReviewRow[]
  bet: BetReview | null
  verdict: Verdict
  /** Graded items that were wrong (each decision, the insurance answer, the count check, the bet). */
  mistakes: number
  /** Why no play came up: a blackjack, the dealer's, or something else. Null when one did. */
  nothing: 'blackjack' | 'dealerBlackjack' | 'other' | null
  /** The hand as dealt on this table's chart, the dealer's column marked. */
  chart: { spot: Spot; row: ChartRowExcerpt; deviation: boolean } | null
  /** More than one hand this round — a split, or several boxes. */
  severalHands: boolean
  /** A split was made. */
  split: boolean
  /** An index play was among the decisions. */
  deviation: boolean
}

const ACTIONS = new Set<string>(Object.values(Action))
function asAction(value: string | undefined): Action | null {
  return value !== undefined && ACTIONS.has(value) ? (value as Action) : null
}

const RULE_BY_NAME = new Map([...ILLUSTRIOUS_18, ...FAB_4].map(d => [d.name, d]))

function indexPlayOf(decision: PlayDecision): IndexPlay | null {
  const basic = asAction(decision.basicAction)
  if (!basic || !decision.deviationName) return null
  const dev = RULE_BY_NAME.get(decision.deviationName)
  return {
    name: decision.deviationName,
    basic,
    rule: dev ? { threshold: dev.trueCountThreshold, above: dev.actionAbove, below: dev.actionBelow } : null,
  }
}

/** The player's hands at the settlement: the record's own, or the first hand alone for records without them. */
function handsOf(record: PlayerHandRecord, hands?: Card[][]): Card[][] {
  if (hands && hands.length > 0 && hands[0].length > 0) return hands
  if (record.playerHands && record.playerHands.length > 0) return record.playerHands
  return [record.playerCards]
}

/**
 * Each play decision with the spot it was made on.
 *
 * Which cards a decision was made on is not stored with it; it follows from
 * the hands at the settlement, as in the guest table's verdict
 * (`trial-verdict.ts`): a hand's decisions come in order, each hit adds one
 * card, and a split starts the hand over from its first card.
 */
function playRows(record: PlayerHandRecord, hands: Card[][], several: boolean): Extract<ReviewRow, { kind: 'play' }>[] {
  const dealer = chartRank(record.dealerUpCard)
  const hits = new Map<number, number>()
  const rows: Extract<ReviewRow, { kind: 'play' }>[] = []
  for (const decision of record.decisions) {
    const chosen = asAction(decision.action)
    const correct = asAction(decision.correctAction)
    if (!chosen || !correct) continue
    const index = decision.handIndex ?? 0
    const cards = hands[index] ?? []
    if (cards.length === 0) continue
    let hand: string
    if (chosen === Action.Split) {
      hand = `${chartRank(cards[0])},${chartRank(cards[0])}`
      hits.set(index, 0)
    } else {
      const drawn = hits.get(index) ?? 0
      hand = chartHand(cards.slice(0, 2 + drawn))
      if (chosen === Action.Hit) hits.set(index, drawn + 1)
    }
    rows.push({
      kind: 'play',
      hand: several ? index + 1 : null,
      spot: { hand, dealer },
      chosen,
      correct,
      isCorrect: decision.isCorrect,
      trueCount: decision.trueCount ?? null,
      index: indexPlayOf(decision),
    })
  }
  return rows
}

const CHART_CELL: Record<string, ChartAction> = {
  [Action.Hit]: 'H',
  [Action.Stand]: 'S',
  [Action.Double]: 'D',
  [Action.Split]: 'SP',
  [Action.Surrender]: 'SU',
}

/** This table's rules in the form basic strategy reads them. */
export function rulesOf(config: CasinoSessionConfig): CasinoRules {
  return {
    ...DEFAULT_RULES,
    numDecks: config.numDecks,
    penetration: config.penetration,
    dealerHitsSoft17: config.dealerHitsSoft17,
    blackjackPayout: config.blackjackPays,
    doubleAfterSplit: config.doubleAfterSplit,
    surrenderAllowed: config.surrenderAllowed ? 'late' : 'none',
    maxSplitHands: config.maxSplitHands,
  }
}

const DEALER_RANK: Record<(typeof DEALER_KEYS)[number], Rank> = {
  '2': Rank.Two, '3': Rank.Three, '4': Rank.Four, '5': Rank.Five, '6': Rank.Six,
  '7': Rank.Seven, '8': Rank.Eight, '9': Rank.Nine, '10': Rank.Ten, A: Rank.Ace,
}

/**
 * The chart row of a two-card hand, worked out for this table's rules.
 *
 * Asked of basic strategy column by column rather than read from the printed
 * chart, so the row is the one the hand was graded by: the printed chart
 * assumes double after split and late surrender, and a table without them
 * plays some pairs and some 15s and 16s differently.
 *
 * @param cards - The hand as dealt (two cards)
 * @param dealer - The dealer's upcard as the chart writes it
 * @param config - The table
 */
export function chartRowForHand(cards: Card[], dealer: string, config: CasinoSessionConfig): ChartRowExcerpt | null {
  if (cards.length !== 2) return null
  const column = DEALER_KEYS.indexOf(dealer as (typeof DEALER_KEYS)[number])
  if (column < 0) return null
  const rules = rulesOf(config)
  const cells = DEALER_KEYS.map(d => CHART_CELL[getOptimalAction(cards, { rank: DEALER_RANK[d], suit: Suit.Spades }, rules, true, true)] ?? 'H')
  return { hand: chartHand(cards), cells, column, noSurrender: !config.surrenderAllowed }
}

/** Every graded item of a hand, right or wrong — the decisions, then the bet. */
function gradedItems(rows: ReviewRow[], bet: BetReview | null): boolean[] {
  return [...rows.map(r => r.isCorrect), ...(bet ? [bet.isCorrect] : [])]
}

function verdictOf(items: boolean[]): Verdict {
  if (items.length === 0) return 'none'
  return items.every(Boolean) ? 'right' : 'wrong'
}

function sideRows(record: PlayerHandRecord, basic: boolean): ReviewRow[] {
  const rows: ReviewRow[] = []
  if (record.insuranceOffered) {
    const took = record.playerTookInsurance === true
    const isCorrect = record.correctInsuranceDecision === true
    rows.push({
      kind: 'insurance',
      took,
      take: isCorrect ? took : !took,
      isCorrect,
      trueCount: basic ? null : record.trueCountAtInsurance ?? null,
    })
  }
  return rows
}

function countRow(record: PlayerHandRecord): ReviewRow | null {
  if (!record.countChecked || record.playerRC === undefined || record.playerTC === undefined) return null
  const rcOk = record.rcCorrect === true
  const tcOk = record.tcCorrect === true
  return {
    kind: 'count',
    rc: { you: record.playerRC, actual: record.actualRC, ok: rcOk },
    tc: { you: record.playerTC, actual: record.actualTC, ok: tcOk },
    isCorrect: rcOk && tcOk,
  }
}

function betOf(record: PlayerHandRecord, basic: boolean): BetReview | null {
  if (basic || record.playerBet <= 0) return null
  return { amount: record.playerBet, trueCount: record.trueCountAtBet, right: record.correctBet, isCorrect: record.betCorrect }
}

/**
 * The review of one hand.
 *
 * @param record - The hand's record, as the game loop built it at the settlement
 * @param config - The table it was played at
 * @param hands - The player's hands as they lie on the felt, when the caller
 *   has them (the live table does); the record's own copy otherwise
 */
export function reviewHand(record: PlayerHandRecord, config: CasinoSessionConfig, hands?: Card[][]): HandReviewModel {
  const basic = config.playStyle === 'basic'
  const lying = handsOf(record, hands)
  const several = lying.length > 1
  const plays = playRows(record, lying, several)
  const count = countRow(record)
  const rows: ReviewRow[] = [...sideRows(record, basic), ...plays, ...(count ? [count] : [])]
  const bet = betOf(record, basic)
  const items = gradedItems(rows, bet)

  const first = plays[0]
  const firstCards = lying[0] ?? []
  const dealt = first?.chosen === Action.Split && firstCards[0] ? [firstCards[0], firstCards[0]] : firstCards.slice(0, 2)
  const row = first ? chartRowForHand(dealt, first.spot.dealer, config) : null

  let nothing: HandReviewModel['nothing'] = null
  if (plays.length === 0) {
    nothing = isBlackjack(record.dealerFinalCards) ? 'dealerBlackjack' : record.result === 'blackjack' ? 'blackjack' : 'other'
  }

  return {
    handNumber: record.handNumber,
    rows,
    bet,
    verdict: verdictOf(items),
    mistakes: items.filter(ok => !ok).length,
    nothing,
    chart: first && row ? { spot: { hand: row.hand, dealer: first.spot.dealer }, row, deviation: first.index !== null } : null,
    severalHands: several,
    split: record.decisions.some(d => d.action === Action.Split),
    deviation: plays.some(p => p.index !== null),
  }
}

/**
 * How a hand went, without its cards: for the trail of hands this session.
 * The same items as the review grades — so a hand the trail shows red is one
 * whose review listed a mistake.
 *
 * @param record - The hand's record
 * @param basic - The table plays basic strategy (bets are not graded there)
 */
export function handVerdict(record: PlayerHandRecord, basic: boolean): Verdict {
  const count = countRow(record)
  const items = [
    ...sideRows(record, basic).map(r => r.isCorrect),
    ...record.decisions.filter(d => asAction(d.action) && asAction(d.correctAction)).map(d => d.isCorrect),
    ...(count ? [count.isCorrect] : []),
    ...(betOf(record, basic) ? [record.betCorrect] : []),
  ]
  return verdictOf(items)
}

/** A wrong decision of the session, for the summary's list: the review row and the hand it came from. */
export interface SessionMiss {
  handNumber: number
  row: Extract<ReviewRow, { kind: 'play' | 'insurance' }>
}

/**
 * Every play and insurance answer the session got wrong, in the order played.
 *
 * @param records - The session's hands
 * @param config - The table
 */
export function sessionMisses(records: readonly PlayerHandRecord[], config: CasinoSessionConfig): SessionMiss[] {
  const out: SessionMiss[] = []
  for (const record of records) {
    for (const row of reviewHand(record, config).rows) {
      if ((row.kind === 'play' || row.kind === 'insurance') && !row.isCorrect) out.push({ handNumber: record.handNumber, row })
    }
  }
  return out
}

/**
 * A true count with its sign, in the reader's number format: "+1.5" in
 * English, "+1,5" in German, "0" without a sign.
 *
 * @param tc - The true count (the table counts in halves)
 * @param locale - The interface language
 */
export function formatTrueCount(tc: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { signDisplay: 'exceptZero', maximumFractionDigits: 1 }).format(tc)
  } catch {
    return tc > 0 ? `+${tc}` : String(tc)
  }
}

/**
 * A chart hand in words: "Hard 16", "Soft 18", "Pair of 8s".
 *
 * @param hand - The hand as the chart writes it
 */
export function spotName(hand: string): KeyedText {
  const [a, b] = hand.split(',')
  if (b !== undefined && a === b) {
    return a === 'A' ? { key: 'training.flash.pairOfAces' } : { key: 'training.flash.pairOf', values: { rank: a } }
  }
  if (b !== undefined && a === 'A') return { key: 'training.flash.softTotal', values: { n: 11 + Number(b) } }
  return { key: 'training.flash.hardTotal', values: { n: Number(hand) } }
}
