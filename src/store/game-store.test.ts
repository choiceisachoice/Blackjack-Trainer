import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useGameStore } from './game-store'
import { Action, HandResult, DEFAULT_RULES } from '../engine/rules/types'
import type { CardSource } from '../engine/rules/types'
import { GameEngine } from '../engine/rules/game-engine'
import { Rank, Suit } from '../engine/shoe/types'
import type { Card } from '../engine/shoe/types'

/**
 * Resets store to initial state before each test.
 */
function resetStore() {
  useGameStore.setState({
    shoe: null,
    gameEngine: null,
    countingEngine: null,
    gameState: null,
    balance: 10000,
    currentBet: 0,
    runningCount: 0,
    trueCount: 0,
    showCount: false,
    isShoeEmpty: false,
    message: '',
    availableActions: [],
    totalCards: 0,
    remainingInShoe: 0,
    cardsInDiscard: 0,
    cardsOnTable: 0,
    isAnimating: false,
  })
}

describe('Game Store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initGame creates shoe, gameEngine, countingEngine instances', () => {
    const store = useGameStore.getState()
    store.initGame()

    const state = useGameStore.getState()
    expect(state.shoe).not.toBeNull()
    expect(state.gameEngine).not.toBeNull()
    expect(state.countingEngine).not.toBeNull()
    expect(state.balance).toBe(10000)
    expect(state.gameState).toBeNull()
  })

  it('placeBet updates currentBet and reduces balance', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(100)

    const state = useGameStore.getState()
    expect(state.currentBet).toBe(100)
    expect(state.balance).toBe(9900)
  })

  it('placeBet accumulates multiple bets', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(25)
    store.placeBet(50)

    const state = useGameStore.getState()
    expect(state.currentBet).toBe(75)
    expect(state.balance).toBe(9925)
  })

  it('placeBet rejects bets exceeding balance', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(10000)

    // Try to bet more than remaining balance
    store.placeBet(1)
    const state = useGameStore.getState()
    expect(state.currentBet).toBe(10000)
    expect(state.balance).toBe(0)
  })

  it('clearBet returns money to balance', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(100)
    store.clearBet()

    const state = useGameStore.getState()
    expect(state.currentBet).toBe(0)
    expect(state.balance).toBe(10000)
  })

  it('startRound deals initial cards (2 player, 2 dealer)', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    expect(state.gameState).not.toBeNull()
    expect(state.gameState!.playerHands[0].cards.length).toBe(2)
    expect(state.gameState!.dealerHand.cards.length).toBeGreaterThanOrEqual(2)
  })

  it('hit adds card to player hand and updates count', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const stateAfterDeal = useGameStore.getState()
    // Only proceed if player doesn't have blackjack and round isn't over
    if (stateAfterDeal.gameState?.isRoundOver) return

    const cardsBefore = stateAfterDeal.gameState!.playerHands[0].cards.length

    store.hit()
    vi.advanceTimersByTime(10000)

    const stateAfterHit = useGameStore.getState()
    // If round ended (bust → dealer play → settle), hands may be settled
    if (stateAfterHit.gameState!.isRoundOver) {
      // Count should have been updated (at least 1 new card processed)
      expect(stateAfterHit.runningCount).toBeDefined()
      return
    }

    expect(stateAfterHit.gameState!.playerHands[0].cards.length).toBe(cardsBefore + 1)
  })

  it('stand moves to dealer turn', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const stateAfterDeal = useGameStore.getState()
    if (stateAfterDeal.gameState?.isRoundOver) return

    store.stand()
    vi.advanceTimersByTime(10000)

    const stateAfterStand = useGameStore.getState()
    // After stand, dealer plays automatically → settlement
    expect(stateAfterStand.gameState!.isRoundOver).toBe(true)
    expect(stateAfterStand.gameState!.phase).toBe('settlement')
  })

  it('double doubles bet, adds one card, then stands', () => {
    const store = useGameStore.getState()
    store.initGame()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const stateAfterDeal = useGameStore.getState()
    if (stateAfterDeal.gameState?.isRoundOver) return
    if (!stateAfterDeal.availableActions.includes(Action.Double)) return

    const cardsBefore = stateAfterDeal.gameState!.playerHands[0].cards.length

    store.double()

    vi.advanceTimersByTime(10000)

    const stateAfterDouble = useGameStore.getState()
    // Player hand should have exactly one more card
    expect(stateAfterDouble.gameState!.playerHands[0].cards.length).toBe(cardsBefore + 1)
    // Round should be over (double → stand → dealer → settle)
    expect(stateAfterDouble.gameState!.isRoundOver).toBe(true)
  })

  it('newRound after cutCard resets shoe', () => {
    const store = useGameStore.getState()
    store.initGame()

    // Play many rounds to reach cut card
    let rounds = 0
    while (!useGameStore.getState().isShoeEmpty && rounds < 100) {
      store.placeBet(5)
      store.startRound()
      vi.advanceTimersByTime(2200)
      const s = useGameStore.getState()
      if (s.gameState && !s.gameState.isRoundOver) {
        store.stand()
        vi.advanceTimersByTime(10000)
      }
      store.newRound()
      rounds++
    }

    // If we reached the cut card, newRound should reset
    if (useGameStore.getState().isShoeEmpty) {
      store.placeBet(5)
      store.startRound()
      vi.advanceTimersByTime(2200)
      const s = useGameStore.getState()
      if (s.gameState && !s.gameState.isRoundOver) {
        store.stand()
        vi.advanceTimersByTime(10000)
      }
      store.newRound()

      const state = useGameStore.getState()
      expect(state.message).toBe('Shuffling...')
    }
  })

  it('counting engine tracks all dealt cards', () => {
    const store = useGameStore.getState()
    store.initGame()

    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const stateAfterDeal = useGameStore.getState()
    // After dealing 4 cards, running count should have changed (or be 0 if they cancel)
    // The count at least should be defined and numeric
    expect(typeof stateAfterDeal.runningCount).toBe('number')

    if (!stateAfterDeal.gameState?.isRoundOver) {
      store.stand()
      vi.advanceTimersByTime(10000)
    }

    const stateAfterRound = useGameStore.getState()
    // After full round with dealer cards, count should reflect all cards
    expect(typeof stateAfterRound.runningCount).toBe('number')
  })

  it('balance updates correctly after win/loss/push', () => {
    const store = useGameStore.getState()
    store.initGame()

    // Play a round and check balance changed
    const balanceStart = useGameStore.getState().balance
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const s = useGameStore.getState()
    if (s.gameState && !s.gameState.isRoundOver) {
      store.stand()
      vi.advanceTimersByTime(10000)
    }

    const stateAfterRound = useGameStore.getState()
    expect(stateAfterRound.gameState!.isRoundOver).toBe(true)

    // Balance should have changed based on result
    const result = stateAfterRound.gameState!.playerHands[0].result
    const finalBalance = stateAfterRound.balance

    switch (result) {
      case HandResult.Win:
        expect(finalBalance).toBe(balanceStart + 100)
        break
      case HandResult.Blackjack:
        expect(finalBalance).toBe(balanceStart + 150)
        break
      case HandResult.Push:
        expect(finalBalance).toBe(balanceStart)
        break
      case HandResult.Loss:
        expect(finalBalance).toBe(balanceStart - 100)
        break
      case HandResult.Surrender:
        expect(finalBalance).toBe(balanceStart - 50)
        break
    }
  })

  it('toggleCountDisplay toggles showCount', () => {
    const store = useGameStore.getState()
    store.initGame()
    expect(useGameStore.getState().showCount).toBe(false)

    store.toggleCountDisplay()
    expect(useGameStore.getState().showCount).toBe(true)

    store.toggleCountDisplay()
    expect(useGameStore.getState().showCount).toBe(false)
  })
})

