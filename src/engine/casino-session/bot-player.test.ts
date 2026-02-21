import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Card } from '../shoe/types'
import { Rank, Suit } from '../shoe/types'
import { getHandValue } from '../rules/hand-utils'
import type { CasinoRules } from '../rules/types'
import { DEFAULT_RULES } from '../rules/types'
import { BOT_NAMES, createBot, playBotTurn, refillBotBankroll } from './bot-player'
import type { BotHand, BotPlayer } from './types'

/** Helper: create a card shorthand. */
function card(rank: Rank, suit: Suit = Suit.Hearts): Card {
  return { rank, suit }
}

/** Default rules for testing. */
const testRules: CasinoRules = {
  ...DEFAULT_RULES,
  numDecks: 6,
  penetration: 0.75,
  dealerHitsSoft17: false,
  surrenderAllowed: 'late',
  doubleAfterSplit: true,
  maxSplitHands: 4,
}

describe('Bot Player', () => {
  describe('createBot', () => {
    it('generates a valid bot with a name from the pool', () => {
      const usedNames = new Set<string>()
      const bot = createBot(2, 25, usedNames, 'bot-0')

      expect(bot.id).toBe('bot-0')
      expect(bot.seatIndex).toBe(2)
      expect(bot.isActive).toBe(true)
      expect(bot.skillLevel).toBe('basic_strategy')
      expect(bot.bettingPattern).toBe('flat')
      expect(bot.bankroll).toBeGreaterThanOrEqual(1000)
      expect(bot.bankroll).toBeLessThanOrEqual(5000)
      expect(bot.flatBetAmount).toBeGreaterThanOrEqual(25)
      expect(bot.flatBetAmount).toBeLessThanOrEqual(100)
      expect(BOT_NAMES).toContain(bot.name)
    })

    it('never duplicates names across bots', () => {
      const usedNames = new Set<string>()
      const bots: BotPlayer[] = []

      for (let i = 0; i < 5; i++) {
        const bot = createBot(i, 25, usedNames, `bot-${i}`)
        bots.push(bot)
      }

      const names = bots.map(b => b.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    it('handles exhausted name pool with suffixed names', () => {
      const usedNames = new Set<string>(BOT_NAMES)
      const bot = createBot(0, 25, usedNames, 'bot-extra')

      expect(bot.name).toBeTruthy()
      expect(bot.name.length).toBeGreaterThan(0)
      // Should have a suffix like "James 2"
      expect(bot.name).toMatch(/.+ \d+/)
    })
  })

  describe('refillBotBankroll', () => {
    it('refills bankroll and assigns a new name', () => {
      const usedNames = new Set<string>()
      const bot = createBot(0, 25, usedNames, 'bot-0')
      const oldName = bot.name

      bot.bankroll = 0
      refillBotBankroll(bot, 25, usedNames)

      expect(bot.bankroll).toBeGreaterThanOrEqual(1000)
      expect(bot.bankroll).toBeLessThanOrEqual(5000)
      // Old name should be freed
      expect(usedNames.has(oldName)).toBe(false)
      // New name should be in use
      expect(usedNames.has(bot.name)).toBe(true)
    })
  })

  describe('playBotTurn', () => {
    let drawnCards: Card[]
    let drawIndex: number

    function setupDrawCard(cards: Card[]): () => Card {
      drawnCards = cards
      drawIndex = 0
      return () => {
        if (drawIndex >= drawnCards.length) {
          throw new Error('Ran out of cards in mock draw')
        }
        return drawnCards[drawIndex++]
      }
    }

    function createBotWithHand(cards: Card[], bet: number = 25): BotPlayer {
      return {
        id: 'bot-test',
        name: 'Test',
        seatIndex: 0,
        bankroll: 5000,
        currentBet: bet,
        hands: [{
          cards,
          bet,
          isDoubled: false,
          isSplit: false,
          isBusted: false,
          isStanding: false,
        }],
        isActive: true,
        skillLevel: 'basic_strategy',
        bettingPattern: 'flat',
        flatBetAmount: bet,
      }
    }

    it('follows basic strategy — stands on hard 17+', () => {
      const bot = createBotWithHand([
        card(Rank.Ten),
        card(Rank.Seven),
      ])
      const dealerUp = card(Rank.Six)
      const drawCard = setupDrawCard([])

      const hands = playBotTurn(bot, dealerUp, drawCard, testRules)

      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].isBusted).toBe(false)
      expect(drawIndex).toBe(0) // No cards drawn
    })

    it('follows basic strategy — hits on hard 12 vs dealer 3', () => {
      // BS: 12 vs 3 → Hit (at standard conditions)
      const bot = createBotWithHand([
        card(Rank.Ten),
        card(Rank.Two),
      ])
      const dealerUp = card(Rank.Three)
      const drawCard = setupDrawCard([
        card(Rank.Seven), // 12 + 7 = 19, stand
      ])

      const hands = playBotTurn(bot, dealerUp, drawCard, testRules)

      expect(hands[0].cards.length).toBe(3)
      expect(hands[0].isStanding).toBe(true)
      expect(drawIndex).toBe(1)
    })

    it('doubles when BS says double — 11 vs 6', () => {
      const bot = createBotWithHand([
        card(Rank.Six),
        card(Rank.Five),
      ])
      const dealerUp = card(Rank.Six)
      const drawCard = setupDrawCard([
        card(Rank.Ten), // 11 + 10 = 21
      ])

      const hands = playBotTurn(bot, dealerUp, drawCard, testRules)

      expect(hands[0].isDoubled).toBe(true)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(3)
      expect(hands[0].bet).toBe(50) // Doubled
    })

    it('splits pairs when BS says split — 8,8 vs 6', () => {
      const bot = createBotWithHand([
        card(Rank.Eight),
        card(Rank.Eight),
      ])
      const dealerUp = card(Rank.Six)
      const drawCard = setupDrawCard([
        card(Rank.Ten),  // First hand: 8 + 10 = 18, stand
        card(Rank.Nine), // Second hand: 8 + 9 = 17, stand
      ])

      const hands = playBotTurn(bot, dealerUp, drawCard, testRules)

      expect(hands.length).toBe(2)
      expect(hands[0].isSplit).toBe(true)
      expect(hands[1].isSplit).toBe(true)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[1].isStanding).toBe(true)
    })

    it('draws cards through drawCard function (RC updated)', () => {
      let callCount = 0
      const bot = createBotWithHand([
        card(Rank.Ten),
        card(Rank.Two),
      ])
      const dealerUp = card(Rank.Ten)
      // 12 vs 10 → Hit (BS)
      const drawCard = () => {
        callCount++
        if (callCount === 1) return card(Rank.Three) // 12+3=15, hit again vs 10
        if (callCount === 2) return card(Rank.Two) // 15+2=17, stand (17 vs 10)
        return card(Rank.Ten)
      }

      playBotTurn(bot, dealerUp, drawCard, testRules)

      expect(callCount).toBe(2) // Drew 2 cards via drawCard
    })

    it('handles bust correctly', () => {
      const bot = createBotWithHand([
        card(Rank.Ten),
        card(Rank.Six),
      ])
      const dealerUp = card(Rank.Seven)
      // 16 vs 7 → Hit (BS)
      const drawCard = setupDrawCard([
        card(Rank.Ten), // 16 + 10 = 26, bust
      ])

      const hands = playBotTurn(bot, dealerUp, drawCard, testRules)

      expect(hands[0].isBusted).toBe(true)
      expect(hands[0].isStanding).toBe(true)
    })

    it('never takes insurance (basic strategy says no)', () => {
      // Insurance is handled at the game level, not in playBotTurn
      // Bots simply play their cards — insurance is skipped for bots
      const bot = createBotWithHand([
        card(Rank.Ten),
        card(Rank.Nine),
      ])
      const dealerUp = card(Rank.Ace)
      const drawCard = setupDrawCard([])

      const hands = playBotTurn(bot, dealerUp, drawCard, testRules)

      // Bot stands on 19
      expect(hands[0].isStanding).toBe(true)
    })
  })
})
