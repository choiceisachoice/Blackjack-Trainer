import type { Card } from '../shoe/types'
import { Rank } from '../shoe/types'
import { Action } from '../rules/types'
import { getHandValue, isSoft } from '../rules/hand-utils'
import type { Deviation } from './types'

/**
 * Converts a card rank to the dealer/player lookup key.
 * Face cards (J, Q, K) all map to "10".
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
 * The 18 most important strategy deviations from Basic Strategy (Don Schlesinger).
 *
 * When True Count ≥ threshold, use actionAbove instead of actionBelow.
 * Ordered by importance (Insurance is #1).
 */
export const ILLUSTRIOUS_18: Deviation[] = [
  // 1. Insurance: TC >= +3 → Take Insurance
  {
    name: 'Insurance',
    playerHand: '*',
    dealerUpcard: 'A',
    trueCountThreshold: 3,
    actionAbove: Action.Insurance,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 2. 16 vs 10: TC >= 0 → Stand (instead of Hit)
  {
    name: '16 vs 10',
    playerHand: '16',
    dealerUpcard: '10',
    trueCountThreshold: 0,
    actionAbove: Action.Stand,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 3. 15 vs 10: TC >= +4 → Stand (instead of Hit)
  {
    name: '15 vs 10',
    playerHand: '15',
    dealerUpcard: '10',
    trueCountThreshold: 4,
    actionAbove: Action.Stand,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 4. 10,10 vs 5: TC >= +5 → Split (instead of Stand)
  {
    name: '10,10 vs 5',
    playerHand: '10,10',
    dealerUpcard: '5',
    trueCountThreshold: 5,
    actionAbove: Action.Split,
    actionBelow: Action.Stand,
    isIllustrious18: true,
    isFab4: false,
  },
  // 5. 10,10 vs 6: TC >= +4 → Split (instead of Stand)
  {
    name: '10,10 vs 6',
    playerHand: '10,10',
    dealerUpcard: '6',
    trueCountThreshold: 4,
    actionAbove: Action.Split,
    actionBelow: Action.Stand,
    isIllustrious18: true,
    isFab4: false,
  },
  // 6. 10 vs 10: TC >= +4 → Double (instead of Hit)
  {
    name: '10 vs 10',
    playerHand: '10',
    dealerUpcard: '10',
    trueCountThreshold: 4,
    actionAbove: Action.Double,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 7. 12 vs 3: TC >= +2 → Stand (instead of Hit)
  {
    name: '12 vs 3',
    playerHand: '12',
    dealerUpcard: '3',
    trueCountThreshold: 2,
    actionAbove: Action.Stand,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 8. 12 vs 2: TC >= +3 → Stand (instead of Hit)
  {
    name: '12 vs 2',
    playerHand: '12',
    dealerUpcard: '2',
    trueCountThreshold: 3,
    actionAbove: Action.Stand,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 9. 11 vs A: TC >= +1 → Double (instead of Hit)
  {
    name: '11 vs A',
    playerHand: '11',
    dealerUpcard: 'A',
    trueCountThreshold: 1,
    actionAbove: Action.Double,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 10. 9 vs 2: TC >= +1 → Double (instead of Hit)
  {
    name: '9 vs 2',
    playerHand: '9',
    dealerUpcard: '2',
    trueCountThreshold: 1,
    actionAbove: Action.Double,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 11. 10 vs A: TC >= +4 → Double (instead of Hit)
  {
    name: '10 vs A',
    playerHand: '10',
    dealerUpcard: 'A',
    trueCountThreshold: 4,
    actionAbove: Action.Double,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 12. 9 vs 7: TC >= +3 → Double (instead of Hit)
  {
    name: '9 vs 7',
    playerHand: '9',
    dealerUpcard: '7',
    trueCountThreshold: 3,
    actionAbove: Action.Double,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 13. 16 vs 9: TC >= +5 → Stand (instead of Hit)
  {
    name: '16 vs 9',
    playerHand: '16',
    dealerUpcard: '9',
    trueCountThreshold: 5,
    actionAbove: Action.Stand,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 14. 13 vs 2: TC >= -1 → Hit (instead of Stand)
  {
    name: '13 vs 2',
    playerHand: '13',
    dealerUpcard: '2',
    trueCountThreshold: -1,
    actionAbove: Action.Hit,
    actionBelow: Action.Stand,
    isIllustrious18: true,
    isFab4: false,
  },
  // 15. 12 vs 4: TC >= 0 → Stand (confirms BS)
  {
    name: '12 vs 4',
    playerHand: '12',
    dealerUpcard: '4',
    trueCountThreshold: 0,
    actionAbove: Action.Stand,
    actionBelow: Action.Hit,
    isIllustrious18: true,
    isFab4: false,
  },
  // 16. 12 vs 5: TC >= -2 → Hit (instead of Stand)
  {
    name: '12 vs 5',
    playerHand: '12',
    dealerUpcard: '5',
    trueCountThreshold: -2,
    actionAbove: Action.Hit,
    actionBelow: Action.Stand,
    isIllustrious18: true,
    isFab4: false,
  },
  // 17. 12 vs 6: TC >= -1 → Hit (instead of Stand)
  {
    name: '12 vs 6',
    playerHand: '12',
    dealerUpcard: '6',
    trueCountThreshold: -1,
    actionAbove: Action.Hit,
    actionBelow: Action.Stand,
    isIllustrious18: true,
    isFab4: false,
  },
  // 18. 13 vs 3: TC >= -2 → Hit (instead of Stand)
  {
    name: '13 vs 3',
    playerHand: '13',
    dealerUpcard: '3',
    trueCountThreshold: -2,
    actionAbove: Action.Hit,
    actionBelow: Action.Stand,
    isIllustrious18: true,
    isFab4: false,
  },
]

/**
 * The 4 most important surrender deviations (Fab 4).
 *
 * When True Count ≥ threshold, surrender instead of the Basic Strategy action.
 */
export const FAB_4: Deviation[] = [
  // 1. 14 vs 10: TC >= +3 → Surrender
  {
    name: '14 vs 10',
    playerHand: '14',
    dealerUpcard: '10',
    trueCountThreshold: 3,
    actionAbove: Action.Surrender,
    actionBelow: Action.Hit,
    isIllustrious18: false,
    isFab4: true,
  },
  // 2. 15 vs 10: TC >= 0 → Surrender
  {
    name: '15 vs 10',
    playerHand: '15',
    dealerUpcard: '10',
    trueCountThreshold: 0,
    actionAbove: Action.Surrender,
    actionBelow: Action.Hit,
    isIllustrious18: false,
    isFab4: true,
  },
  // 3. 15 vs 9: TC >= +2 → Surrender
  {
    name: '15 vs 9',
    playerHand: '15',
    dealerUpcard: '9',
    trueCountThreshold: 2,
    actionAbove: Action.Surrender,
    actionBelow: Action.Hit,
    isIllustrious18: false,
    isFab4: true,
  },
  // 4. 15 vs A: TC >= +1 → Surrender
  {
    name: '15 vs A',
    playerHand: '15',
    dealerUpcard: 'A',
    trueCountThreshold: 1,
    actionAbove: Action.Surrender,
    actionBelow: Action.Hit,
    isIllustrious18: false,
    isFab4: true,
  },
]

/**
 * Checks whether a deviation's player hand matches the given cards.
 *
 * - `"*"` matches any hand (used for Insurance)
 * - `"X,X"` matches a pair where both cards have the given rankToKey value
 * - A plain number matches a hard total (non-soft hand)
 */
function matchesPlayerHand(playerCards: Card[], playerHand: string): boolean {
  if (playerHand === '*') {
    return true
  }

  if (playerHand.includes(',')) {
    // Pair match (e.g. "10,10")
    if (playerCards.length !== 2) return false
    const [pairVal] = playerHand.split(',')
    return rankToKey(playerCards[0].rank) === pairVal &&
           rankToKey(playerCards[1].rank) === pairVal
  }

  // Hard total match
  const { best } = getHandValue(playerCards)
  return String(best) === playerHand && !isSoft(playerCards)
}

/**
 * Returns the deviation action if a matching deviation fires at the given true count.
 *
 * Iterates through the provided deviations in order and returns the actionAbove
 * of the first match where the player hand and dealer upcard match AND
 * the true count meets or exceeds the threshold.
 *
 * Returns null if no deviation matches (caller should use Basic Strategy).
 *
 * @param playerCards - The player's current hand
 * @param dealerUpcard - The dealer's face-up card
 * @param trueCount - The current true count
 * @param deviations - Array of deviations to check (e.g. ILLUSTRIOUS_18 or FAB_4)
 * @returns The deviation Action, or null if no deviation applies
 */
export function getDeviationAction(
  playerCards: Card[],
  dealerUpcard: Card,
  trueCount: number,
  deviations: Deviation[]
): Action | null {
  const dealerKey = rankToKey(dealerUpcard.rank)

  for (const deviation of deviations) {
    if (deviation.dealerUpcard !== dealerKey) continue
    if (!matchesPlayerHand(playerCards, deviation.playerHand)) continue

    if (trueCount >= deviation.trueCountThreshold) {
      return deviation.actionAbove
    }
  }

  return null
}