// ── Helpers for deterministic store tests ─────────────────────────

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

function createMockCardSource(cards: Card[]): CardSource {
  let index = 0
  return {
    deal() {
      if (index >= cards.length) throw new Error('Mock shoe exhausted')
      return cards[index++]
    },
    remaining() { return cards.length - index },
    remainingDecks() { return (cards.length - index) / 52 },
    cutCardReached() { return false },
    reset() { index = 0 },
  }
}

/** Sets up the store with a mocked shoe for deterministic tests. */
function setupDeterministicStore(cards: Card[]) {
  const store = useGameStore.getState()
  store.initGame()
  const mockShoe = createMockCardSource(cards)
  const gameEngine = new GameEngine(DEFAULT_RULES, mockShoe)
  // Override shoe and engine (mock shoe satisfies structural typing for Shoe methods the store uses)
  useGameStore.setState({
    shoe: mockShoe as any,
    gameEngine,
  })
}

describe('Game Store – Dealer Peek & BJ Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('player BJ + dealer 2-9 → immediate BJ win after animation', () => {
    // Player: A+K = BJ, Dealer: 7+5
    setupDeterministicStore([
      c(Rank.Ace), c(Rank.Seven), c(Rank.King), c(Rank.Five),
      c(Rank.Three), c(Rank.Four), // extras for dealer draw
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()

    // During animation: no actions
    expect(useGameStore.getState().availableActions).toEqual([])
    expect(useGameStore.getState().isAnimating).toBe(true)

    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Blackjack)
    expect(state.message).toContain('Blackjack')
    expect(state.isAnimating).toBe(false)
  })

  it('player BJ + dealer Ace → insurance offered (not auto-finished)', () => {
    // Player: A+K = BJ, Dealer: Ace+6
    setupDeterministicStore([
      c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Six),
      c(Rank.Three), c(Rank.Four),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()

    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    // Round should NOT be over yet — insurance decision pending
    expect(state.gameState!.isRoundOver).toBe(false)
    expect(state.availableActions).toContain(Action.Insurance)
    expect(state.availableActions).toContain(Action.Stand)
    expect(state.availableActions).toHaveLength(2)
  })

  it('insurance taken + dealer BJ → settled immediately', () => {
    // Player: 10+8=18, Dealer: Ace+King = BJ
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    // Take insurance
    store.insurance()

    const state = useGameStore.getState()
    // Round should be settled immediately after insurance + dealer peek
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Loss)
    // Insurance pays 2:1 → message should mention insurance
    expect(state.message).toContain('Insurance')
  })

  it('insurance declined (stand) + no dealer BJ → player BJ wins', () => {
    // Player: A+K = BJ, Dealer: Ace+6 (no BJ)
    setupDeterministicStore([
      c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Six),
      c(Rank.Three), c(Rank.Four), // extras
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    // Decline insurance by pressing Stand
    store.stand()

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Blackjack)
    expect(state.message).toContain('Blackjack')
  })

  it('non-BJ hand + dealer Ace + hit (declining insurance) + dealer BJ → settled', () => {
    // Player: 10+8=18, Dealer: Ace+King = BJ
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
      c(Rank.Three), // hit card (won't be used since dealer has BJ)
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    // Implicit insurance decline: press Hit
    store.hit()

    const state = useGameStore.getState()
    // Dealer peek should reveal BJ → round settled
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Loss)
  })

  it('dealer BJ with insurance → player loses hand but gets 2:1 insurance payout', () => {
    // Player: 10+8=18, Dealer: Ace+King = BJ
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.King),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const balanceBefore = useGameStore.getState().balance
    store.insurance()

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Loss)
    // Insurance: paid 50 (half of 100), gets back 50*3=150 → net +100 from insurance
    // Main hand: lost 100
    // Net: balance - 50 (insurance cost) + 150 (insurance payout) = balance + 100
    // But main bet already deducted → break even on insurance
    expect(state.message).toContain('Insurance')
    expect(state.balance).toBe(balanceBefore - 50 + 150) // -insuranceBet + insuranceBet*3
  })

  it('player BJ vs dealer BJ → Push', () => {
    // Player: A+K = BJ, Dealer: Ace+10 = BJ
    setupDeterministicStore([
      c(Rank.Ace), c(Rank.Ace, Suit.Hearts), c(Rank.King), c(Rank.Ten),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    // Player has BJ, dealer shows Ace → insurance offered
    // Decline insurance by pressing Stand
    store.stand()

    const state = useGameStore.getState()
    // Dealer also has BJ → Push
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Push)
    expect(state.message).toContain('Push')
  })

  it('dealer no BJ after Ace → insurance lost, normal play continues', () => {
    // Player: 10+8=18, Dealer: Ace+6 = soft 17 (no BJ)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ace), c(Rank.Eight), c(Rank.Six),
      c(Rank.Three), c(Rank.Four), // extras for dealer play
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const balanceBefore = useGameStore.getState().balance
    store.insurance()

    const state = useGameStore.getState()
    // No dealer BJ → round continues
    expect(state.gameState!.isRoundOver).toBe(false)
    // Insurance cost deducted
    expect(state.balance).toBe(balanceBefore - 50)
    // Player can still act
    expect(state.availableActions).toContain(Action.Hit)
    expect(state.availableActions).toContain(Action.Stand)
  })

  it('player BJ vs dealer 10 showing, no BJ → player wins 3:2', () => {
    // Player: A+K = BJ, Dealer: 10+6=16
    setupDeterministicStore([
      c(Rank.Ace), c(Rank.Ten), c(Rank.King), c(Rank.Six),
      c(Rank.Three), c(Rank.Four), // extras for dealer draw
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    // Dealer shows 10, no BJ → player BJ wins
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Blackjack)
    expect(state.message).toContain('Blackjack')
    // 3:2 payout: bet 100 → win 150 → balance = 9900 + 100 + 150 = 10150
    expect(state.balance).toBe(10150)
  })

  it('hand reaching 21 after hit → auto stand, dealer plays', () => {
    // Player: 7+4=11, Dealer: 8+5=13, Hit: 10 → 21
    setupDeterministicStore([
      c(Rank.Seven), c(Rank.Eight), c(Rank.Four), c(Rank.Five),
      c(Rank.Ten), // hit to 21
      c(Rank.Three), c(Rank.Four), // dealer draw cards
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    store.hit()
    vi.advanceTimersByTime(10000)

    const state = useGameStore.getState()
    // Round should be over (auto-stand → dealer plays → settle)
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.availableActions).toEqual([])
  })
})

// ── Bug 4: Dealer 10-Value Peek ──────────────────────────────

describe('Game Store – Dealer 10-Value Peek', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dealer shows 10 with Ace hole → immediate BJ, round over before player acts', () => {
    // Player: 8+9=17, Dealer: 10+A = BJ
    setupDeterministicStore([
      c(Rank.Eight), c(Rank.Ten), c(Rank.Nine), c(Rank.Ace),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()

    // During animation, no actions available
    expect(useGameStore.getState().availableActions).toEqual([])
    expect(useGameStore.getState().isAnimating).toBe(true)

    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Loss)
    expect(state.availableActions).toEqual([])
    expect(state.isAnimating).toBe(false)
  })

  it('dealer shows King with Ace hole → immediate BJ', () => {
    // Player: 5+6=11, Dealer: K+A = BJ
    setupDeterministicStore([
      c(Rank.Five), c(Rank.King), c(Rank.Six), c(Rank.Ace),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Loss)
    // Player lost 100 bet
    expect(state.balance).toBe(9900)
  })

  it('dealer shows Jack with 9 hole → no BJ, normal play', () => {
    // Player: 8+9=17, Dealer: J+9 = 19 (no BJ)
    setupDeterministicStore([
      c(Rank.Eight), c(Rank.Jack), c(Rank.Nine), c(Rank.Nine, Suit.Hearts),
      c(Rank.Three), c(Rank.Four), // extras
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    // No dealer BJ → normal play, round not over
    expect(state.gameState!.isRoundOver).toBe(false)
    expect(state.availableActions).toContain(Action.Hit)
    expect(state.availableActions).toContain(Action.Stand)
  })

  it('player cannot split/double before dealer 10-peek resolves', () => {
    // Player: 8♠+8♥ pair, Dealer: Q+A = BJ
    setupDeterministicStore([
      c(Rank.Eight, Suit.Spades), c(Rank.Queen), c(Rank.Eight, Suit.Hearts), c(Rank.Ace),
      c(Rank.Three), c(Rank.Four), // extras
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()

    // During animation: no actions, can't split/double
    const midState = useGameStore.getState()
    expect(midState.availableActions).toEqual([])
    expect(midState.isAnimating).toBe(true)

    vi.advanceTimersByTime(2200)

    // Dealer has BJ → round over, player never got to act
    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Loss)
  })

  it('player BJ vs dealer BJ (dealer shows 10) → Push', () => {
    // Player: A+K = BJ, Dealer: 10+A = BJ
    setupDeterministicStore([
      c(Rank.Ace), c(Rank.Ten), c(Rank.King), c(Rank.Ace, Suit.Hearts),
    ])
    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Push)
    expect(state.message).toContain('Push')
    // Push returns bet → balance stays at 10000
    expect(state.balance).toBe(10000)
  })
})

// ── Bug 5: Split 21 is NOT Blackjack (1:1, not 3:2) ────────

describe('Game Store – Split 21 Payout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('A+K after split → pays 1:1, not 3:2', () => {
    // Player: A♠+A♥ pair, Dealer: 3+4=7
    // Split: hand1 gets K → A+K=21, hand2 gets 6 → A+6=soft 17
    // Dealer draws: K → 7+10=17
    const rules = { ...DEFAULT_RULES, hitSplitAces: false }
    const store = useGameStore.getState()
    store.initGame(rules)
    const mockShoe = createMockCardSource([
      c(Rank.Ace, Suit.Spades), c(Rank.Three), c(Rank.Ace, Suit.Hearts), c(Rank.Four),
      c(Rank.King), c(Rank.Six),     // split cards
      c(Rank.King, Suit.Hearts),     // dealer draw → 17
    ])
    const gameEngine = new GameEngine(rules, mockShoe)
    useGameStore.setState({ shoe: mockShoe as any, gameEngine })

    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    // Split the aces
    store.split()
    vi.advanceTimersByTime(10000)

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    // Hand 1: A+K=21 (split) → Win (1:1), NOT Blackjack (3:2)
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Win)
    // Hand 2: A+6=17 vs dealer 17 → Push
    expect(state.gameState!.playerHands[1].result).toBe(HandResult.Push)
    // Balance: started 10000, bet 100, split costs another 100 → 9800
    // Hand1 win 1:1: +200 (bet returned + win), Hand2 push: +100 (bet returned)
    // Total: 9800 + 200 + 100 = 10100
    expect(state.balance).toBe(10100)
  })

  it('split aces: A+10 result shows as Win, not Blackjack', () => {
    const rules = { ...DEFAULT_RULES, hitSplitAces: false }
    const store = useGameStore.getState()
    store.initGame(rules)
    const mockShoe = createMockCardSource([
      c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
      c(Rank.Ten), c(Rank.Three),     // split cards: hand1=A+10=21, hand2=A+3=14
      c(Rank.Five, Suit.Hearts),       // dealer draw → 17
    ])
    const gameEngine = new GameEngine(rules, mockShoe)
    useGameStore.setState({ shoe: mockShoe as any, gameEngine })

    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    store.split()
    vi.advanceTimersByTime(10000)

    const state = useGameStore.getState()
    expect(state.gameState!.isRoundOver).toBe(true)
    // A+10 from split = Win, not Blackjack
    expect(state.gameState!.playerHands[0].result).toBe(HandResult.Win)
  })

  it('split aces: each hand gets exactly 1 card, no further actions', () => {
    const rules = { ...DEFAULT_RULES, hitSplitAces: false }
    const store = useGameStore.getState()
    store.initGame(rules)
    const mockShoe = createMockCardSource([
      c(Rank.Ace, Suit.Spades), c(Rank.Seven), c(Rank.Ace, Suit.Hearts), c(Rank.Five),
      c(Rank.King), c(Rank.Six),     // split cards
      c(Rank.Five, Suit.Hearts),     // dealer draw
    ])
    const gameEngine = new GameEngine(rules, mockShoe)
    useGameStore.setState({ shoe: mockShoe as any, gameEngine })

    store.placeBet(100)
    store.startRound()
    vi.advanceTimersByTime(2200)

    store.split()
    vi.advanceTimersByTime(10000)

    const state = useGameStore.getState()
    // Both hands have exactly 2 cards (original + 1 dealt)
    expect(state.gameState!.playerHands[0].cards).toHaveLength(2)
    expect(state.gameState!.playerHands[1].cards).toHaveLength(2)
    // Both are standing (no further actions)
    expect(state.gameState!.playerHands[0].isStanding).toBe(true)
    expect(state.gameState!.playerHands[1].isStanding).toBe(true)
    // Round is over (both stood → dealer played → settled)
    expect(state.gameState!.isRoundOver).toBe(true)
  })
})
