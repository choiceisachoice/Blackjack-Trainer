import { describe, it, expect } from 'vitest'
import { getOptimalAction } from '../strategy/basic-strategy'
import { Action, DEFAULT_RULES } from '../rules/types'
import type { CasinoRules } from '../rules/types'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'
import { CasinoSessionEngine } from './session-engine'
import { playBotTurn } from './bot-player'
import type { BotHand, BotPlayer, CasinoSessionConfig } from './types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

/** Dealer card ranks for iteration */
const DEALER_RANKS = [
  Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
  Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Ace,
]

/** S17 rules with surrender allowed */
const S17: CasinoRules = {
  ...DEFAULT_RULES,
  dealerHitsSoft17: false,
  surrenderAllowed: 'late',
}

/** S17 rules WITHOUT surrender */
const S17_NO_SURR: CasinoRules = {
  ...DEFAULT_RULES,
  dealerHitsSoft17: false,
  surrenderAllowed: 'none',
}

/** Helper to build two cards that make a hard total (no ace, no pair). */
function hardHand(total: number): Card[] {
  if (total <= 11) {
    return [c(Rank.Two), c(rankForValue(total - 2))]
  }
  // For 12-20, use a face card (10) + remainder
  return [c(Rank.Ten), c(rankForValue(total - 10))]
}

/** Alternate hard hand to avoid pairs when needed. */
function hardHandAlt(total: number): Card[] {
  if (total <= 11) {
    return [c(Rank.Three), c(rankForValue(total - 3))]
  }
  // Use Jack + remainder
  return [c(Rank.Jack), c(rankForValue(total - 10))]
}

function rankForValue(val: number): Rank {
  switch (val) {
    case 2: return Rank.Two
    case 3: return Rank.Three
    case 4: return Rank.Four
    case 5: return Rank.Five
    case 6: return Rank.Six
    case 7: return Rank.Seven
    case 8: return Rank.Eight
    case 9: return Rank.Nine
    case 10: return Rank.Queen // use Queen to avoid pair with Ten
    default: return Rank.Five
  }
}

// ── Comprehensive Hard Hand Strategy Table ─────────────────────

