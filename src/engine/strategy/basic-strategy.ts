import type { Card } from '../shoe/types'
import { Rank } from '../shoe/types'
import type { CasinoRules } from '../rules/types'
import { Action } from '../rules/types'
import { getHandValue, isPair, isSoft } from '../rules/hand-utils'
import { H17_STRATEGY, S17_STRATEGY } from './basic-strategy-tables'
import type { StrategyAction } from './types'

/**
 * Converts a card rank to the table lookup key.
 * Face cards (J, Q, K) all map to "10".
 * @param rank - The card rank
 * @returns The lookup key string ("2"–"10" or "A")
 */
function rankToKey(rank: Rank): string {
  switch (rank) {
    case Rank.Jack:
    case Rank.Queen:
    case Rank.King:
      return '10'
    default:
      return rank
  }
}

/**
 * Resolves a conditional strategy action to a concrete Action.
 *
 * - "D"  → Double if `canDouble`, otherwise Hit
 * - "Ds" → Double if `canDouble`, otherwise Stand
 * - "Rh" → Surrender if `canSurrender`, otherwise Hit
 * - "Rs" → Surrender if `canSurrender`, otherwise Stand
 * - "H", "S", "P" → returned directly
 *
 * @param action - The conditional strategy action from the table
 * @param canDouble - Whether doubling is available
 * @param canSurrender - Whether surrender is available
 * @returns The resolved Action enum value
 */
export function resolveStrategyAction(
  action: StrategyAction,
  canDouble: boolean,
  canSurrender: boolean
): Action {
  switch (action) {
    case 'H':
      return Action.Hit
    case 'S':
      return Action.Stand
    case 'P':
      return Action.Split
    case 'D':
      return canDouble ? Action.Double : Action.Hit
    case 'Ds':
      return canDouble ? Action.Double : Action.Stand
    case 'Rh':
      return canSurrender ? Action.Surrender : Action.Hit
    case 'Rs':
      return canSurrender ? Action.Surrender : Action.Stand
  }
}

/**
 * The pair splits that are only right because the split hands may double:
 * 2,2 and 3,3 against 2–3, every 4,4 split, and 6,6 against 2. Without double
 * after split these are hits.
 */
function splitNeedsDas(rank: Rank, dealerKey: string): boolean {
  const r = rankToKey(rank)
  if (r === '4') return true
  if ((r === '2' || r === '3') && (dealerKey === '2' || dealerKey === '3')) return true
  if (r === '6' && dealerKey === '2') return true
  return false
}

/**
 * Returns the mathematically optimal action for a given player hand
 * and dealer upcard according to Basic Strategy.
 *
 * Lookup order:
 * 1. Pairs table (if exactly 2 cards of equal rank)
 * 2. Soft totals table (if hand has a usable Ace as 11)
 * 3. Hard totals table
 *
 * Conditional actions (D, Ds, Rh, Rs) are resolved based on whether
 * doubling and surrender are available (derived from card count and rules).
 *
 * @param playerCards - The player's current hand
 * @param dealerUpcard - The dealer's face-up card
 * @param rules - Casino rules (determines S17/H17 table and surrender availability)
 * @param canSplit - False when a pair cannot be split here (hand limit reached,
 *   no money for the second bet). The pair is then played as its total; two
 *   aces are a soft 12, which is always a hit.
 * @param canDouble - Whether doubling is possible on this hand. Defaults to
 *   "two cards"; pass false for a split hand at a table without double after
 *   split, or when the bankroll cannot cover it — "D" then reads as a hit and
 *   "Ds" as a stand, instead of grading a move the player cannot make.
 * @returns The optimal Action
 */
export function getOptimalAction(
  playerCards: Card[],
  dealerUpcard: Card,
  rules: CasinoRules,
  canSplit: boolean = true,
  canDouble: boolean = playerCards.length === 2,
): Action {
  const table = rules.dealerHitsSoft17 ? H17_STRATEGY : S17_STRATEGY
  const dealerKey = rankToKey(dealerUpcard.rank)
  const canSurrender =
    rules.surrenderAllowed !== 'none' && playerCards.length === 2

  if (!canSplit && isPair(playerCards) && playerCards[0].rank === Rank.Ace) {
    return Action.Hit
  }

  // 1. Check pairs (exactly 2 cards of same rank). The pair table assumes
  //    double after split; without it, the small pairs that split *in order
  //    to double* are hit instead (standard no-DAS chart).
  if (canSplit && isPair(playerCards) && !(rules.doubleAfterSplit === false && splitNeedsDas(playerCards[0].rank, dealerKey))) {
    const pairKey = `${rankToKey(playerCards[0].rank)},${rankToKey(playerCards[0].rank)}`
    const action = table.pairs[pairKey]?.[dealerKey]
    if (action) {
      return resolveStrategyAction(action, canDouble, canSurrender)
    }
  }

  const { best } = getHandValue(playerCards)

  // 2. Check soft totals (hand has usable Ace as 11)
  if (isSoft(playerCards) && best <= 21) {
    const softKey = `A,${best - 11}`
    const action = table.softTotals[softKey]?.[dealerKey]
    if (action) {
      return resolveStrategyAction(action, canDouble, canSurrender)
    }
  }

  // 3. Hard totals
  const hardKey = String(best)
  const action = table.hardTotals[hardKey]?.[dealerKey]
  if (action) {
    return resolveStrategyAction(action, canDouble, canSurrender)
  }

  // Unmapped totals. Below the table (a hard 4 is a 2,2 that is not split)
  // nothing can bust — always a hit; it used to fall through to Stand. Above
  // it (21, blackjack) — stand.
  return best <= 11 ? Action.Hit : Action.Stand
}
