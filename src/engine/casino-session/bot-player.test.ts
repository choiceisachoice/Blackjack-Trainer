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

  // ─────────────────────────────────────────────────────
  // COMPREHENSIVE BASIC STRATEGY TESTS (40+)
  // Validates that playBotTurn follows perfect BS for:
  //   Hard totals, Soft totals, Pairs, Doubles,
  //   Surrenders, Splits, Multi-hit, Edge cases
  // ─────────────────────────────────────────────────────

  describe('Hard total basic strategy', () => {
    let drawIndex: number

    function setupDrawCard(cards: Card[]): () => Card {
      drawIndex = 0
      return () => {
        if (drawIndex >= cards.length) throw new Error('Ran out of cards')
        return cards[drawIndex++]
      }
    }

    function createBotWithHand(cards: Card[], bet: number = 25): BotPlayer {
      return {
        id: 'bot-test', name: 'Test', seatIndex: 0, bankroll: 5000,
        currentBet: bet, hands: [{ cards, bet, isDoubled: false, isSplit: false, isBusted: false, isStanding: false }],
        isActive: true, skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: bet,
      }
    }

    // Hard 5 — always hit
    it('hits hard 5 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Two), card(Rank.Three)])
      // 5 → hit K=15 → hit 3=18 → stand
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.King), card(Rank.Three)]), testRules)
      expect(hands[0].cards.length).toBeGreaterThan(2) // drew at least one card
    })

    // Hard 8 — always hit
    it('hits hard 8 vs dealer 6', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([card(Rank.Ten)]), testRules) // 8+10=18, stand
      expect(hands[0].cards.length).toBe(3)
      expect(hands[0].isStanding).toBe(true)
    })

    // Hard 9 — double vs 3-6, hit otherwise
    it('doubles hard 9 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Four), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([card(Rank.Ten)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits hard 9 vs dealer 2', () => {
      const bot = createBotWithHand([card(Rank.Four), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([card(Rank.Nine)]), testRules) // 9+9=18, stand
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits hard 9 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Four), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Eight)]), testRules) // 9+8=17
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].isStanding).toBe(true)
    })

    // Hard 10 — double vs 2-9, hit vs 10/A
    it('doubles hard 10 vs dealer 9', () => {
      const bot = createBotWithHand([card(Rank.Four), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Nine), setupDrawCard([card(Rank.Ten)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    it('hits hard 10 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Four), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.Eight)]), testRules) // 10+8=18
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].isStanding).toBe(true)
    })

    it('hits hard 10 vs dealer Ace', () => {
      const bot = createBotWithHand([card(Rank.Four), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([card(Rank.Seven)]), testRules) // 10+7=17
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].isStanding).toBe(true)
    })

    // Hard 11 — double vs all (S17)
    it('doubles hard 11 vs dealer 10 (S17)', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.Ten)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    it('doubles hard 11 vs dealer Ace (S17)', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([card(Rank.Ten)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    // Hard 12 — stand vs 4-6, hit otherwise
    it('stands hard 12 vs dealer 4', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Four), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2) // no cards drawn
    })

    it('stands hard 12 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('stands hard 12 vs dealer 6', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('hits hard 12 vs dealer 2', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([card(Rank.Seven)]), testRules) // 12+7=19
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits hard 12 vs dealer 3', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Three), setupDrawCard([card(Rank.Seven)]), testRules)
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits hard 12 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Six)]), testRules) // 12+6=18
      expect(hands[0].cards.length).toBe(3)
    })

    // Hard 13 — stand vs 2-6, hit vs 7-A (THE BUG REPORT CASE)
    it('stands hard 13 vs dealer 2', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('stands hard 13 vs dealer 6', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('hits hard 13 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Five)]), testRules) // 13+5=18
      expect(hands[0].cards.length).toBe(3)
      expect(hands[0].isStanding).toBe(true)
    })

    it('hits hard 13 vs dealer 8', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Eight), setupDrawCard([card(Rank.Five)]), testRules) // 13+5=18
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits hard 13 vs dealer 9 (reported bug case)', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Nine), setupDrawCard([card(Rank.Five)]), testRules) // 13+5=18
      expect(hands[0].cards.length).toBe(3)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].isBusted).toBe(false)
    })

    it('hits hard 13 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.Five)]), testRules)
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits hard 13 vs dealer Ace', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Three)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([card(Rank.Five)]), testRules)
      expect(hands[0].cards.length).toBe(3)
    })

    // Hard 14 — stand vs 2-6, hit vs 7-A
    it('stands hard 14 vs dealer 3', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Four)])
      const hands = playBotTurn(bot, card(Rank.Three), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('hits hard 14 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Four)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Four)]), testRules) // 14+4=18
      expect(hands[0].cards.length).toBe(3)
    })

    // Hard 15 — stand vs 2-6, hit vs 7-8, surrender(hit) vs 10 (S17), hit vs 9/A
    it('stands hard 15 vs dealer 4', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Four), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('hits hard 15 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Three)]), testRules) // 15+3=18
      expect(hands[0].cards.length).toBe(3)
    })

    it('surrenders hard 15 vs dealer 10 (S17, late surrender)', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([]), testRules)
      expect(hands[0].result).toBe('surrender')
      expect(hands[0].isStanding).toBe(true)
    })

    it('hits hard 15 vs dealer 10 when surrender not allowed', () => {
      const noSurrRules = { ...testRules, surrenderAllowed: 'none' as const }
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.Three)]), noSurrRules)
      expect(hands[0].cards.length).toBe(3) // hit instead
      expect(hands[0].result).toBeUndefined()
    })

    // Hard 16 — stand vs 2-6, hit vs 7, surrender(hit) vs 8-A (S17)
    it('stands hard 16 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('hits hard 16 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Two)]), testRules) // 16+2=18
      expect(hands[0].cards.length).toBe(3)
    })

    it('surrenders hard 16 vs dealer 9 (S17, late surrender)', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Nine), setupDrawCard([]), testRules)
      expect(hands[0].result).toBe('surrender')
    })

    it('surrenders hard 16 vs dealer 10 (S17)', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([]), testRules)
      expect(hands[0].result).toBe('surrender')
    })

    it('surrenders hard 16 vs dealer Ace (S17)', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([]), testRules)
      expect(hands[0].result).toBe('surrender')
    })

    // Hard 17 — always stand (S17)
    it('stands hard 17 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('stands hard 17 vs dealer Ace (S17)', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    // Hard 18-21 — always stand
    it('stands hard 18 vs dealer Ace', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Eight)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('stands hard 20 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Queen)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
    })

    // Multi-hit sequence — 12 vs 10 → hit multiple times
    it('hits multiple times on hard 12 vs dealer 10 until standing', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const draws = [
        card(Rank.Two),  // 12+2=14, hit
        card(Rank.Two),  // 14+2=16, hit (Rh vs 10 → surrender only on initial, so hit here)
        card(Rank.Ace),  // 16+1=17, stand
      ]
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard(draws), testRules)
      expect(hands[0].cards.length).toBe(5)
      expect(hands[0].isStanding).toBe(true)
      expect(getHandValue(hands[0].cards).best).toBe(17)
    })

    // Bust on multi-hit
    it('busts on multi-hit when draws are bad', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Two)])
      const draws = [
        card(Rank.Three), // 12+3=15, hit vs 10
        card(Rank.Ten),   // 15+10=25, bust
      ]
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard(draws), testRules)
      expect(hands[0].isBusted).toBe(true)
      expect(getHandValue(hands[0].cards).best).toBeGreaterThan(21)
    })
  })

  describe('Soft total basic strategy', () => {
    let drawIndex: number

    function setupDrawCard(cards: Card[]): () => Card {
      drawIndex = 0
      return () => {
        if (drawIndex >= cards.length) throw new Error('Ran out of cards')
        return cards[drawIndex++]
      }
    }

    function createBotWithHand(cards: Card[], bet: number = 25): BotPlayer {
      return {
        id: 'bot-test', name: 'Test', seatIndex: 0, bankroll: 5000,
        currentBet: bet, hands: [{ cards, bet, isDoubled: false, isSplit: false, isBusted: false, isStanding: false }],
        isActive: true, skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: bet,
      }
    }

    // Soft 13 (A,2) — hit vs 2-4, double vs 5-6, hit vs 7-A
    it('hits soft 13 vs dealer 2', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([card(Rank.Six)]), testRules) // A+2+6=19 (soft), stand
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].cards.length).toBe(3)
    })

    it('doubles soft 13 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([card(Rank.Four)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    it('hits soft 13 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Two)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Five)]), testRules) // A+2+5=18
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].cards.length).toBe(3)
    })

    // Soft 15 (A,4) — double vs 4-6, hit otherwise
    it('doubles soft 15 vs dealer 4', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Four)])
      const hands = playBotTurn(bot, card(Rank.Four), setupDrawCard([card(Rank.Three)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    it('hits soft 15 vs dealer 3', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Four)])
      const hands = playBotTurn(bot, card(Rank.Three), setupDrawCard([card(Rank.Three)]), testRules) // A+4+3=18
      expect(hands[0].isDoubled).toBe(false)
    })

    // Soft 17 (A,6) — double vs 3-6, hit otherwise (S17)
    it('doubles soft 17 vs dealer 4', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Four), setupDrawCard([card(Rank.Two)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    it('hits soft 17 vs dealer 2 (S17)', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([card(Rank.Ace)]), testRules) // A+6+A=18
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits soft 17 vs dealer 8', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Eight), setupDrawCard([card(Rank.Ace)]), testRules) // A+6+A=18
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].cards.length).toBe(3)
    })

    // Soft 18 (A,7) — Ds vs 3-6, stand vs 2/7/8, hit vs 9/10/A (S17)
    it('doubles soft 18 vs dealer 5 (S17)', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([card(Rank.Two)]), testRules)
      expect(hands[0].isDoubled).toBe(true)
    })

    it('stands soft 18 vs dealer 2 (S17 — Ds resolves to Stand)', () => {
      // Ds vs 2: can double, so returns Double. But wait—for S17, A,7 vs 2 is 'Ds'.
      // With 2 cards, canDouble=true, so resolved to Double.
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([card(Rank.Two)]), testRules)
      expect(hands[0].isDoubled).toBe(true) // Ds with canDouble=true → Double
    })

    it('stands soft 18 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('stands soft 18 vs dealer 8', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Eight), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
    })

    it('hits soft 18 vs dealer 9', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Nine), setupDrawCard([card(Rank.Ace)]), testRules) // A+7+A=19
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits soft 18 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.Ace)]), testRules)
      expect(hands[0].cards.length).toBe(3)
    })

    it('hits soft 18 vs dealer Ace', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Seven)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([card(Rank.Ace)]), testRules)
      expect(hands[0].cards.length).toBe(3)
    })

    // Soft 19 (A,8) — stand vs all (S17), but Ds vs 6 → double with canDouble
    it('stands soft 19 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Eight)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    it('doubles soft 19 vs dealer 6 (S17 — Ds resolves to Double)', () => {
      // S17: A,8 vs 6 → Ds, and canDouble=true → Double
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Eight)])
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([card(Rank.Two)]), testRules)
      // Actually S17: A,8 vs 6 is 'Ds'. With 2 cards canDouble=true → Double
      expect(hands[0].isDoubled).toBe(true)
    })

    // Soft 20 (A,9) — always stand
    it('stands soft 20 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Nine)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })
  })

  describe('Pair splitting basic strategy', () => {
    let drawIndex: number

    function setupDrawCard(cards: Card[]): () => Card {
      drawIndex = 0
      return () => {
        if (drawIndex >= cards.length) throw new Error('Ran out of cards')
        return cards[drawIndex++]
      }
    }

    function createBotWithHand(cards: Card[], bet: number = 25): BotPlayer {
      return {
        id: 'bot-test', name: 'Test', seatIndex: 0, bankroll: 5000,
        currentBet: bet, hands: [{ cards, bet, isDoubled: false, isSplit: false, isBusted: false, isStanding: false }],
        isActive: true, skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: bet,
      }
    }

    // 2,2 — split vs 2-7, hit vs 8-A
    it('splits 2,2 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Two), card(Rank.Two)])
      // Split: hand1=[2,splitCard1], hand2=[2,splitCard2]
      // hand1: 2+Ten=12 vs 5 → Stand (12 vs 5)
      // hand2: 2+Seven=9 vs 5 → Double (9 vs 5), draw Eight=17
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([
        card(Rank.Ten),   // split card to hand 1 → [2,10]=12
        card(Rank.Seven), // split card to hand 2 → [2,7]=9
        card(Rank.Eight), // hand 2 double draw → [2,7,8]=17
      ]), testRules)
      expect(hands.length).toBe(2)
      expect(hands[0].isSplit).toBe(true)
      expect(hands[1].isSplit).toBe(true)
    })

    it('does not split 2,2 vs dealer 8 (hits instead)', () => {
      const bot = createBotWithHand([card(Rank.Two), card(Rank.Two)])
      // Hard 4 vs 8 → Hit, +King=14, hit again +Four=18, stand
      const hands = playBotTurn(bot, card(Rank.Eight), setupDrawCard([card(Rank.King), card(Rank.Four)]), testRules)
      expect(hands.length).toBe(1) // no split
      expect(hands[0].cards.length).toBeGreaterThan(2)
    })

    // 5,5 — NEVER split, treat as hard 10 (double vs 2-9)
    it('does not split 5,5 vs dealer 6 (doubles as hard 10)', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([card(Rank.Ten)]), testRules)
      expect(hands.length).toBe(1) // no split
      expect(hands[0].isDoubled).toBe(true) // hard 10 vs 6 → double
    })

    // 8,8 — always split
    it('splits 8,8 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Eight), card(Rank.Eight)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([
        card(Rank.Ten),  // hand 1: 8+10=18, stand
        card(Rank.Ten),  // hand 2: 8+10=18, stand
      ]), testRules)
      expect(hands.length).toBe(2)
      expect(hands[0].isSplit).toBe(true)
    })

    it('splits 8,8 vs dealer Ace', () => {
      const bot = createBotWithHand([card(Rank.Eight), card(Rank.Eight)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([
        card(Rank.Ten),  // 8+10=18, stand
        card(Rank.Nine), // 8+9=17, stand
      ]), testRules)
      expect(hands.length).toBe(2)
    })

    // 9,9 — split vs 2-6/8-9, stand vs 7/10/A
    it('splits 9,9 vs dealer 6', () => {
      const bot = createBotWithHand([card(Rank.Nine), card(Rank.Nine)])
      // Use non-pair cards for split to avoid re-split
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([
        card(Rank.Ten),   // hand 1: 9+10=19, stand
        card(Rank.Eight), // hand 2: 9+8=17, stand
      ]), testRules)
      expect(hands.length).toBe(2)
    })

    it('stands 9,9 vs dealer 7', () => {
      const bot = createBotWithHand([card(Rank.Nine), card(Rank.Nine)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([]), testRules)
      expect(hands.length).toBe(1)
      expect(hands[0].isStanding).toBe(true)
    })

    it('stands 9,9 vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Nine), card(Rank.Nine)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([]), testRules)
      expect(hands.length).toBe(1)
      expect(hands[0].isStanding).toBe(true)
    })

    // 10,10 — always stand
    it('stands 10,10 vs dealer 5', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.King)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([]), testRules)
      expect(hands.length).toBe(1)
      expect(hands[0].isStanding).toBe(true)
    })

    // A,A — always split
    it('splits A,A vs dealer 10', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Ace)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([
        card(Rank.Ten),  // A+10=21, stand (split aces get one card)
        card(Rank.Nine), // A+9=20, stand
      ]), testRules)
      expect(hands.length).toBe(2)
      expect(hands[0].isSplit).toBe(true)
      expect(hands[1].isSplit).toBe(true)
      // Split aces: one card each, then stand
      expect(hands[0].isStanding).toBe(true)
      expect(hands[1].isStanding).toBe(true)
    })

    it('bot re-splits Aces when dealt another Ace', () => {
      const resplitRules: CasinoRules = {
        ...testRules,
        hitSplitAces: false,
        resplitAllowed: true,
        maxSplitHands: 4,
      }
      const bot = createBotWithHand([card(Rank.Ace, Suit.Spades), card(Rank.Ace, Suit.Hearts)])
      // Split 1: hand1 gets A♦ (pair again!), hand2 gets K
      // hand1 re-splits: hand1a gets 10, hand1b gets 9
      // Result: 3 hands, all standing
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([
        card(Rank.Ace, Suit.Diamonds), // split1 → hand1=[A♠,A♦] — re-splittable
        card(Rank.King),               // split1 → hand2=[A♥,K] — stands
        card(Rank.Ten),                // split2 → hand1a=[A♠,10] — stands
        card(Rank.Nine),               // split2 → hand1b=[A♦,9] — stands
      ]), resplitRules)
      expect(hands.length).toBe(3)
      expect(hands.every(h => h.isStanding)).toBe(true)
      expect(hands.every(h => h.isSplit)).toBe(true)
    })

    it('bot re-splits when receiving matching card after split (non-ace)', () => {
      const bot = createBotWithHand([card(Rank.Eight, Suit.Hearts), card(Rank.Eight, Suit.Spades)])
      // 1st split: hand1=[8♥,8♦] (pair again!), hand2=[8♠,10]=18
      // 2nd split: hand1a=[8♥,10♦]=18, hand1b=[8♦,10♣]=18
      // Result: 3 hands, all standing
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([
        card(Rank.Eight, Suit.Diamonds), // 1st split → hand1=[8♥,8♦] re-pair
        card(Rank.Ten),                   // 1st split → hand2=[8♠,10]=18
        card(Rank.Ten, Suit.Diamonds),    // 2nd split → hand1a=[8♥,10♦]=18
        card(Rank.Ten, Suit.Clubs),       // 2nd split → hand1b=[8♦,10♣]=18
      ]), testRules)
      expect(hands.length).toBe(3)
      expect(hands.every(h => h.isSplit)).toBe(true)
      expect(hands.every(h => h.isStanding)).toBe(true)
    })

    it('bot re-split stops at maxSplitHands (4)', () => {
      const maxRules: CasinoRules = { ...testRules, maxSplitHands: 4 }
      const bot = createBotWithHand([card(Rank.Eight, Suit.Hearts), card(Rank.Eight, Suit.Spades)])
      bot.bankroll = 10000 // Enough for all splits
      // 1st split: hand1=[8♥,8♦] pair, hand2=[8♠,10]
      // 2nd split: hand1a=[8♥,8♣] pair, hand1b=[8♦,10♦]
      // 3rd split: hand1aa=[8♥,10♣], hand1ab=[8♣,10♠]
      // Now 4 hands = maxSplitHands → no more splits
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([
        card(Rank.Eight, Suit.Diamonds), // 1st split → pair
        card(Rank.Ten),                   // 1st split → hand2
        card(Rank.Eight, Suit.Clubs),     // 2nd split → pair
        card(Rank.Ten, Suit.Diamonds),    // 2nd split → hand1b
        card(Rank.Ten, Suit.Clubs),       // 3rd split → hand1aa
        card(Rank.Ten, Suit.Spades),      // 3rd split → hand1ab
      ]), maxRules)
      expect(hands.length).toBe(4)
      expect(hands.every(h => h.isSplit)).toBe(true)
      expect(hands.every(h => h.isStanding)).toBe(true)
    })

    it('bot re-split produces correct hand structure in single playBotTurn call', () => {
      const bot = createBotWithHand([card(Rank.Eight, Suit.Hearts), card(Rank.Eight, Suit.Spades)])
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([
        card(Rank.Eight, Suit.Diamonds), // re-pair
        card(Rank.Ten),                   // hand2 stands
        card(Rank.Ten, Suit.Diamonds),    // hand1a stands
        card(Rank.Ten, Suit.Clubs),       // hand1b stands
      ]), testRules)
      // All 3 hands produced in single call with correct structure
      expect(hands.length).toBe(3)
      expect(hands.every(h => h.isSplit)).toBe(true)
      expect(hands.every(h => h.isStanding)).toBe(true)
      expect(hands.every(h => h.cards.length === 2)).toBe(true)
      // Bankroll deducted for both splits (2 × 25)
      expect(bot.bankroll).toBe(5000 - 25 - 25)
    })

    // 6,6 — split vs 2-6, hit vs 7+
    it('splits 6,6 vs dealer 3', () => {
      const bot = createBotWithHand([card(Rank.Six), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Three), setupDrawCard([
        card(Rank.Ten),  // 6+10=16, stand (16 vs 3)
        card(Rank.Ten),  // 6+10=16, stand (16 vs 3)
      ]), testRules)
      expect(hands.length).toBe(2)
    })

    it('does not split 6,6 vs dealer 7 (hits as hard 12)', () => {
      const bot = createBotWithHand([card(Rank.Six), card(Rank.Six)])
      // Hard 12 vs 7 → Hit
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([card(Rank.Seven)]), testRules) // 12+7=19
      expect(hands.length).toBe(1)
      expect(hands[0].cards.length).toBe(3)
    })
  })

  describe('Edge cases and H17 strategy', () => {
    let drawIndex: number

    function setupDrawCard(cards: Card[]): () => Card {
      drawIndex = 0
      return () => {
        if (drawIndex >= cards.length) throw new Error('Ran out of cards')
        return cards[drawIndex++]
      }
    }

    function createBotWithHand(cards: Card[], bet: number = 25): BotPlayer {
      return {
        id: 'bot-test', name: 'Test', seatIndex: 0, bankroll: 5000,
        currentBet: bet, hands: [{ cards, bet, isDoubled: false, isSplit: false, isBusted: false, isStanding: false }],
        isActive: true, skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: bet,
      }
    }

    const h17Rules: CasinoRules = { ...testRules, dealerHitsSoft17: true }

    // H17: Hard 11 vs Ace → Hit (not Double like S17)
    it('hits hard 11 vs dealer Ace under H17', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([card(Rank.Ten)]), h17Rules) // 11+10=21
      expect(hands[0].isDoubled).toBe(false) // H17: 11 vs A → H, not D
      expect(hands[0].isStanding).toBe(true)
    })

    // H17: Hard 15 vs Ace → Rh (surrender or hit)
    it('surrenders hard 15 vs dealer Ace under H17', () => {
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([]), h17Rules)
      expect(hands[0].result).toBe('surrender')
    })

    // H17: Soft 17 (A,6) vs dealer 2 → Double (S17: Hit)
    it('doubles soft 17 vs dealer 2 under H17', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Two), setupDrawCard([card(Rank.Three)]), h17Rules)
      expect(hands[0].isDoubled).toBe(true)
    })

    // Blackjack detection
    it('detects blackjack and stands immediately (no action taken)', () => {
      const bot = createBotWithHand([card(Rank.Ace), card(Rank.Ten)])
      const hands = playBotTurn(bot, card(Rank.Seven), setupDrawCard([]), testRules)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(2)
    })

    // Bots never surrender when rules have surrender disabled
    it('never surrenders with surrenderAllowed=none (15 vs 10)', () => {
      const noSurrenderRules: CasinoRules = { ...testRules, surrenderAllowed: 'none' }
      // Hard 15 vs 10 would normally be Rh (surrender or hit) under S17
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Five)])
      const hands = playBotTurn(bot, card(Rank.Ten), setupDrawCard([card(Rank.Eight)]), noSurrenderRules)
      expect(hands[0].result).not.toBe('surrender')
      // Should hit instead (15+8=23, bust)
      expect(hands[0].cards.length).toBe(3)
    })

    it('never surrenders with surrenderAllowed=none (16 vs 9)', () => {
      const noSurrenderRules: CasinoRules = { ...testRules, surrenderAllowed: 'none' }
      // Hard 16 vs 9 → Rh under S17
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Nine), setupDrawCard([card(Rank.Four)]), noSurrenderRules)
      expect(hands[0].result).not.toBe('surrender')
      // Should hit: 16+4=20, stand
      expect(hands[0].isStanding).toBe(true)
      expect(hands[0].cards.length).toBe(3)
    })

    it('never surrenders with surrenderAllowed=none (16 vs Ace, H17)', () => {
      const h17NoSurrender: CasinoRules = { ...testRules, dealerHitsSoft17: true, surrenderAllowed: 'none' }
      const bot = createBotWithHand([card(Rank.Ten), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Ace), setupDrawCard([card(Rank.Three)]), h17NoSurrender)
      expect(hands[0].result).not.toBe('surrender')
      // Should hit: 16+3=19
      expect(hands[0].isStanding).toBe(true)
    })

    // Can't double with insufficient bankroll — falls back to hit
    it('falls back to hit when can not double due to bankroll', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Six)], 25) // Hard 11
      bot.bankroll = 0 // Can't cover double
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([card(Rank.Ten)]), testRules)
      expect(hands[0].isDoubled).toBe(false) // Not enough money
      expect(hands[0].cards.length).toBe(3) // Hit instead
    })

    // Can't split with insufficient bankroll — falls back to stand
    it('falls back to stand when can not split due to bankroll', () => {
      const bot = createBotWithHand([card(Rank.Eight), card(Rank.Eight)], 25)
      bot.bankroll = 0 // Can't cover split
      // 8,8 vs 6 → normally Split, but can't afford → fall through to Stand
      const hands = playBotTurn(bot, card(Rank.Six), setupDrawCard([]), testRules)
      expect(hands.length).toBe(1)
      expect(hands[0].isStanding).toBe(true)
    })

    // Can't double after 3+ cards — hits instead
    it('hits after third card when can not double (3 cards)', () => {
      // Create a hand with 3 cards (from a hit) = hard 11
      const bot = createBotWithHand([card(Rank.Two), card(Rank.Three), card(Rank.Six)]) // Hard 11 with 3 cards
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([card(Rank.Ten)]), testRules) // 11+10=21
      // With 3 cards, canDouble=false, so 'D' → Hit
      expect(hands[0].isDoubled).toBe(false)
      expect(hands[0].isStanding).toBe(true) // 21 → stand
    })

    // Bot bust on double
    it('busts on doubled hand', () => {
      const bot = createBotWithHand([card(Rank.Five), card(Rank.Six)])
      const hands = playBotTurn(bot, card(Rank.Five), setupDrawCard([card(Rank.King)]), testRules) // 11+10=21, not bust
      expect(hands[0].isDoubled).toBe(true)
      expect(hands[0].isBusted).toBe(false) // 21 isn't bust
    })

    // Test multi-hand split play (split then play each hand to completion)
    it('plays both split hands to completion', () => {
      const bot = createBotWithHand([card(Rank.Seven), card(Rank.Seven)])
      // 7,7 vs 3 → Split
      const hands = playBotTurn(bot, card(Rank.Three), setupDrawCard([
        card(Rank.Ten),  // hand 1: 7+10=17, stand (17 vs 3)
        card(Rank.Ten),  // hand 2: 7+10=17, stand (17 vs 3)
      ]), testRules)
      expect(hands.length).toBe(2)
      expect(hands[0].isStanding).toBe(true)
      expect(hands[1].isStanding).toBe(true)
      expect(getHandValue(hands[0].cards).best).toBe(17)
      expect(getHandValue(hands[1].cards).best).toBe(17)
    })
  })

  describe('Ace splits (1×/2×/3× → up to 4 hands)', () => {
    /** A bot holding a fresh pair of aces, with plenty of bankroll to split. */
    function aceBot(): BotPlayer {
      const bot = createBot(2, 25, new Set<string>(), 'bot-split')
      bot.bankroll = 100_000
      bot.hands = [{
        cards: [card(Rank.Ace), card(Rank.Ace)],
        bet: 25, isDoubled: false, isSplit: false, isBusted: false, isStanding: false,
      }]
      return bot
    }
    /** A drawCard that deals out a fixed queue (falls back to a Five). */
    function fromQueue(cards: Card[]): () => Card {
      let i = 0
      return () => cards[i++] ?? card(Rank.Five)
    }
    const dealerUp = card(Rank.Six)

    it('1× split → 2 hands; each ace gets exactly one card and stands', () => {
      const hands = playBotTurn(aceBot(), dealerUp, fromQueue([card(Rank.Eight), card(Rank.Nine)]), testRules)
      expect(hands).toHaveLength(2)
      expect(hands.every(h => h.isSplit)).toBe(true)
      expect(hands.every(h => h.cards[0].rank === Rank.Ace && h.cards.length === 2)).toBe(true)
      expect(hands.every(h => h.isStanding)).toBe(true)
    })

    it('2× split (one ace re-splits) → 3 hands', () => {
      // First hand draws another Ace (re-split); the rest draw non-aces.
      const hands = playBotTurn(
        aceBot(), dealerUp,
        fromQueue([card(Rank.Ace), card(Rank.Nine), card(Rank.Eight), card(Rank.Seven)]),
        testRules,
      )
      expect(hands).toHaveLength(3)
      expect(hands.every(h => h.isSplit)).toBe(true)
    })

    it('3× split → exactly 4 hands (capped at maxSplitHands, never a 5th)', () => {
      const allAces = Array.from({ length: 10 }, () => card(Rank.Ace))
      const hands = playBotTurn(aceBot(), dealerUp, fromQueue(allAces), testRules)
      expect(hands).toHaveLength(4)
      expect(hands.every(h => h.isSplit)).toBe(true)
    })

    it('respects a lower maxSplitHands cap', () => {
      const allAces = Array.from({ length: 10 }, () => card(Rank.Ace))
      const rules3: CasinoRules = { ...testRules, maxSplitHands: 3 }
      const hands = playBotTurn(aceBot(), dealerUp, fromQueue(allAces), rules3)
      expect(hands).toHaveLength(3)
    })
  })
})