describe('BS Validation: Hard Hands (S17, 2-card)', () => {
  // Expected actions: [dealerRank, expectedAction]
  // These match the S17 table exactly
  const hardExpectations: [number, Rank, Action][] = [
    // Hard 8: always hit
    ...[Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
      Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Ace]
      .map(d => [8, d, Action.Hit] as [number, Rank, Action]),

    // Hard 9: double vs 3-6, hit vs rest
    [9, Rank.Two, Action.Hit],
    [9, Rank.Three, Action.Double],
    [9, Rank.Four, Action.Double],
    [9, Rank.Five, Action.Double],
    [9, Rank.Six, Action.Double],
    [9, Rank.Seven, Action.Hit],
    [9, Rank.Eight, Action.Hit],
    [9, Rank.Nine, Action.Hit],
    [9, Rank.Ten, Action.Hit],
    [9, Rank.Ace, Action.Hit],

    // Hard 10: double vs 2-9, hit vs 10,A
    [10, Rank.Two, Action.Double],
    [10, Rank.Three, Action.Double],
    [10, Rank.Four, Action.Double],
    [10, Rank.Five, Action.Double],
    [10, Rank.Six, Action.Double],
    [10, Rank.Seven, Action.Double],
    [10, Rank.Eight, Action.Double],
    [10, Rank.Nine, Action.Double],
    [10, Rank.Ten, Action.Hit],
    [10, Rank.Ace, Action.Hit],

    // Hard 11: double vs all (S17)
    ...[Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
      Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Ace]
      .map(d => [11, d, Action.Double] as [number, Rank, Action]),

    // Hard 12: hit vs 2-3, stand vs 4-6, hit vs 7-A
    [12, Rank.Two, Action.Hit],
    [12, Rank.Three, Action.Hit],
    [12, Rank.Four, Action.Stand],
    [12, Rank.Five, Action.Stand],
    [12, Rank.Six, Action.Stand],
    [12, Rank.Seven, Action.Hit],
    [12, Rank.Eight, Action.Hit],
    [12, Rank.Nine, Action.Hit],
    [12, Rank.Ten, Action.Hit],
    [12, Rank.Ace, Action.Hit],

    // Hard 13: stand vs 2-6, hit vs 7-A
    [13, Rank.Two, Action.Stand],
    [13, Rank.Three, Action.Stand],
    [13, Rank.Four, Action.Stand],
    [13, Rank.Five, Action.Stand],
    [13, Rank.Six, Action.Stand],
    [13, Rank.Seven, Action.Hit],
    [13, Rank.Eight, Action.Hit],
    [13, Rank.Nine, Action.Hit],
    [13, Rank.Ten, Action.Hit],
    [13, Rank.Ace, Action.Hit],

    // Hard 14: stand vs 2-6, hit vs 7-A
    [14, Rank.Two, Action.Stand],
    [14, Rank.Three, Action.Stand],
    [14, Rank.Four, Action.Stand],
    [14, Rank.Five, Action.Stand],
    [14, Rank.Six, Action.Stand],
    [14, Rank.Seven, Action.Hit],
    [14, Rank.Eight, Action.Hit],
    [14, Rank.Nine, Action.Hit],
    [14, Rank.Ten, Action.Hit],
    [14, Rank.Ace, Action.Hit],

    // Hard 15: stand vs 2-6, hit vs 7-9,A, surrender vs 10 (→ hit if no surrender)
    [15, Rank.Two, Action.Stand],
    [15, Rank.Three, Action.Stand],
    [15, Rank.Four, Action.Stand],
    [15, Rank.Five, Action.Stand],
    [15, Rank.Six, Action.Stand],
    [15, Rank.Seven, Action.Hit],
    [15, Rank.Eight, Action.Hit],
    [15, Rank.Nine, Action.Hit],
    [15, Rank.Ten, Action.Surrender], // Rh with surrender
    [15, Rank.Ace, Action.Hit],

    // Hard 16: stand vs 2-6, hit vs 7-8, surrender vs 9,10,A (→ hit if no surrender)
    [16, Rank.Two, Action.Stand],
    [16, Rank.Three, Action.Stand],
    [16, Rank.Four, Action.Stand],
    [16, Rank.Five, Action.Stand],
    [16, Rank.Six, Action.Stand],
    [16, Rank.Seven, Action.Hit],
    [16, Rank.Eight, Action.Hit],
    [16, Rank.Nine, Action.Surrender], // Rh with surrender
    [16, Rank.Ten, Action.Surrender], // Rh with surrender
    [16, Rank.Ace, Action.Surrender], // Rh with surrender

    // Hard 17+: always stand
    ...[17, 18, 19, 20].flatMap(total =>
      [Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six,
        Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten, Rank.Ace]
        .map(d => [total, d, Action.Stand] as [number, Rank, Action]),
    ),
  ]

  for (const [total, dealerRank, expected] of hardExpectations) {
    const hand = total === 10 && dealerRank === Rank.Ten
      ? [c(Rank.Four), c(Rank.Six)] // avoid pair with 10
      : hardHand(total)
    const actionName = expected === Action.Hit ? 'hit'
      : expected === Action.Stand ? 'stand'
      : expected === Action.Double ? 'double'
      : expected === Action.Surrender ? 'surrender' : '??'

    it(`hard ${total} vs ${dealerRank} → ${actionName}`, () => {
      expect(getOptimalAction(hand, c(dealerRank), S17)).toBe(expected)
    })
  }
})

describe('BS Validation: Hard 15/16 without surrender (S17)', () => {
  it('hard 15 vs 10 → hit (no surrender available)', () => {
    const hand = [c(Rank.Five), c(Rank.Queen)]
    expect(getOptimalAction(hand, c(Rank.Jack), S17_NO_SURR)).toBe(Action.Hit)
  })

  it('hard 15 vs 10 → hit (face card dealer)', () => {
    const hand = [c(Rank.Five), c(Rank.King)]
    expect(getOptimalAction(hand, c(Rank.Ten), S17_NO_SURR)).toBe(Action.Hit)
  })

  it('hard 16 vs 9 → hit (no surrender)', () => {
    const hand = [c(Rank.Six), c(Rank.Jack)]
    expect(getOptimalAction(hand, c(Rank.Nine), S17_NO_SURR)).toBe(Action.Hit)
  })

  it('hard 16 vs 10 → hit (no surrender)', () => {
    const hand = [c(Rank.Six), c(Rank.Queen)]
    expect(getOptimalAction(hand, c(Rank.Ten), S17_NO_SURR)).toBe(Action.Hit)
  })

  it('hard 16 vs A → hit (no surrender)', () => {
    const hand = [c(Rank.Six), c(Rank.King)]
    expect(getOptimalAction(hand, c(Rank.Ace), S17_NO_SURR)).toBe(Action.Hit)
  })
})

// ── Settlement Logic Tests ─────────────────────────────────────

