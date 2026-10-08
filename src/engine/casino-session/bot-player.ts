import type { Card } from '../shoe/types'
import { Rank } from '../shoe/types'
import { Action } from '../rules/types'
import { getHandValue, isBlackjack, isBust, isPair } from '../rules/hand-utils'
import { getOptimalAction } from '../strategy/basic-strategy'
import type { CasinoRules } from '../rules/types'
import type { BotHand, BotPlayer, BotTurnStep } from './types'

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
 * A split is dealt the way a dealer deals it: the first hand gets its second
 * card and is played to the end before the next hand gets its second card.
 * Dealing both second cards at the moment of the split put cards in the wrong
 * hands and hid when a re-split happened.
 *
 * @param bot - The bot whose turn is being played
 * @param dealerUpCard - The dealer's face-up card
 * @param drawCard - Function that draws a card and updates the running count
 * @param rules - Casino rules (for strategy lookup)
 * @param log - Optional: receives every step of the turn with a snapshot of the table, for the replay
 * @returns Array of settled BotHands (may be multiple after splits)
 */
export function playBotTurn(
  bot: BotPlayer,
  dealerUpCard: Card,
  drawCard: () => Card,
  rules: CasinoRules,
  log?: BotTurnStep[],
): BotHand[] {
  const hands: BotHand[] = [...bot.hands]
  // Parallel to `hands`: a stable id per hand, so a re-split inserts a hand
  // the table can slide in, instead of relabelling the ones beside it.
  const ids: number[] = hands.map((_, k) => k)
  let nextId = hands.length
  const note = (kind: BotTurnStep['kind'], hand: number, auto?: boolean) => {
    log?.push({
      kind, hand, ...(auto ? { auto } : {}),
      hands: hands.map((h, k) => ({ id: ids[k], cards: [...h.cards] })),
    })
  }
  note('start', 0)
  let i = 0

  while (i < hands.length) {
    const hand = hands[i]

    // Skip hands that are already done
    if (hand.isStanding || hand.isBusted) {
      i++
      continue
    }

    // A split hand waiting for its second card gets it now — not at the
    // moment of the split, but when play reaches it.
    if (hand.isSplit && hand.cards.length === 1) {
      hand.cards = [...hand.cards, drawCard()]
      note('card', i)
      const isAces = hand.cards[0].rank === Rank.Ace
      if (getHandValue(hand.cards).best === 21) {
        hand.isStanding = true
        note('twentyone', i)
        i++
        continue
      }
      if (isAces && !rules.hitSplitAces) {
        // One card to a split ace, then it stands — unless another ace
        // arrives and there is room to split again.
        const canReSplit = rules.resplitAllowed && hands.length < rules.maxSplitHands && bot.bankroll >= hand.bet
        if (!(canReSplit && hand.cards[1].rank === Rank.Ace)) {
          hand.isStanding = true
          note('stand', i, true)
          i++
        }
        continue
      }
      // Play this hand from here like any other.
      continue
    }

    // Check for blackjack on initial 2-card hand (not from split)
    if (hand.cards.length === 2 && !hand.isSplit && isBlackjack(hand.cards)) {
      hand.isStanding = true
      i++
      continue
    }

    // A pair that cannot be split (hand limit, no money for the second bet)
    // is played as its total — not stood on.
    const canSplitNow =
      hand.cards.length === 2 && isPair(hand.cards) &&
      hands.length < rules.maxSplitHands && bot.bankroll >= hand.bet
    const action = getOptimalAction(hand.cards, dealerUpCard, rules, canSplitNow)

    if (action === Action.Stand) {
      hand.isStanding = true
      note('stand', i)
      i++
      continue
    }

    // A hit: the card, then the hand either goes on, busts or lands on 21.
    const hit = () => {
      hand.cards = [...hand.cards, drawCard()]
      note('hit', i)
      if (isBust(hand.cards)) {
        hand.isBusted = true
        hand.isStanding = true
        note('bust', i)
        i++
      } else if (getHandValue(hand.cards).best === 21) {
        hand.isStanding = true
        note('twentyone', i)
        i++
      }
    }

    if (action === Action.Hit) {
      hit()
      // Don't advance i — check this hand again
      continue
    }

    if (action === Action.Double) {
      if (hand.cards.length === 2 && bot.bankroll >= hand.bet && (!hand.isSplit || rules.doubleAfterSplit)) {
        const card = drawCard()
        hand.cards = [...hand.cards, card]
        bot.bankroll -= hand.bet
        hand.bet *= 2
        hand.isDoubled = true
        hand.isStanding = true
        note('double', i)
        if (isBust(hand.cards)) {
          hand.isBusted = true
          note('bust', i)
        } else if (getHandValue(hand.cards).best === 21) {
          note('twentyone', i)
        }
        i++
        continue
      }
      // Can't double — fall through to hit behavior
      hit()
      continue
    }

    if (action === Action.Split) {
      if (
        hand.cards.length === 2 &&
        isPair(hand.cards) &&
        hands.length < rules.maxSplitHands &&
        bot.bankroll >= hand.bet
      ) {
        // The second card becomes a hand of its own, right after this one.
        // Neither hand gets its second card here: each gets it when play
        // reaches it (the branch at the top of the loop).
        const secondHand: BotHand = {
          cards: [hand.cards[1]],
          bet: hand.bet,
          isDoubled: false,
          isSplit: true,
          isBusted: false,
          isStanding: false,
        }
        hand.cards = [hand.cards[0]]
        hand.isSplit = true
        bot.bankroll -= hand.bet
        hands.splice(i + 1, 0, secondHand)
        ids.splice(i + 1, 0, nextId++)
        note('split', i)

        // Don't advance i — this hand takes its second card next
        continue
      }
      // Can't split — fall through to stand
      hand.isStanding = true
      note('stand', i)
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
