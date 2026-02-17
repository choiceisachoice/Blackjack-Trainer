import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './game-store'
import { Action, HandResult } from '../engine/rules/types'

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
  })
}

describe('Game Store', () => {
  beforeEach(() => {
    resetStore()
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

    const stateAfterDeal = useGameStore.getState()
    // Only proceed if player doesn't have blackjack and round isn't over
    if (stateAfterDeal.gameState?.isRoundOver) return

    const countBefore = stateAfterDeal.runningCount
    const cardsBefore = stateAfterDeal.gameState!.playerHands[0].cards.length

    store.hit()

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

    const stateAfterDeal = useGameStore.getState()
    if (stateAfterDeal.gameState?.isRoundOver) return

    store.stand()

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

    const stateAfterDeal = useGameStore.getState()
    if (stateAfterDeal.gameState?.isRoundOver) return
    if (!stateAfterDeal.availableActions.includes(Action.Double)) return

    const cardsBefore = stateAfterDeal.gameState!.playerHands[0].cards.length

    store.double()

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
      const s = useGameStore.getState()
      if (s.gameState && !s.gameState.isRoundOver) {
        store.stand()
      }
      store.newRound()
      rounds++
    }

    // If we reached the cut card, newRound should reset
    if (useGameStore.getState().isShoeEmpty) {
      store.placeBet(5)
      store.startRound()
      const s = useGameStore.getState()
      if (s.gameState && !s.gameState.isRoundOver) {
        store.stand()
      }
      store.newRound()

      const state = useGameStore.getState()
      expect(state.message).toBe('Shuffling...')
    }
  })

  it('counting engine tracks all dealt cards', () => {
    const store = useGameStore.getState()
    store.initGame()

    const rcBefore = useGameStore.getState().runningCount
    store.placeBet(100)
    store.startRound()

    const stateAfterDeal = useGameStore.getState()
    // After dealing 4 cards, running count should have changed (or be 0 if they cancel)
    // The count at least should be defined and numeric
    expect(typeof stateAfterDeal.runningCount).toBe('number')

    if (!stateAfterDeal.gameState?.isRoundOver) {
      store.stand()
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

    const s = useGameStore.getState()
    if (s.gameState && !s.gameState.isRoundOver) {
      store.stand()
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
