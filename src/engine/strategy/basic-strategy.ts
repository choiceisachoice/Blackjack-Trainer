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
 * @returns The optimal Action
 */
export function getOptimalAction(
  playerCards: Card[],
  dealerUpcard: Card,
  rules: CasinoRules
): Action {
  const table = rules.dealerHitsSoft17 ? H17_STRATEGY : S17_STRATEGY
  const dealerKey = rankToKey(dealerUpcard.rank)
  const canDouble = playerCards.length === 2
  const canSurrender =
    rules.surrenderAllowed !== 'none' && playerCards.length === 2

  // 1. Check pairs (exactly 2 cards of same rank)
  if (isPair(playerCards)) {
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

  // Default: Stand (covers 21, blackjack, or any unmapped total)
  return Action.Stand
}