describe('BS Validation: Settlement Logic', () => {
  function createEngine(): CasinoSessionEngine {
    const config: CasinoSessionConfig = {
      sessionMode: 'hands',
      targetHands: 10,
      targetMinutes: 30,
      numBots: 0,
      playerSeatIndex: 2,
      startingBankroll: 1000,
      minBet: 25,
      maxBet: 500,
      numDecks: 6,
      dealerHitsSoft17: false,
      doubleAfterSplit: true,
      surrenderAllowed: true,
      blackjackPays: 1.5,
      penetration: 0.75,
      maxSplitHands: 4,
      trainingMode: false,
      countCheckFrequency: 'never',
      showDeviationHints: false,
      countingSystem: 'HiLo' as CasinoSessionConfig['countingSystem'],
      casinoAmbience: false,
    }
    return new CasinoSessionEngine(config)
  }

  it('player 14 vs dealer bust 23 → win (not loss)', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Four), c(Rank.Ten)]
    const dealerCards = [c(Rank.Ten), c(Rank.Six), c(Rank.Seven)] // 23 bust
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('win')
    expect(profit).toBe(25)
  })

  it('player bust 24 vs dealer bust 23 → loss (player bust always loses)', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Ten), c(Rank.Six), c(Rank.Eight)] // 24
    const dealerCards = [c(Rank.Ten), c(Rank.Six), c(Rank.Seven)] // 23
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('loss')
    expect(profit).toBe(-25)
  })

  it('player 20 vs dealer 20 → push', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Ten), c(Rank.Queen)]
    const dealerCards = [c(Rank.King), c(Rank.Jack)]
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('push')
    expect(profit).toBe(0)
  })

  it('player BJ vs dealer 21 → blackjack (not push)', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Ace), c(Rank.King)]
    const dealerCards = [c(Rank.Ten), c(Rank.Five), c(Rank.Six)] // 21 but not BJ
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('blackjack')
    expect(profit).toBe(37.5) // 25 * 1.5
  })

  it('player BJ vs dealer BJ → push', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Ace), c(Rank.King)]
    const dealerCards = [c(Rank.Ace), c(Rank.Queen)]
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('push')
    expect(profit).toBe(0)
  })

  it('player 18 vs dealer 17 → win', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Ten), c(Rank.Eight)]
    const dealerCards = [c(Rank.Ten), c(Rank.Seven)]
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('win')
    expect(profit).toBe(25)
  })

  it('player 15 vs dealer 17 → loss', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Five), c(Rank.Ten)]
    const dealerCards = [c(Rank.Ten), c(Rank.Seven)]
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 25, false, false)
    expect(result).toBe('loss')
    expect(profit).toBe(-25)
  })

  it('surrender → surrender result with half bet loss', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Six), c(Rank.Ten)]
    const dealerCards = [c(Rank.Ten), c(Rank.Seven)]
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 100, false, true)
    expect(result).toBe('surrender')
    expect(profit).toBe(-50)
  })

  it('surrender flag overrides everything else', () => {
    const engine = createEngine()
    // Even if player has 21, surrender flag wins
    const playerCards = [c(Rank.Ten), c(Rank.Ace)]
    const dealerCards = [c(Rank.Ten), c(Rank.Seven)]
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 100, false, true)
    expect(result).toBe('surrender')
    expect(profit).toBe(-50)
  })
})

// ── Bot Surrender Handling ─────────────────────────────────────

describe('BS Validation: Bot Surrender Handling', () => {
  function createBotHand(cards: Card[], bet: number): BotHand {
    return {
      cards,
      bet,
      isDoubled: false,
      isSplit: false,
      isBusted: false,
      isStanding: false,
    }
  }

  function createBot(cards: Card[], bet: number = 100): BotPlayer {
    return {
      id: 'test-bot',
      name: 'TestBot',
      seatIndex: 0,
      bankroll: 1000,
      currentBet: bet,
      hands: [createBotHand(cards, bet)],
      isActive: true,
      skillLevel: 'basic_strategy',
      bettingPattern: 'flat',
      flatBetAmount: bet,
    }
  }

  it('bot with hard 15 vs 10 surrenders when allowed', () => {
    const bot = createBot([c(Rank.Five), c(Rank.Queen)])
    const dealerUpCard = c(Rank.Jack)
    const hands = playBotTurn(bot, dealerUpCard, () => c(Rank.Two), S17)
    expect(hands[0].result).toBe('surrender')
    expect(hands[0].isStanding).toBe(true)
    // No extra cards drawn
    expect(hands[0].cards.length).toBe(2)
  })

  it('bot with hard 15 vs 10 hits when surrender not allowed', () => {
    const bot = createBot([c(Rank.Five), c(Rank.Queen)])
    const dealerUpCard = c(Rank.Jack)
    const hands = playBotTurn(bot, dealerUpCard, () => c(Rank.Two), S17_NO_SURR)
    // Bot should hit, getting a card
    expect(hands[0].result).not.toBe('surrender')
    expect(hands[0].cards.length).toBeGreaterThan(2)
  })

  it('bot with hard 16 vs 9 surrenders when allowed', () => {
    const bot = createBot([c(Rank.Six), c(Rank.Jack)])
    const dealerUpCard = c(Rank.Nine)
    const hands = playBotTurn(bot, dealerUpCard, () => c(Rank.Two), S17)
    expect(hands[0].result).toBe('surrender')
  })

  it('bot with hard 16 vs 9 hits when surrender not allowed', () => {
    const bot = createBot([c(Rank.Six), c(Rank.Jack)])
    const dealerUpCard = c(Rank.Nine)
    const hands = playBotTurn(bot, dealerUpCard, () => c(Rank.Two), S17_NO_SURR)
    expect(hands[0].result).not.toBe('surrender')
    expect(hands[0].cards.length).toBeGreaterThan(2)
  })

  it('bot that stands on 13 vs 6 gets result from settlement not surrender', () => {
    const bot = createBot([c(Rank.Six), c(Rank.Seven)], 100)
    const dealerUpCard = c(Rank.Six)
    const hands = playBotTurn(bot, dealerUpCard, () => c(Rank.Two), S17)
    // Bot should stand (13 vs 6 = stand)
    expect(hands[0].isStanding).toBe(true)
    expect(hands[0].cards.length).toBe(2)
    expect(hands[0].result).toBeUndefined() // No result set during play
  })
})

