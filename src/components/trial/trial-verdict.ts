import { getHandValue, isBlackjack, isPair } from '../../engine/rules/hand-utils'
import { Action } from '../../engine/rules/types'
import type { Card } from '../../engine/shoe/types'
import type { PlayerHandRecord } from '../../engine/casino-session/types'

/**
 * What the guest table says about a hand, and about the round: the
 * decisions graded against basic strategy, in the words of the strategy chart.
 *
 * It reads the same record the casino table's review after every hand reads
 * (`PlayerHandRecord`, built by the game loop at the settlement): each
 * decision with the play basic strategy makes there and whether the player
 * made it. That review says "Play: wrong (should: Stand)"; a visitor who has
 * never seen the product needs the spot named as well — "16 vs. 10" — so
 * this module also works out which hand each decision was made on.
 */

/** One settled hand of the guest table: its record, and the player's hands as they lay at the settlement. */
export interface SettledHand {
  record: PlayerHandRecord
  /** One hand, or several after a split; the record itself holds only the first. */
  hands: Card[][]
}

/** One decision the visitor made, graded against basic strategy. */
export type GradedDecision =
  | {
    kind: 'play'
    /** The hand at the moment of the decision, as the chart writes it: "16", "A,7", "8,8". */
    hand: string
    /** The dealer's upcard, as the chart writes it: "2"–"10", "A". */
    dealer: string
    chosen: Action
    correct: Action
    isCorrect: boolean
  }
  | {
    /** The side bet offered against a dealer's ace. Basic strategy never takes it. */
    kind: 'insurance'
    hand: string
    dealer: string
    took: boolean
    isCorrect: boolean
  }

/** How a hand went, by basic strategy. */
export type HandVerdict =
  | { kind: 'right'; decisions: number }
  | { kind: 'wrong'; first: GradedDecision; wrong: number; decisions: number }
  /** Nothing was decided: a blackjack, the dealer's blackjack, or nothing to play. */
  | { kind: 'none'; reason: 'blackjack' | 'dealerBlackjack' | 'other' }

/** The ten hands together. */
export interface RoundTally {
  hands: number
  decisions: number
  correct: number
  won: number
  lost: number
  pushed: number
  /** Play money won (positive) or lost over the round, insurance included. */
  net: number
  /** Every decision that was not basic strategy, in the order it was made. */
  misses: GradedDecision[]
}

const TEN_VALUE = new Set(['10', 'J', 'Q', 'K'])

/** A rank as the chart writes it: a ten, jack, queen or king is "10". */
export function chartRank(card: Card): string {
  return TEN_VALUE.has(card.rank) ? '10' : card.rank
}

/**
 * A hand as the strategy chart writes it: a pair by its cards ("8,8", "A,A",
 * "10,10"), a soft hand by its ace ("A,7", also for A,2,5), anything else by
 * its total ("16").
 *
 * @param cards - The hand at the moment it was played
 */
export function chartHand(cards: Card[]): string {
  if (isPair(cards)) return `${chartRank(cards[0])},${chartRank(cards[1])}`
  const { hard, soft, best } = getHandValue(cards)
  if (soft !== hard && soft < 21) return `A,${soft - 11}`
  return String(best)
}

const ACTIONS = new Set<string>(Object.values(Action))
function asAction(value: string): Action | null {
  return ACTIONS.has(value) ? (value as Action) : null
}

/**
 * Every decision of a hand, graded, in the order it was made: the insurance
 * question first (it is asked before anything is played), then each play.
 *
 * Which cards a decision was made on is not stored with it; it follows from
 * the hands at the settlement. A hand's decisions come in the order it was
 * played and each hit adds one card, so before its k-th play a hand held its
 * first two cards and the k−1 it was hit with. A split starts the hand over
 * (its first card stays, the second is dealt), and a hand that is split is
 * played to its end before the next one starts — so a decision's hand index
 * is also its index at the settlement.
 *
 * @param settled - The hand's record and the hands as they lay
 */
export function gradeHand({ record, hands }: SettledHand): GradedDecision[] {
  const dealer = chartRank(record.dealerUpCard)
  const first = hands[0] ?? record.playerCards
  // The hand as dealt: a pair that was split no longer lies on the table as
  // two cards, but its first card does, and a pair's cards are one rank.
  const splitFirst = record.decisions[0]?.action === Action.Split
  const dealt = splitFirst && first[0] ? `${chartRank(first[0])},${chartRank(first[0])}` : chartHand(first.slice(0, 2))

  const graded: GradedDecision[] = []
  if (record.insuranceOffered) {
    graded.push({
      kind: 'insurance',
      hand: dealt,
      dealer,
      took: record.playerTookInsurance === true,
      isCorrect: record.correctInsuranceDecision === true,
    })
  }

  const hits = new Map<number, number>()
  for (const decision of record.decisions) {
    const chosen = asAction(decision.action)
    const correct = asAction(decision.correctAction)
    if (!chosen || !correct) continue
    const index = (decision as { handIndex?: number }).handIndex ?? 0
    const cards = hands[index] ?? (index === 0 ? record.playerCards : [])
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
    graded.push({ kind: 'play', hand, dealer, chosen, correct, isCorrect: decision.isCorrect })
  }
  return graded
}

/**
 * The verdict on one hand: right, the first play that was not, or — when
 * nothing was decided — why not.
 *
 * @param settled - The hand's record and the hands as they lay
 */
export function verdictOf(settled: SettledHand): HandVerdict {
  const decisions = gradeHand(settled)
  if (decisions.length === 0) {
    const { record } = settled
    if (isBlackjack(record.dealerFinalCards)) return { kind: 'none', reason: 'dealerBlackjack' }
    if (record.result === 'blackjack') return { kind: 'none', reason: 'blackjack' }
    return { kind: 'none', reason: 'other' }
  }
  const wrong = decisions.filter(d => !d.isCorrect)
  return wrong.length === 0
    ? { kind: 'right', decisions: decisions.length }
    : { kind: 'wrong', first: wrong[0], wrong: wrong.length, decisions: decisions.length }
}

/**
 * The round as the summary shows it: the decisions, the hands won and lost,
 * the play money, and every miss.
 *
 * A hand is won or lost by what it paid — insurance included, and a split
 * hand as a whole — which is also how the felt shows it.
 *
 * @param round - The settled hands, in the order they were played
 */
export function tallyRound(round: readonly SettledHand[]): RoundTally {
  const tally: RoundTally = { hands: round.length, decisions: 0, correct: 0, won: 0, lost: 0, pushed: 0, net: 0, misses: [] }
  for (const settled of round) {
    const decisions = gradeHand(settled)
    tally.decisions += decisions.length
    for (const d of decisions) {
      if (d.isCorrect) tally.correct++
      else tally.misses.push(d)
    }
    const profit = settled.record.profit
    tally.net += profit
    if (profit > 0) tally.won++
    else if (profit < 0) tally.lost++
    else tally.pushed++
  }
  return tally
}
