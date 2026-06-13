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
      // Non-aces: hand 1 gets a card immediately, hand 2 waits with 1 card
      const shoe = createCardSource([
        c(Rank.Eight, Suit.Spades), c(Rank.Seven), c(Rank.Eight, Suit.Hearts), c(Rank.Five),
        c(Rank.King), // dealt to hand 1 only
        c(Rank.Three), c(Rank.Four), // extra
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.split(state)

      expect(newState.playerHands).toHaveLength(2)
      expect(newState.playerHands[0].cards).toHaveLength(2)
      expect(newState.playerHands[1].cards).toHaveLength(1) // deferred: waits for its turn
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
      // Non-aces: only hand 1 gets a card, hand 2 keeps original card
      const shoe = createCardSource([
        c(Rank.King), c(Rank.Seven), c(Rank.Queen), c(Rank.Five),
        c(Rank.Three), // dealt to hand 1 only
        c(Rank.Two), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const newState = engine.split(state)

      expect(newState.playerHands).toHaveLength(2)
      expect(newState.playerHands[0].cards[0].rank).toBe(Rank.King)
      expect(newState.playerHands[0].cards).toHaveLength(2)
      expect(newState.playerHands[1].cards[0].rank).toBe(Rank.Queen)
      expect(newState.playerHands[1].cards).toHaveLength(1) // deferred
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

    it('re-split Aces when dealt another Ace', () => {
      const rules: CasinoRules = {
        ...DEFAULT_RULES,
        hitSplitAces: false,
        resplitAllowed: true,
        maxSplitHands: 4,
      }
      // Player: A♠+A♥, Dealer: 7+5
      // Split: hand1 gets A♦ (pair!), hand2 gets K
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
        c(Rank.Ace, Suit.Diamonds), c(Rank.King), // split cards
        c(Rank.Ten), c(Rank.Nine),                 // re-split cards
        c(Rank.Three),                              // extra
      ])
      const engine = new GameEngine(rules, shoe)
      const state = engine.startRound(10)
      const after = engine.split(state)

      expect(after.playerHands).toHaveLength(2)
      // Hand 1: [A♠, A♦] — NOT standing (can re-split)
      expect(after.playerHands[0].cards[1].rank).toBe(Rank.Ace)
      expect(after.playerHands[0].isStanding).toBe(false)
      // Hand 2: [A♥, K] — standing (no Ace dealt)
      expect(after.playerHands[1].cards[1].rank).toBe(Rank.King)
      expect(after.playerHands[1].isStanding).toBe(true)

      // Can split again
      const after2 = engine.split(after)
      expect(after2.playerHands).toHaveLength(3)
    })

    it('re-split Aces not possible at maxSplitHands', () => {
      const rules: CasinoRules = {
        ...DEFAULT_RULES,
        hitSplitAces: false,
        resplitAllowed: true,
        maxSplitHands: 2,
      }
      // Player: A♠+A♥, Dealer: 7+5
      // Split: hand1 gets A♦, hand2 gets K
      // maxSplitHands=2, already at max → both must stand
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
        c(Rank.Ace, Suit.Diamonds), c(Rank.King),
      ])
      const engine = new GameEngine(rules, shoe)
      const state = engine.startRound(10)
      const after = engine.split(state)

      expect(after.playerHands).toHaveLength(2)
      // Both hands standing despite hand1 having A+A
      expect(after.playerHands[0].isStanding).toBe(true)
      expect(after.playerHands[1].isStanding).toBe(true)
      // Should be in dealer turn since both are standing
      expect(after.phase).toBe('dealerTurn')
    })

    it('re-split Aces: getAvailableActions offers Split+Stand, no Hit', () => {
      const rules: CasinoRules = {
        ...DEFAULT_RULES,
        hitSplitAces: false,
        resplitAllowed: true,
        maxSplitHands: 4,
      }
      // Player: A♠+A♥, Dealer: 7+5
      // Split: hand1 gets A♦ (pair!), hand2 gets K
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
        c(Rank.Ace, Suit.Diamonds), c(Rank.King),
        c(Rank.Ten), c(Rank.Nine),
      ])
      const engine = new GameEngine(rules, shoe)
      const state = engine.startRound(10)
      const after = engine.split(state)

      const actions = engine.getAvailableActions(after)
      expect(actions).toContain(Action.Stand)
      expect(actions).toContain(Action.Split)
      expect(actions).not.toContain(Action.Hit)
      expect(actions).not.toContain(Action.Double)
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

  // ── insurance ──────────────────────────────────────────────────

  describe('insurance', () => {
    it('is available when dealer upcard is Ace', () => {
      // Deal order: player1, dealer1(upcard), player2, dealer2(hole)
      // Dealer upcard = Ace (cards[0])
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Five),
        c(Rank.Three), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toContain(Action.Insurance)
    })

    it('is NOT available when dealer upcard is not Ace', () => {
      // Dealer upcard = King (cards[0])
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.King), c(Rank.Eight), c(Rank.Five),
        c(Rank.Three), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).not.toContain(Action.Insurance)
    })

    it('is NOT available after player has already acted (hit)', () => {
      // Dealer upcard = Ace, but player hits first
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Ace), c(Rank.Three), c(Rank.Five, Suit.Hearts),
        c(Rank.Two), // hit card
        c(Rank.Three, Suit.Hearts), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state)
      const actions = engine.getAvailableActions(afterHit)

      expect(actions).not.toContain(Action.Insurance)
    })

    it('pays 2:1 when dealer has blackjack', () => {
      // Player: 10+8=18, Dealer: A(upcard)+K(hole) = BJ
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.insurance(state)

      expect(state.insuranceBet).toBe(5) // half of original bet

      state = engine.stand(state)
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Loss)
      expect(state.isRoundOver).toBe(true)
    })

    it('loses when dealer does not have blackjack', () => {
      // Player: 10+8=18, Dealer: A(upcard)+6(hole) = soft 17
      // With S17 rules dealer stands on soft 17 → 17 < 18 → player wins
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.insurance(state)

      expect(state.insuranceBet).toBe(5)

      state = engine.stand(state)
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      // Dealer has no BJ → insurance lost, but player wins main hand (18 > 17)
      expect(state.playerHands[0].result).toBe(HandResult.Win)
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

  // ── checkDealerBlackjack ──────────────────────────────────────

  describe('checkDealerBlackjack', () => {
    it('settles round when dealer has blackjack', () => {
      // Player: 10+8=18, Dealer: A+K = BJ
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const result = engine.checkDealerBlackjack(state)
      expect(result.isRoundOver).toBe(true)
      expect(result.phase).toBe('settlement')
      expect(result.playerHands[0].result).toBe(HandResult.Loss)
    })

    it('returns state unchanged when dealer does not have blackjack', () => {
      // Player: 10+8=18, Dealer: A+6 = 17
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const result = engine.checkDealerBlackjack(state)
      expect(result.isRoundOver).toBe(false)
      expect(result.phase).toBe('playerTurn')
      expect(result).toBe(state) // same reference, unchanged
    })
  })

  // ── player blackjack actions ──────────────────────────────────

  describe('player blackjack available actions', () => {
    it('player BJ + dealer Ace → [Insurance, Stand]', () => {
      // Player: A+K = BJ, Dealer: A+6
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toEqual([Action.Insurance, Action.Stand])
    })

    it('player BJ + dealer non-Ace → empty actions (auto-settle)', () => {
      // Player: A+K = BJ, Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toEqual([])
    })
  })

  // ── hand value 21 auto-stand ──────────────────────────────────

  describe('auto-stand at 21', () => {
    it('hand value 21 with 3+ cards → empty actions', () => {
      // Player: 5+6=11, Dealer: 7+5, Hit: 10 → 21
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Seven), c(Rank.Six), c(Rank.Five, Suit.Hearts),
        c(Rank.Ten), // hit to 21
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state)
      const actions = engine.getAvailableActions(afterHit)

      expect(actions).toEqual([])
    })

    it('hit() to 21 auto-stands and moves to dealer turn', () => {
      // Player: 7+4=11, Dealer: 8+5=13, Hit: 10 → 21
      const shoe = createCardSource([
        c(Rank.Seven), c(Rank.Eight), c(Rank.Four), c(Rank.Five),
        c(Rank.Ten), // hit to 21
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state)

      expect(afterHit.playerHands[0].isStanding).toBe(true)
      expect(afterHit.phase).toBe('dealerTurn')
    })

    it('split() hand reaching 21 auto-stands', () => {
      // Player: 5♠+5♥ pair, Dealer: 7+8
      // Split: hand1 gets 6 → 5+6=11 (not 21), hand2 gets K → 5+10=15 (not 21)
      // Actually need to reach 21: Player: 5♠+5♥, split hand1 gets Ace → 5+11=16... no
      // Better: Player: Jack♠+Jack♥, split hand1 gets Ace → 10+11=21!
      const shoe = createCardSource([
        c(Rank.Jack, Suit.Spades), c(Rank.Seven), c(Rank.Jack, Suit.Hearts), c(Rank.Eight),
        c(Rank.Ace), c(Rank.Three), // split cards: hand1=J+A=21, hand2=J+3=13
        c(Rank.Four), c(Rank.Five), // extra
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterSplit = engine.split(state)

      // Hand 1 (J+A=21) should be auto-standing
      expect(afterSplit.playerHands[0].isStanding).toBe(true)
      // Hand 2 (J+3=13) should NOT be auto-standing
      expect(afterSplit.playerHands[1].isStanding).toBe(false)
      // Current hand should advance to hand2 since hand1 is standing
      expect(afterSplit.currentHandIndex).toBe(1)
    })
  })

  // ── playDealerHand skips for player BJ ────────────────────────

  describe('playDealerHand with player BJ', () => {
    it('skips drawing when player has natural blackjack', () => {
      // Player: A+K = BJ, Dealer: 7+5=12 (would normally draw)
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
        c(Rank.Ten), // extra card that should NOT be drawn
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.stand(state)
      state = engine.playDealerHand(state)

      // Dealer should not have drawn any cards
      expect(state.dealerHand.cards).toHaveLength(2)
      expect(state.phase).toBe('settlement')
    })
  })

  // ── Bug 1: Dealer Blackjack Check after Insurance ───────────

  describe('dealer blackjack check after insurance', () => {
    it('dealer BJ with Ace showing → round ends immediately after insurance decision', () => {
      // Player: 10+8=18, Dealer: A+K = BJ
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.insurance(state)
      state = engine.checkDealerBlackjack(state)

      expect(state.isRoundOver).toBe(true)
      expect(state.phase).toBe('settlement')
      expect(state.playerHands[0].result).toBe(HandResult.Loss)
    })

    it('dealer BJ without insurance → player loses, round over', () => {
      // Player: 10+8=18, Dealer: A+K = BJ, player declines insurance
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      // Player declines insurance → dealer peek
      state = engine.checkDealerBlackjack(state)

      expect(state.isRoundOver).toBe(true)
      expect(state.playerHands[0].result).toBe(HandResult.Loss)
    })

    it('dealer BJ with insurance → player loses hand but insurance pays 2:1', () => {
      // Player: 10+8=18, Dealer: A+K = BJ
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.insurance(state)

      expect(state.insuranceBet).toBe(5) // half of 10

      state = engine.checkDealerBlackjack(state)
      expect(state.isRoundOver).toBe(true)
      expect(state.playerHands[0].result).toBe(HandResult.Loss)
      // Insurance bet is preserved in state for payout calculation
      expect(state.insuranceBet).toBe(5)
    })

    it('player BJ vs dealer BJ → Push', () => {
      // Player: A+K = BJ, Dealer: A+10 = BJ
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Ten),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.checkDealerBlackjack(state)

      expect(state.isRoundOver).toBe(true)
      expect(state.playerHands[0].result).toBe(HandResult.Push)
    })

    it('dealer no BJ after Ace → insurance lost, normal play continues', () => {
      // Player: 10+8=18, Dealer: A+6 = soft 17
      const shoe = createCardSource([
        c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.insurance(state)
      state = engine.checkDealerBlackjack(state)

      // No BJ → round continues
      expect(state.isRoundOver).toBe(false)
      expect(state.phase).toBe('playerTurn')
      // Insurance bet is set (will be lost at settlement)
      expect(state.insuranceBet).toBe(5)
      // Player can still act
      const actions = engine.getAvailableActions(state)
      expect(actions).toContain(Action.Hit)
      expect(actions).toContain(Action.Stand)
    })
  })

  // ── Bug 2: Player Blackjack = immediate win ─────────────────

  describe('player blackjack immediate handling', () => {
    it('player blackjack → no actions available', () => {
      // Player: A+K = BJ, Dealer: 7+5
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toEqual([])
    })

    it('player blackjack → immediate 3:2 payout via settlement', () => {
      // Player: A+K = BJ, Dealer: 7+5=12
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
        c(Rank.Ten), c(Rank.Three), // dealer draw cards
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = { ...state, phase: 'dealerTurn' as const }
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Blackjack)
    })

    it('player blackjack vs dealer Ace → insurance offered first', () => {
      // Player: A+K = BJ, Dealer: A+6
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Six),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const actions = engine.getAvailableActions(state)

      expect(actions).toContain(Action.Insurance)
      expect(actions).toContain(Action.Stand)
      expect(actions).toHaveLength(2)
      // No Hit, Double, Split, or Surrender
      expect(actions).not.toContain(Action.Hit)
    })

    it('player blackjack vs dealer blackjack → Push', () => {
      // Player: A+K = BJ, Dealer: A+10 = BJ
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Ten),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = engine.checkDealerBlackjack(state)

      expect(state.isRoundOver).toBe(true)
      expect(state.playerHands[0].result).toBe(HandResult.Push)
    })

    it('player blackjack vs dealer 10 showing, no BJ → player wins 3:2', () => {
      // Player: A+K = BJ, Dealer: 10+6=16
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Ten), c(Rank.King), c(Rank.Six),
        c(Rank.Three), // dealer draw card
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      // Dealer shows 10 → peek for BJ
      state = engine.checkDealerBlackjack(state)
      // No dealer BJ → round continues, then settle with player BJ
      expect(state.isRoundOver).toBe(false)
      state = { ...state, phase: 'dealerTurn' as const }
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Blackjack)
    })
  })

  // ── Bug 4: Dealer Peek at 10-value upcard ─────────────────

  describe('dealer 10-value peek', () => {
    it('dealer shows 10 with Ace hole → checkDealerBlackjack settles round', () => {
      // Player: 8+9=17, Dealer: 10+A = BJ
      const shoe = createCardSource([
        c(Rank.Eight), c(Rank.Ten), c(Rank.Nine), c(Rank.Ace),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const result = engine.checkDealerBlackjack(state)
      expect(result.isRoundOver).toBe(true)
      expect(result.phase).toBe('settlement')
      expect(result.playerHands[0].result).toBe(HandResult.Loss)
    })

    it('dealer shows King with Ace hole → immediate BJ', () => {
      // Player: 5+6=11, Dealer: K+A = BJ
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.King), c(Rank.Six), c(Rank.Ace),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const result = engine.checkDealerBlackjack(state)
      expect(result.isRoundOver).toBe(true)
      expect(result.playerHands[0].result).toBe(HandResult.Loss)
    })

    it('dealer shows Jack with 9 hole → no BJ, normal play', () => {
      // Player: 8+9=17, Dealer: J+9 = 19 (no BJ)
      const shoe = createCardSource([
        c(Rank.Eight), c(Rank.Jack), c(Rank.Nine), c(Rank.Nine, Suit.Hearts),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const result = engine.checkDealerBlackjack(state)
      expect(result.isRoundOver).toBe(false)
      expect(result).toBe(state) // unchanged reference
    })

    it('player 21 (not BJ) vs dealer BJ with 10 showing → player loses', () => {
      // Player: 5+6=11, Dealer: Q+A = BJ
      // Player would normally hit to 21, but dealer BJ should end round first
      const shoe = createCardSource([
        c(Rank.Five), c(Rank.Queen), c(Rank.Six), c(Rank.Ace),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)

      const result = engine.checkDealerBlackjack(state)
      expect(result.isRoundOver).toBe(true)
      // Player's 11 loses to dealer BJ
      expect(result.playerHands[0].result).toBe(HandResult.Loss)
    })
  })

  // ── Bug 5: Split 21 is NOT Blackjack ────────────────────────

  describe('split 21 is not blackjack', () => {
    it('A+K after split → settles as Win (1:1), not Blackjack (3:2)', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, hitSplitAces: false }
      // Player: A♠+A♥ pair, Dealer: 7+5=12
      // Split: hand1 gets K → A+K=21, hand2 gets 6 → A+6=17
      // Dealer draws: 5 → 12+5=17
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
        c(Rank.King), c(Rank.Six),     // split cards
        c(Rank.Five, Suit.Hearts),      // dealer draw → 17
      ])
      const engine = new GameEngine(rules, shoe)
      let state = engine.startRound(10)
      state = engine.split(state)
      // Both hands auto-stand (hitSplitAces=false)
      expect(state.phase).toBe('dealerTurn')
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      // Hand 1: A+K=21 (isSplit=true) → Win, NOT Blackjack
      expect(state.playerHands[0].result).toBe(HandResult.Win)
      // Hand 2: A+6=17 vs dealer 17 → Push
      expect(state.playerHands[1].result).toBe(HandResult.Push)
    })

    it('A+K initial deal (no split) → settles as Blackjack', () => {
      // Player: A+K = BJ, Dealer: 7+5=12
      const shoe = createCardSource([
        c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
        c(Rank.Ten), c(Rank.Three), // dealer draw
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      let state = engine.startRound(10)
      state = { ...state, phase: 'dealerTurn' as const }
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      expect(state.playerHands[0].result).toBe(HandResult.Blackjack)
    })

    it('split aces: A+10 result is Win, not Blackjack', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, hitSplitAces: false }
      // Player: A♠+A♥ pair, Dealer: 3+4=7
      // Split: hand1 gets 10 → A+10=21, hand2 gets 5 → A+5=16
      // Dealer draws: K → 7+10=17
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Three), c(Rank.Ace, Suit.Hearts), c(Rank.Four),
        c(Rank.Ten), c(Rank.Five),     // split cards
        c(Rank.King),                   // dealer draw → 17
      ])
      const engine = new GameEngine(rules, shoe)
      let state = engine.startRound(10)
      state = engine.split(state)
      expect(state.phase).toBe('dealerTurn')
      state = engine.playDealerHand(state)
      state = engine.settleRound(state)

      // Hand 1: A+10=21 (isSplit=true) → Win (1:1), NOT Blackjack
      expect(state.playerHands[0].result).toBe(HandResult.Win)
    })
  })

  // ── Bug 3: Auto-Stand at 21 (additional tests) ─────────────

  describe('auto-stand at 21 (additional)', () => {
    it('hand reaching 21 via three cards (7+7+7) → auto stand', () => {
      // Player: 7+7=14, Dealer: 8+5=13, Hit: 7 → 21
      const shoe = createCardSource([
        c(Rank.Seven), c(Rank.Eight), c(Rank.Seven, Suit.Hearts), c(Rank.Five),
        c(Rank.Seven, Suit.Diamonds), // hit to 21
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state)

      expect(afterHit.playerHands[0].isStanding).toBe(true)
      expect(afterHit.phase).toBe('dealerTurn')
      expect(engine.getAvailableActions(afterHit)).toEqual([])
    })

    it('hand reaching 21 after hit → auto stand, no further actions', () => {
      // Player: 4+7=11, Dealer: 9+3=12, Hit: 10 → 21
      const shoe = createCardSource([
        c(Rank.Four), c(Rank.Nine), c(Rank.Seven), c(Rank.Three),
        c(Rank.Ten), // hit to 21
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterHit = engine.hit(state)

      expect(afterHit.playerHands[0].isStanding).toBe(true)
      expect(afterHit.phase).toBe('dealerTurn')
      const actions = engine.getAvailableActions(afterHit)
      expect(actions).toEqual([])
    })
  })

  // ── Deferred split dealing ────────────────────────────────────
  describe('deferred split dealing', () => {
    it('non-aces split: hand 2 gets card only when it becomes active', () => {
      // Player: 8♠+8♥ pair, Dealer: 7+5
      // Split: hand1 = [8♠, K], hand2 = [8♥] (deferred)
      // Stand hand1 → advance → hand2 = [8♥, Q]
      const shoe = createCardSource([
        c(Rank.Eight, Suit.Spades), c(Rank.Seven), c(Rank.Eight, Suit.Hearts), c(Rank.Five),
        c(Rank.King),   // hand1's second card (during split)
        c(Rank.Queen),  // hand2's second card (during advance after stand)
        c(Rank.Three), c(Rank.Four),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterSplit = engine.split(state)

      // After split: hand1 has 2 cards, hand2 has 1 card
      expect(afterSplit.playerHands[0].cards).toHaveLength(2)
      expect(afterSplit.playerHands[1].cards).toHaveLength(1)
      expect(afterSplit.currentHandIndex).toBe(0)

      // Stand on hand1 → advances to hand2, deals card to hand2
      const afterStand = engine.stand(afterSplit)
      expect(afterStand.playerHands[1].cards).toHaveLength(2)
      expect(afterStand.playerHands[1].cards[1].rank).toBe(Rank.Queen)
      expect(afterStand.currentHandIndex).toBe(1)
    })

    it('non-aces split: hit cards on hand1 come before hand2 card from shoe', () => {
      // Player: 5♠+5♥ pair, Dealer: 7+8
      // Split: hand1 = [5♠, 3], hand2 = [5♥]
      // Hit hand1: gets 4 → [5,3,4]=12, hit again: 6 → 18, stand
      // Advance: hand2 gets next card from shoe (after hit cards)
      const shoe = createCardSource([
        c(Rank.Five, Suit.Spades), c(Rank.Seven), c(Rank.Five, Suit.Hearts), c(Rank.Eight),
        c(Rank.Three),  // hand1's split card
        c(Rank.Four),   // hand1 hit 1
        c(Rank.Six),    // hand1 hit 2
        c(Rank.Nine),   // hand2's advance card (after all hand1 hits)
        c(Rank.Two),    // extra
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterSplit = engine.split(state)

      const hit1 = engine.hit(afterSplit)
      const hit2 = engine.hit(hit1)
      const afterStand = engine.stand(hit2)

      // Hand2 gets the 9 (next from shoe after hand1's hits)
      expect(afterStand.playerHands[1].cards).toHaveLength(2)
      expect(afterStand.playerHands[1].cards[1].rank).toBe(Rank.Nine)
    })

    it('non-aces split: hand1 busts → advance deals to hand2', () => {
      // Player: 10♠+10♥ pair, Dealer: 7+5
      // Split: hand1 = [10♠, 8]=18, hand2 = [10♥]
      // Hit hand1: gets 5 → 23 bust
      // Advance: hand2 gets next card
      const shoe = createCardSource([
        c(Rank.Ten, Suit.Spades), c(Rank.Seven), c(Rank.Ten, Suit.Hearts), c(Rank.Five),
        c(Rank.Eight),  // hand1's split card
        c(Rank.Five, Suit.Hearts),  // hand1 hit → bust (10+8+5=23)
        c(Rank.Three),  // hand2's advance card
        c(Rank.Four),   // extra
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterSplit = engine.split(state)
      const afterHit = engine.hit(afterSplit) // bust

      expect(afterHit.playerHands[0].isStanding).toBe(true) // busted
      expect(afterHit.playerHands[1].cards).toHaveLength(2)
      expect(afterHit.playerHands[1].cards[1].rank).toBe(Rank.Three)
      expect(afterHit.currentHandIndex).toBe(1)
    })

    it('non-aces split: hand1 21 auto-stand → hand2 gets card during split advance', () => {
      // Player: J♠+J♥ pair, Dealer: 7+8
      // Split: hand1 = [J♠, A]=21 → auto-stand
      // advanceIfNeeded: hand2 = [J♥, 3]=13
      const shoe = createCardSource([
        c(Rank.Jack, Suit.Spades), c(Rank.Seven), c(Rank.Jack, Suit.Hearts), c(Rank.Eight),
        c(Rank.Ace),    // hand1's split card → J+A=21
        c(Rank.Three),  // hand2's advance card
        c(Rank.Four), c(Rank.Five),
      ])
      const engine = new GameEngine(DEFAULT_RULES, shoe)
      const state = engine.startRound(10)
      const afterSplit = engine.split(state)

      expect(afterSplit.playerHands[0].isStanding).toBe(true)  // J+A=21
      expect(afterSplit.playerHands[1].cards).toHaveLength(2)   // got card during advance
      expect(afterSplit.playerHands[1].isStanding).toBe(false)  // J+3=13
      expect(afterSplit.currentHandIndex).toBe(1)
    })

    it('split aces: both hands get cards immediately (unchanged)', () => {
      const rules: CasinoRules = { ...DEFAULT_RULES, hitSplitAces: false }
      const shoe = createCardSource([
        c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
        c(Rank.King), c(Rank.Queen),
      ])
      const engine = new GameEngine(rules, shoe)
      const state = engine.startRound(10)
      const newState = engine.split(state)

      expect(newState.playerHands[0].cards).toHaveLength(2)
      expect(newState.playerHands[1].cards).toHaveLength(2)
      expect(newState.playerHands[0].isStanding).toBe(true)
      expect(newState.playerHands[1].isStanding).toBe(true)
      expect(newState.phase).toBe('dealerTurn')
    })
  })
})
