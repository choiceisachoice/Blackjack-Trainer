import { describe, it, expect } from 'vitest'
import { BOT_PROFILES, createBot, nextBotBet, pickBotProfiles, temperedAction } from './bot-player'
import { Action } from '../rules/types'
import type { CasinoRules } from '../rules/types'
import { Rank, Suit, type Card } from '../shoe/types'
import { getOptimalAction } from '../strategy/basic-strategy'
import type { BotPlayer } from './types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

const RULES: CasinoRules = {
  numDecks: 6,
  penetration: 0.75,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  doubleAfterSplit: true,
  resplitAllowed: true,
  maxSplitHands: 4,
  hitSplitAces: false,
  surrenderAllowed: 'none',
  insuranceAllowed: true,
}

const always = () => 0      // every "sometimes" habit fires
const never = () => 0.999   // none of them does

const act = (skill: BotPlayer['skillLevel'], cards: Card[], up: Rank, random = always, canSplit = true, canDouble = true) =>
  temperedAction(skill, cards, c(up, Suit.Hearts), RULES, canSplit, canDouble, random)
const book = (cards: Card[], up: Rank, canSplit = true, canDouble = true) =>
  getOptimalAction(cards, c(up, Suit.Hearts), RULES, canSplit, canDouble)

/**
 * The people at the table (Darius, 15 Nov 2026: "die Bots müssen anders
 * denken"). A bot is wrong in character and right the rest of the time.
 */
describe('temperedAction', () => {
  const HANDS: [Card[], Rank][] = [
    [[c(Rank.Ten), c(Rank.Six)], Rank.Ten],
    [[c(Rank.Ten), c(Rank.Two)], Rank.Five],
    [[c(Rank.Six), c(Rank.Five)], Rank.Six],
    [[c(Rank.Ace), c(Rank.Seven)], Rank.Nine],
    [[c(Rank.Nine), c(Rank.Nine)], Rank.Six],
    [[c(Rank.Ten), c(Rank.King)], Rank.Six],
    [[c(Rank.Five), c(Rank.Three)], Rank.Six],
  ]

  it('by the book is basic strategy, hand for hand', () => {
    for (const [cards, up] of HANDS) expect(act('basic_strategy', cards, up)).toBe(book(cards, up))
  })

  it('never bust stands on every hard 12 or more, whatever the dealer shows', () => {
    expect(book([c(Rank.Ten), c(Rank.Six)], Rank.Ten)).toBe(Action.Hit)
    expect(act('never_bust', [c(Rank.Ten), c(Rank.Six)], Rank.Ten)).toBe(Action.Stand)
    expect(act('never_bust', [c(Rank.Ten), c(Rank.Two)], Rank.King)).toBe(Action.Stand)
    // …but still plays a hand that cannot bust the way the book does.
    expect(act('never_bust', [c(Rank.Six), c(Rank.Five)], Rank.Six)).toBe(Action.Double)
    expect(act('never_bust', [c(Rank.Ace), c(Rank.Six)], Rank.Ten)).toBe(Action.Hit)
  })

  it('timid puts no extra money out: no doubles, and only aces and eights are split', () => {
    expect(act('timid', [c(Rank.Six), c(Rank.Five)], Rank.Six)).toBe(Action.Hit)
    expect(act('timid', [c(Rank.Nine), c(Rank.Nine)], Rank.Six)).toBe(Action.Stand)
    expect(act('timid', [c(Rank.Eight), c(Rank.Eight)], Rank.Six)).toBe(Action.Split)
    expect(act('timid', [c(Rank.Ace), c(Rank.Ace)], Rank.Six)).toBe(Action.Split)
  })

  it('timid is afraid of the bust card on 15 and 16 against a high card — often, not always', () => {
    expect(act('timid', [c(Rank.Ten), c(Rank.Six)], Rank.Ten, always)).toBe(Action.Stand)
    expect(act('timid', [c(Rank.Ten), c(Rank.Six)], Rank.Ten, never)).toBe(Action.Hit)
    // soft 18 is "a good hand" and is never hit
    expect(book([c(Rank.Ace), c(Rank.Seven)], Rank.Nine)).toBe(Action.Hit)
    expect(act('timid', [c(Rank.Ace), c(Rank.Seven)], Rank.Nine, never)).toBe(Action.Stand)
  })

  it('gambler wants action: hits 12 against a low card, doubles an 8, splits tens', () => {
    expect(book([c(Rank.Ten), c(Rank.Two)], Rank.Five)).toBe(Action.Stand)
    expect(act('gambler', [c(Rank.Ten), c(Rank.Two)], Rank.Five, always)).toBe(Action.Hit)
    expect(book([c(Rank.Five), c(Rank.Three)], Rank.Six)).toBe(Action.Hit)
    expect(act('gambler', [c(Rank.Five), c(Rank.Three)], Rank.Six, always)).toBe(Action.Double)
    expect(act('gambler', [c(Rank.Ten), c(Rank.King)], Rank.Six, always)).toBe(Action.Split)
  })

  it('gambler without the urge plays the book', () => {
    for (const [cards, up] of HANDS) expect(act('gambler', cards, up, never)).toBe(book(cards, up))
  })

  it('no temperament ever doubles or splits where the table does not allow it', () => {
    for (const skill of ['timid', 'gambler', 'never_bust'] as const) {
      for (const [cards, up] of HANDS) {
        const a = act(skill, cards, up, always, false, false)
        expect(a, `${skill} ${cards.map(x => x.rank).join('')} v ${up}`).not.toBe(Action.Double)
        expect(a).not.toBe(Action.Split)
      }
    }
  })
})