// ── Bot Settlement vs Recording Consistency ────────────────────

describe('BS Validation: Bot Settlement Consistency', () => {
  function createEngine(): CasinoSessionEngine {
    const config: CasinoSessionConfig = {
      sessionMode: 'hands',
      targetHands: 10,
      targetMinutes: 30,
      numBots: 0,
      playerSeatIndex: 2,
      startingBankroll: 1000,
      minBet: 25,
      maxBet: 500,
      numDecks: 6,
      dealerHitsSoft17: false,
      doubleAfterSplit: true,
      surrenderAllowed: true,
      blackjackPays: 1.5,
      penetration: 0.75,
      maxSplitHands: 4,
      trainingMode: false,
      countCheckFrequency: 'never',
      showDeviationHints: false,
      countingSystem: 'HiLo' as CasinoSessionConfig['countingSystem'],
      casinoAmbience: false,
    }
    return new CasinoSessionEngine(config)
  }

  it('bot settlement for surrender has half-bet profit', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Six), c(Rank.Ten)]
    const dealerCards = [c(Rank.Nine), c(Rank.Eight)]
    // isSurrendered = true
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 100, false, true)
    expect(result).toBe('surrender')
    expect(profit).toBe(-50)
  })

  it('bot standing on 15 vs dealer 17 gets loss not surrender', () => {
    const engine = createEngine()
    const playerCards = [c(Rank.Five), c(Rank.Ten)]
    const dealerCards = [c(Rank.Ten), c(Rank.Seven)]
    // isSurrendered = false (bot stood, did NOT surrender)
    const { result, profit } = engine.settleHand(playerCards, dealerCards, 100, false, false)
    expect(result).toBe('loss')
    expect(profit).toBe(-100)
  })
})

// ── Refill Bot Bankroll Conditional ────────────────────────────

describe('BS Validation: Bot identity stability', () => {
  function createEngine(): CasinoSessionEngine {
    const config: CasinoSessionConfig = {
      sessionMode: 'hands',
      targetHands: 10,
      targetMinutes: 30,
      numBots: 2,
      playerSeatIndex: 2,
      startingBankroll: 1000,
      minBet: 25,
      maxBet: 500,
      numDecks: 6,
      dealerHitsSoft17: false,
      doubleAfterSplit: true,
      surrenderAllowed: true,
      blackjackPays: 1.5,
      penetration: 0.75,
      maxSplitHands: 4,
      trainingMode: false,
      countCheckFrequency: 'never',
      showDeviationHints: false,
      countingSystem: 'HiLo' as CasinoSessionConfig['countingSystem'],
      casinoAmbience: false,
    }
    return new CasinoSessionEngine(config)
  }

  it('bots keep same name across rounds when bankroll is sufficient', () => {
    const engine = createEngine()
    const dr1 = engine.dealNewRound()
    const seats1 = engine.getSeats()
    const botNames1 = seats1.filter(s => s !== null).map(s => s!.name)

    // Give bots enough bankroll to survive
    for (const s of engine.getSeats()) {
      if (s) s.bankroll = 5000
    }

    const dr2 = engine.dealNewRound()
    const seats2 = engine.getSeats()
    const botNames2 = seats2.filter(s => s !== null).map(s => s!.name)

    expect(botNames1).toEqual(botNames2)
  })
})
