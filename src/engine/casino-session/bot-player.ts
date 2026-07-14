import type { Card } from '../shoe/types'
import { Rank } from '../shoe/types'
import { Action } from '../rules/types'
import { getHandValue, isBlackjack, isBust, isPair } from '../rules/hand-utils'
import { getOptimalAction } from '../strategy/basic-strategy'
import type { CasinoRules } from '../rules/types'
import type { BotHand, BotPlayer } from './types'

/** Pool of realistic, internationally diverse bot names. */
export const BOT_NAMES = [
  'James', 'Maria', 'Chen Wei', 'Mike', 'Sofia',
  'Raj', 'Emma', 'Carlos', 'Yuki', 'Alex',
  'Sarah', 'Marco', 'Lisa', 'David', 'Nina',
  'Tommy', 'Anna', 'Jack', 'Eva', 'Sam',
]

/**
 * Creates a new bot player at the given seat.
 * @param seatIndex - The table seat for this bot (0–5)
 * @param minBet - The table minimum bet
 * @param usedNames - Set of names already in use (to avoid duplicates)
 * @param id - Unique bot identifier
 * @returns A new BotPlayer instance
 */
export function createBot(
  seatIndex: number,
  minBet: number,
  usedNames: Set<string>,
  id: string,
): BotPlayer {
  const name = pickUniqueName(usedNames)
  usedNames.add(name)

  const bankroll = 1000 + Math.floor(Math.random() * 4000)
  const betMultiplier = 1 + Math.floor(Math.random() * 4)
  const flatBetAmount = minBet * betMultiplier

  return {
    id,
    name,
    seatIndex,
    bankroll,
    currentBet: 0,
    hands: [],
    isActive: true,
    skillLevel: 'basic_strategy',
    bettingPattern: 'flat',
    flatBetAmount,
  }
}

/**
 * Picks a name from the BOT_NAMES pool that is not already in use.
 * @param usedNames - Set of names already taken
 * @returns A unique bot name
 */
function pickUniqueName(usedNames: Set<string>, exclude?: string): string {
  let available = BOT_NAMES.filter(n => !usedNames.has(n))
  // If we're replacing a name, prefer a DIFFERENT name
  if (exclude && available.length > 1) {
    available = available.filter(n => n !== exclude)
  }
  if (available.length === 0) {
    // Fallback: append a number to a random name
    const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    let suffix = 2
    while (usedNames.has(`${base} ${suffix}`)) suffix++
    return `${base} ${suffix}`
  }
  return available[Math.floor(Math.random() * available.length)]
}

/**
 * Refills a bot's bankroll when they run out of money.
 * Simulates a "new player" sitting down at the table.
 * @param bot - The bot to refill
 * @param minBet - Table minimum bet
 * @param usedNames - Set of names in use (old name is released, new name is added)
 */
export function refillBotBankroll(
  bot: BotPlayer,
  minBet: number,
  usedNames: Set<string>,
): void {
  const oldName = bot.name
  usedNames.delete(bot.name)
  bot.name = pickUniqueName(usedNames, oldName)
  usedNames.add(bot.name)
  bot.bankroll = 1000 + Math.floor(Math.random() * 4000)
  const betMultiplier = 1 + Math.floor(Math.random() * 4)
  bot.flatBetAmount = minBet * betMultiplier
}

/**
 * Plays a complete bot turn according to perfect basic strategy.
 *
 * Every card drawn goes through the provided `drawCard` function so the
 * running count is updated correctly (the human player must count all
 * visible cards).
 *
 * @param bot - The bot whose turn is being played
 * @param dealerUpCard - The dealer's face-up card
 * @param drawCard - Function that draws a card and updates the running count
 * @param rules - Casino rules (for strategy lookup)
 * @returns Array of settled BotHands (may be multiple after splits)
 */