describe('pickBotProfiles', () => {
  it('gives a small table different kinds of player', () => {
    for (let run = 0; run < 20; run++) {
      const three = pickBotProfiles(3)
      // five entries, by the book twice: three seats hold at least two kinds
      expect(new Set(three.map(p => p.skillLevel)).size).toBeGreaterThanOrEqual(2)
    }
  })

  it('fills any number of seats', () => {
    expect(pickBotProfiles(0)).toEqual([])
    expect(pickBotProfiles(7)).toHaveLength(7)
  })
})

describe('nextBotBet', () => {
  const bot = (profile: (typeof BOT_PROFILES)[number]): BotPlayer => {
    const b = createBot(0, 25, new Set(), 'b', profile)
    b.flatBetAmount = 50
    b.bankroll = 5000
    return b
  }

  it('a bot by the book bets its own amount, a timid one the minimum', () => {
    expect(nextBotBet(bot({ skillLevel: 'basic_strategy', bettingPattern: 'flat' }), 25, 500)).toBe(50)
    expect(nextBotBet(bot({ skillLevel: 'timid', bettingPattern: 'minimum' }), 25, 500)).toBe(25)
  })

  it('a pressing bot doubles after each winning round, three times at most, and drops back when it does not win', () => {
    const b = bot({ skillLevel: 'gambler', bettingPattern: 'press' })
    expect(nextBotBet(b, 25, 5000)).toBe(50)
    b.lastRoundNet = 50
    expect(nextBotBet(b, 25, 5000)).toBe(100)
    expect(nextBotBet(b, 25, 5000)).toBe(200)
    expect(nextBotBet(b, 25, 5000)).toBe(400)
    expect(nextBotBet(b, 25, 5000)).toBe(400)
    b.lastRoundNet = 0
    expect(nextBotBet(b, 25, 5000)).toBe(50)
    b.lastRoundNet = -50
    expect(nextBotBet(b, 25, 5000)).toBe(50)
  })

  it('never bets more than the table allows or the bot has', () => {
    const b = bot({ skillLevel: 'gambler', bettingPattern: 'press' })
    b.lastRoundNet = 50
    b.pressLevel = 3
    expect(nextBotBet(b, 25, 300)).toBe(300)
    b.bankroll = 120
    expect(nextBotBet(b, 25, 300)).toBe(120)
  })

  it('createBot without a profile is by the book, as before', () => {
    const b = createBot(0, 25, new Set(), 'b')
    expect(b.skillLevel).toBe('basic_strategy')
    expect(b.bettingPattern).toBe('flat')
  })
})
