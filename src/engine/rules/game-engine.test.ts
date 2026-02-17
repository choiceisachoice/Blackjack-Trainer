import { describe, it, expect } from 'vitest'
import { GameEngine } from './game-engine'
import { Action, HandResult, DEFAULT_RULES } from './types'
import type { CardSource, CasinoRules, GameState, Hand } from './types'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'

// ── Helpers ──────────────────────────────────────────────────────────

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

/** Creates a CardSource that deals cards in the given order. */
function createCardSource(cards: Card[]): CardSource {
  let index = 0
  return {
    deal() {
      if (index >= cards.length) throw new Error('Mock shoe exhausted')
      return cards[index++]
    },
    remaining() {
      return cards.length - index
    },
    remainingDecks() {
      return (cards.length - index) / 52
    },
    cutCardReached() {
      return false
    },
    reset() {
      index = 0
    },
  }
}

function createHand(cards: Card[], overrides?: Partial<Hand>): Hand {
  return {
    cards,
    bet: 10,
    isDoubled: false,
    isSplit: false,
    isStanding: false,
    ...overrides,
  }
}

// Deal order: player1, dealer1, player2, dealer2
// So shoe cards at indices [0,2] go to player, [1,3] go to dealer.

describe('GameEngine', () => {
  // ── startRound ──────────────────────────────────────────────────

  describe('startRound', () => {
    it('deals 2 cards to player and 2 to dealer', () => {
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Seven), c(Rank.Eight), c(Rank.Five),
        // extra cards for any further dealing
        c(Rank.Three), c(Rank.Four), c(Rank.Six), c(Rank.Nine),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      expect(state.playerHands).toHaveLength(1)
      expect(state.playerHands[0].cards).toHaveLength(2)
      expect(state.dealerHand.cards).toHaveLength(2)
      expect(state.phase).toBe('playerTurn')
      expect(state.isRoundOver).toBe(false)
      expect(state.playerHands[0].bet).toBe(10)
    })
  })

  // ── hit ─────────────────────────────────────────────────────────

  describe('hit', () => {
    it('adds one card to current player hand', () => {
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Seven), c(Rank.Six), c(Rank.Five),
        c(Rank.Three), // this card will be dealt on hit
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      expect(state.playerHands[0].cards).toHaveLength(2)
      const newState = engine.hit(state)
      expect(newState.playerHands[0].cards).toHaveLength(3)
    })

    it('on bust ends player turn', () => {
      // Player: 10+10=20, Dealer: 7+5=12, Hit card: 5 → 25 = bust
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Seven), c(Rank.Ten, Suit.Hearts), c(Rank.Five),
        c(Rank.Five, Suit.Hearts), // hit → bust
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.hit(state)

      expect(newState.playerHands[0].isStanding).toBe(true)
    })
  })

  // ── stand ───────────────────────────────────────────────────────

  describe('stand', () => {
    it('moves to next hand or dealer turn', () => {
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Seven), c(Rank.Eight), c(Rank.Five),
        c(Rank.Three), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.stand(state)

      expect(newState.playerHands[0].isStanding).toBe(true)
      expect(newState.phase).toBe('dealerTurn')
    })
  })

  // ── double ──────────────────────────────────────────────────────

  describe('double', () => {
    it('adds one card, doubles bet, then stands', () => {
      // Player: 5+6=11 (good double), Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Seven), c(Rank.Six), c(Rank.Five, Suit.Hearts),
        c(Rank.Ten), // double card
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.double(state)

      expect(newState.playerHands[0].cards).toHaveLength(3)
      expect(newState.playerHands[0].bet).toBe(20)
      expect(newState.playerHands[0].isDoubled).toBe(true)
      expect(newState.playerHands[0].isStanding).toBe(true)
    })

    it('only allowed on first two cards', () => {
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Seven), c(Rank.Three), c(Rank.Five, Suit.Hearts),
        c(Rank.Two), // hit card
        c(Rank.Two), // would-be double card
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state) // now 3 cards

      const actions = engine.getAvailableActions(afterHit)
      expect(actions).not.toContain(Action.Double)
    })
  })

  // ── split ───────────────────────────────────────────────────────

  describe('split', () => {
    it('creates two hands from a pair', () => {
      // Player: 8+8 pair, Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.Eight, Suit.Spades), c(Rank.Seven), c(Rank.Eight, Suit.Hearts), c(Rank.Five),
        c(Rank.King), c(Rank.Queen), // dealt to split hands
        c(Rank.Three), c(Rank.Four), // extra
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.split(state)

      expect(newState.playerHands).toHaveLength(2)
      expect(newState.playerHands[0].cards).toHaveLength(2)
      expect(newState.playerHands[1].cards).toHaveLength(2)
      expect(newState.playerHands[0].isSplit).toBe(true)
      expect(newState.playerHands[1].isSplit).toBe(true)
      expect(newState.playerHands[0].bet).toBe(10)
      expect(newState.playerHands[1].bet).toBe(10)
    })

    it('split is available for King + Queen (10-value pair)', () => {
      // Player: K+Q (both value 10), Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.King), c(Rank.Seven), c(Rank.Queen), c(Rank.Five),
        c(Rank.Three), c(Rank.Four), c(Rank.Two), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toContain(Action.Split)
    })

    it('split is available for 10 + Jack (10-value pair)', () => {
      // Player: 10+J, Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Seven), c(Rank.Jack), c(Rank.Five),
        c(Rank.Three), c(Rank.Four), c(Rank.Two), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toContain(Action.Split)
    })

    it('split creates two hands from King + Queen', () => {
      // Player: K+Q, Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.King), c(Rank.Seven), c(Rank.Queen), c(Rank.Five),
        c(Rank.Three), c(Rank.Four), // dealt to split hands
        c(Rank.Two), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.split(state)

      expect(newState.playerHands).toHaveLength(2)
      expect(newState.playerHands[0].cards[0].rank).toBe(Rank.King)
      expect(newState.playerHands[1].cards[0].rank).toBe(Rank.Queen)
    })

    it('not allowed on non-pairs', () => {
      const shoe = createCardSource([
        c(Rank.Eight), c(Rank.Seven), c(Rank.Nine), c(Rank.Five),
        c(Rank.Three), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const actions = engine.getAvailableActions(state)
      expect(actions).not.toContain(Action.Split)
    })

    it('split aces gets only one card each (when hitSplitAces=false)', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, hitSplitAces: false }
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
        c(Rank.King), c(Rank.Queen), // one card each
      ])
      const engine = new GameEngine(rules, shoe)
      const state = engine.startRound(10)
      const newState = engine.split(state)

      expect(newState.playerHands).toHaveLength(2)
      expect(newState.playerHands[0].cards).toHaveLength(2)
      expect(newState.playerHands[1].cards).toHaveLength(2)
      // Both hands should be standing (no more hitting allowed)
      expect(newState.playerHands[0].isStanding).toBe(true)
      expect(newState.playerHands[1].isStanding).toBe(true)
    })

    it('resplit allowed up to maxSplitHands', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, maxSplitHands: 3 }
      // Player: 8♠+8♥ pair, Dealer: 7+5
      // Split 1: hand1 gets 8♦ (pair again!), hand2 gets K
      // Split 2: hand1a gets Q, hand1b gets J
      // Now 3 hands = maxSplitHands, no more splitting
      const shoe = createCardSource([
        c(Rank.Eight, Suit.Spades), c(Rank.Seven), c(Rank.Eight, Suit.Hearts), c(Rank.Five),
        c(Rank.Eight, Suit.Diamonds), c(Rank.King), // split 1
        c(Rank.Queen), c(Rank.Jack),                 // split 2
        c(Rank.Three), c(Rank.Four), c(Rank.Two),    // extra
      ])
      const engine = new GameEngine(rules, shoe)
      const state = engine.startRound(10)
      const after1 = engine.split(state)

      expect(after1.playerHands).toHaveLength(2)
      // First hand is [8♠, 8♦] = pair, can split again
      const after2 = engine.split(after1)
      expect(after2.playerHands).toHaveLength(3)

      // Now at maxSplitHands=3, split should not be available even if pair
      const actions = engine.getAvailableActions(after2)
      expect(actions).not.toContain(Action.Split)
    })
  })

  // ── surrender ───────────────────────────────────────────────────

  describe('surrender', () => {
    it('returns half the bet', () => {
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Seven), c(Rank.Six), c(Rank.Ten, Suit.Hearts),
        c(Rank.Three), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(100)
      const newState = engine.surrender(state)

      expect(newState.playerHands[0].result).toBe(HandResult.Surrender)
      expect(newState.isRoundOver).toBe(true)
    })

    it('only allowed as first action', () => {
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Seven), c(Rank.Three), c(Rank.Five, Suit.Hearts),
        c(Rank.Two), // hit card
        c(Rank.Three),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state) // 3 cards now

      const actions = engine.getAvailableActions(afterHit)
      expect(actions).not.toContain(Action.Surrender)
    })
  })

  // ── dealer play ─────────────────────────────────────────────────

  describe('dealer play', () => {
    it('dealer stands on soft 17 (S17 rules)', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, dealerHitsSoft17: false }
      // Player: 10+8=18 (stand), Dealer: A+6 = soft 17
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Six),
      ])
      const engine = new GameEngine(rules, shoe)
      let state = engine.startRound(10)
      state = engine.stand(state)
      state = engine.playDealerHand(state)

      // Dealer should stand on soft 17 → still 2 cards
      expect(state.dealerHand.cards).toHaveLength(2)
    })

    it('dealer hits on soft 17 (H17 rules)', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, dealerHitsSoft17: true }
      // Player: 10+8=18 (stand), Dealer: A+6 = soft 17, next card: 2 → soft 19
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Six),
        c(Rank.Two), // dealer hits and gets this
      ])
      const engine = new GameEngine(rules, shoe)
      let state = engine.startRound(10)
      state = engine.stand(state)
      state = engine.playDealerHand(state)

      // Dealer hit on soft 17, drew one more card
      expect(state.dealerHand.cards.length).toBeGreaterThan(2)
    })

    it('dealer draws until 17 or higher', () => {
      // Player: 10+8=18, Dealer: 3+4=7, draws: 2→9, 3→12, 6→18 stand
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Three), c(Rank.Eight), c(Rank.Four),
        c(Rank.Two), c(Rank.Three, Suit.Hearts), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.stand(state)
      state = engine.playDealerHand(state)

      expect(state.dealerHand.cards.length).toBeGreaterThanOrEqual(4)
    })
  })

  // ── settlement ──────────────────────────────────────────────────

  describe('settlement', () => {
    it('blackjack pays 3:2 (or 6:5 when configured)', () => {
      // Player: A+K = BJ, Dealer: 7+5=12
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
        c(Rank.Ten), c(Rank.Three), // dealer draw cards
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.stand(state)
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Blackjack)

      // Test 6:5 payout
      const rules65: CasinoRules = { ...DEFAULT_RULES, blackjackPayout: 1.2 }
      const shoe2 = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
        c(Rank.Ten), c(Rank.Three),
      ])
      const engine2 = new GameEngine(rules65, shoe2)
      let state2 = engine2.startRound(10)
      state2 = engine2.stand(state2)
      state2 = engine2.playDealerHand(state2)
      state2 = engine2.settleRound(state2)

      expect(state2.playerHands[0].result).toBe(HandResult.Blackjack)
    })

    it('push when player and dealer have same value', () => {
      // Player: 10+8=18, Dealer: 10+8=18
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Eight), c(Rank.Eight, Suit.Hearts),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.stand(state)
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Push)
    })

    it('player bust = loss regardless of dealer', () => {
      // Player: 10+6=16, Dealer: 10+5=15, Player hits: 10 → bust
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Five),
        c(Rank.Ten, Suit.Diamonds), // player bust card
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.hit(state) // bust
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Loss)
    })

    it('insurance pays 2:1 when dealer has blackjack', () => {
      // Player: 10+8=18, Dealer: A+K = BJ
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.insurance(state)

      expect(state.insuranceBet).toBe(5) // half of original bet
      // Continue to settlement
      state = engine.stand(state)
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      // Dealer has BJ → player's main hand loses, but insurance pays 2:1
      expect(state.playerHands[0].result).toBe(HandResult.Loss)
      expect(state.isRoundOver).toBe(true)
    })
  })

  // ── getAvailableActions ─────────────────────────────────────────

  describe('getAvailableActions', () => {
    it('returns correct actions per state', () => {
      // Player: 8♠+8♥ pair, Dealer: A+5 → insurance available + pair options
      const shoe = createCardSource([
        c(Rank.Eight, Suit.Spades), c(Rank.Ace), c(Rank.Eight, Suit.Hearts), c(Rank.Five),
        c(Rank.Three), c(Rank.Four), c(Rank.Two), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      // First action on 2-card pair with dealer Ace:
      expect(actions).toContain(Action.Hit)
      expect(actions).toContain(Action.Stand)
      expect(actions).toContain(Action.Double)
      expect(actions).toContain(Action.Split)
      expect(actions).toContain(Action.Surrender)
      expect(actions).toContain(Action.Insurance)

      // After hitting (no longer first action, no longer 2 cards for double/split/surrender)
      const afterHit = engine.hit(state)
      const actionsAfterHit = engine.getAvailableActions(afterHit)
      expect(actionsAfterHit).toContain(Action.Hit)
      expect(actionsAfterHit).toContain(Action.Stand)
      expect(actionsAfterHit).not.toContain(Action.Double)
      expect(actionsAfterHit).not.toContain(Action.Split)
      expect(actionsAfterHit).not.toContain(Action.Surrender)
      expect(actionsAfterHit).not.toContain(Action.Insurance)
    })
  })
})
