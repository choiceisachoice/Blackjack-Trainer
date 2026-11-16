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

/** How a bot plays and how it bets: the two halves of a temperament. */
export interface BotProfile {
  skillLevel: BotPlayer['skillLevel']
  bettingPattern: BotPlayer['bettingPattern']
}

/**
 * The people at a blackjack table.
 *
 * Every bot used to play perfect basic strategy and bet the same amount every
 * round: five copies of a chart. A real table is not like that, and a counter
 * has to hold the count while the seat beside them hits a 13 against a 5.
 *
 * - **by the book** — basic strategy, flat bet. Listed twice: most tables have
 *   more of these than of any other kind.
 * - **timid** — afraid of the card that busts and of putting more money out:
 *   never doubles, splits only aces and eights, often stands on 15 and 16
 *   against a high card. Bets the minimum.
 * - **gambler** — wants action: doubles any 8 to 11, hits 12 and 13 against a
 *   low card, sometimes splits tens. Presses the bet after a win.
 * - **never bust** — the oldest wrong system there is: stand on every hard 12
 *   or more, whatever the dealer shows.
 */
export const BOT_PROFILES: readonly BotProfile[] = [
  { skillLevel: 'basic_strategy', bettingPattern: 'flat' },
  { skillLevel: 'basic_strategy', bettingPattern: 'flat' },
  { skillLevel: 'timid', bettingPattern: 'minimum' },
  { skillLevel: 'gambler', bettingPattern: 'press' },
  { skillLevel: 'never_bust', bettingPattern: 'flat' },
]

/**
 * Temperaments for a table of bots: the list above in a random order, so two
 * or three bots are never all the same kind, repeated if there are more seats.
 *
 * @param count - How many bots sit down
 * @param random - A source of numbers in [0, 1)
 */
export function pickBotProfiles(count: number, random: () => number = Math.random): BotProfile[] {
  const pool = [...BOT_PROFILES]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return Array.from({ length: Math.max(0, count) }, (_, i) => pool[i % pool.length])
}

/**
 * What a bot of a given temperament does with a hand.
 *
 * Starts from basic strategy and bends it the way that kind of player does.
 * The mistakes are the common ones, not random ones: a bot is wrong in
 * character, and right the rest of the time.
 *
 * @param skill - The bot's temperament
 * @param cards - The hand
 * @param dealerUpCard - The dealer's face-up card
 * @param rules - The table's rules
 * @param canSplit - Whether a split is possible now
 * @param canDouble - Whether a double is possible now
 * @param random - A source of numbers in [0, 1), for the habits that are not constant
 */
export function temperedAction(
  skill: BotPlayer['skillLevel'],
  cards: Card[],
  dealerUpCard: Card,
  rules: CasinoRules,
  canSplit: boolean,
  canDouble: boolean,
  random: () => number = Math.random,
): Action {
  const book = getOptimalAction(cards, dealerUpCard, rules, canSplit, canDouble)
  if (skill === 'basic_strategy') return book

  const { hard, best } = getHandValue(cards)
  const soft = best !== hard
  const up = dealerUpCard.rank === Rank.Ace ? 11 : Math.min(10, getHandValue([dealerUpCard]).best)
  const pair = cards.length === 2 && isPair(cards)

  if (skill === 'never_bust') {
    // Never takes the card that could bust — and gives nothing up either.
    if (!soft && best >= 12 && (book === Action.Hit || book === Action.Surrender)) return Action.Stand
    return book
  }

  if (skill === 'timid') {
    // No extra money on the table: a double becomes whatever the chart says
    // without one, and only aces and eights are split.
    let action = book
    if (action === Action.Double) action = getOptimalAction(cards, dealerUpCard, rules, canSplit, false)
    if (action === Action.Split && cards[0].rank !== Rank.Ace && cards[0].rank !== Rank.Eight) {
      action = getOptimalAction(cards, dealerUpCard, rules, false, false)
    }
    if (action === Action.Surrender) action = Action.Hit
    if (action === Action.Hit) {
      if (!soft && (best === 15 || best === 16) && up >= 7 && random() < 0.6) return Action.Stand
      if (soft && best === 18) return Action.Stand
    }
    return action
  }

  // gambler
  if (pair && canSplit && getHandValue([cards[0]]).best === 10 && random() < 0.3) return Action.Split
  if (book === Action.Stand && !soft && (best === 12 || best === 13) && up <= 6 && random() < 0.5) return Action.Hit
  if (book === Action.Hit && canDouble && cards.length === 2 && !soft && best >= 8 && best <= 11 && random() < 0.7) return Action.Double
  if (book === Action.Surrender) return Action.Hit
  return book
}

/**
 * The bet a bot puts out for the next round.
 *
 * - `minimum` — the table minimum, always
 * - `flat` — its own amount, always
 * - `press` — doubles after a winning round, up to three times, and drops
 *   back to its own amount the moment a round is not won
 *
 * Never more than the table maximum or what the bot has.
 *
 * @param bot - The bot; a pressing bot's `pressLevel` is updated
 * @param minBet - The table minimum
 * @param maxBet - The table maximum
 */
export function nextBotBet(bot: BotPlayer, minBet: number, maxBet: number): number {
  let bet = bot.flatBetAmount
  if (bot.bettingPattern === 'minimum') bet = minBet
  if (bot.bettingPattern === 'press') {
    bot.pressLevel = (bot.lastRoundNet ?? 0) > 0 ? Math.min(3, (bot.pressLevel ?? 0) + 1) : 0
    bet = bot.flatBetAmount * 2 ** bot.pressLevel
  }
  return Math.max(0, Math.min(bet, maxBet, bot.bankroll))
}

/**
 * Creates a new bot player at the given seat.
 * @param seatIndex - The table seat for this bot (0–5)
 * @param minBet - The table minimum bet
 * @param usedNames - Set of names already in use (to avoid duplicates)
 * @param id - Unique bot identifier
 * @param profile - Its temperament; by the book with a flat bet when omitted
 * @returns A new BotPlayer instance
 */
export function createBot(
  seatIndex: number,
  minBet: number,
  usedNames: Set<string>,
  id: string,
  profile: BotProfile = BOT_PROFILES[0],
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
    skillLevel: profile.skillLevel,
    bettingPattern: profile.bettingPattern,
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
  // A new player sat down: no streak to press.
  bot.lastRoundNet = 0
  bot.pressLevel = 0
}

/**
 * Plays a complete bot turn the way its temperament plays (`temperedAction`);
 * a by-the-book bot plays perfect basic strategy.
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
    // Same for a double the table or the bankroll does not allow: "Ds" is then
    // a stand and "D" a hit, as the chart means it — not a hit for both.
    const canDoubleNow =
      hand.cards.length === 2 && bot.bankroll >= hand.bet && (!hand.isSplit || rules.doubleAfterSplit)
    const action = temperedAction(bot.skillLevel, hand.cards, dealerUpCard, rules, canSplitNow, canDoubleNow)

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