export function playBotTurn(
  bot: BotPlayer,
  dealerUpCard: Card,
  drawCard: () => Card,
  rules: CasinoRules,
): BotHand[] {
  const hands: BotHand[] = [...bot.hands]
  let i = 0

  while (i < hands.length) {
    const hand = hands[i]

    // Skip hands that are already done
    if (hand.isStanding || hand.isBusted) {
      i++
      continue
    }

    // Check for blackjack on initial 2-card hand (not from split)
    if (hand.cards.length === 2 && !hand.isSplit && isBlackjack(hand.cards)) {
      hand.isStanding = true
      i++
      continue
    }

    const action = getOptimalAction(hand.cards, dealerUpCard, rules)

    if (action === Action.Stand) {
      hand.isStanding = true
      i++
      continue
    }

    if (action === Action.Hit) {
      const card = drawCard()
      hand.cards = [...hand.cards, card]
      if (isBust(hand.cards)) {
        hand.isBusted = true
        hand.isStanding = true
        i++
      }
      // Don't advance i — check this hand again
      continue
    }

    if (action === Action.Double) {
      if (hand.cards.length === 2 && bot.bankroll >= hand.bet) {
        const card = drawCard()
        hand.cards = [...hand.cards, card]
        bot.bankroll -= hand.bet
        hand.bet *= 2
        hand.isDoubled = true
        hand.isStanding = true
        if (isBust(hand.cards)) {
          hand.isBusted = true
        }
        i++
        continue
      }
      // Can't double — fall through to hit behavior
      const card = drawCard()
      hand.cards = [...hand.cards, card]
      if (isBust(hand.cards)) {
        hand.isBusted = true
        hand.isStanding = true
        i++
      }
      continue
    }

    if (action === Action.Split) {
      if (
        hand.cards.length === 2 &&
        isPair(hand.cards) &&
        hands.length < rules.maxSplitHands &&
        bot.bankroll >= hand.bet
      ) {
        const isAces = hand.cards[0].rank === Rank.Ace

        // Create second hand from the split
        const secondHand: BotHand = {
          cards: [hand.cards[1]],
          bet: hand.bet,
          isDoubled: false,
          isSplit: true,
          isBusted: false,
          isStanding: false,
        }

        // Update first hand
        hand.cards = [hand.cards[0]]
        hand.isSplit = true
        bot.bankroll -= hand.bet

        // Deal one card to each hand
        const card1 = drawCard()
        hand.cards = [...hand.cards, card1]

        const card2 = drawCard()
        secondHand.cards = [...secondHand.cards, card2]

        // Aces: one card each, then stand — unless re-split is possible
        if (isAces && !rules.hitSplitAces) {
          const canReSplit =
            rules.resplitAllowed &&
            hands.length + 1 < rules.maxSplitHands
          if (!(canReSplit && hand.cards[1].rank === Rank.Ace)) {
            hand.isStanding = true
          }
          if (!(canReSplit && secondHand.cards[1].rank === Rank.Ace)) {
            secondHand.isStanding = true
          }
        }

        // Insert the second hand right after the current one
        hands.splice(i + 1, 0, secondHand)

        // Check if first hand is 21 or bust
        if (getHandValue(hand.cards).best === 21) {
          hand.isStanding = true
        }
        if (isBust(hand.cards)) {
          hand.isBusted = true
          hand.isStanding = true
        }

        // Don't advance i — re-evaluate current hand
        continue
      }
      // Can't split — fall through to stand
      hand.isStanding = true
      i++
      continue
    }

    if (action === Action.Surrender) {
      // Bots generally don't surrender, but if BS says so:
      if (hand.cards.length === 2 && !hand.isSplit && rules.surrenderAllowed !== 'none') {
        hand.isStanding = true
        hand.result = 'surrender'
        i++
        continue
      }
      // Can't surrender — hit instead
      const card = drawCard()
      hand.cards = [...hand.cards, card]
      if (isBust(hand.cards)) {
        hand.isBusted = true
        hand.isStanding = true
        i++
      }
      continue
    }

    // Safety: unknown action → stand
    hand.isStanding = true
    i++
  }

  return hands
}
