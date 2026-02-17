import { create } from 'zustand'
import { Shoe } from '../engine/shoe/shoe'
import { GameEngine } from '../engine/rules/game-engine'
import { CountingEngine } from '../engine/counting/counting-engine'
import { getSystemById } from '../engine/counting/counting-systems'
import { isBlackjack, isBust } from '../engine/rules/hand-utils'
import type { GameState, CasinoRules } from '../engine/rules/types'
import { DEFAULT_RULES, Action, HandResult } from '../engine/rules/types'
import { CountingSystemId } from '../engine/counting/types'
import type { Card } from '../engine/shoe/types'

/**
 * Computes settlement payout and message after a round ends.
 */
function getSettlementInfo(
  state: GameState,
  blackjackPayout: number,
  insuranceBet: number
): { payout: number; message: string } {
  let totalPayout = 0
  const messages: string[] = []
  const dealerBusted = isBust(state.dealerHand.cards)

  for (const hand of state.playerHands) {
    switch (hand.result) {
      case HandResult.Win:
        totalPayout += hand.bet * 2
        messages.push(dealerBusted ? `Dealer Busts! +$${hand.bet}` : `You Win! +$${hand.bet}`)
        break
      case HandResult.Blackjack:
        totalPayout += hand.bet + hand.bet * blackjackPayout
        messages.push(`Blackjack! +$${hand.bet * blackjackPayout}`)
        break
      case HandResult.Push:
        totalPayout += hand.bet
        messages.push('Push')
        break
      case HandResult.Loss:
        messages.push(isBust(hand.cards) ? `Bust! -$${hand.bet}` : `Dealer Wins -$${hand.bet}`)
        break
      case HandResult.Surrender:
        totalPayout += Math.ceil(hand.bet / 2)
        messages.push(`Surrendered -$${Math.floor(hand.bet / 2)}`)
        break
    }
  }

  if (insuranceBet > 0) {
    if (isBlackjack(state.dealerHand.cards)) {
      totalPayout += insuranceBet * 3
      messages.push(`Insurance +$${insuranceBet * 2}`)
    } else {
      messages.push(`Insurance Lost -$${insuranceBet}`)
    }
  }

  return { payout: totalPayout, message: messages.join(' | ') }
}

/**
 * Plays the dealer hand, processes new cards, and settles the round.
 * Returns dealerDrawnCards so callers can update cardsOnTable.
 */
function finishRound(
  state: GameState,
  gameEngine: GameEngine,
  countingEngine: CountingEngine,
  shoe: Shoe,
  blackjackPayout: number,
  currentBalance: number,
  insuranceBet: number
): {
  gameState: GameState
  balance: number
  message: string
  runningCount: number
  trueCount: number
  dealerDrawnCards: number
} {
  const dealerState = gameEngine.playDealerHand(state)
  const dealerDrawnCards = dealerState.dealerHand.cards.length - 2

  // Process new dealer cards (index 2+ = drawn during dealer play)
  for (let i = 2; i < dealerState.dealerHand.cards.length; i++) {
    countingEngine.processCard(dealerState.dealerHand.cards[i])
  }

  const settledState = gameEngine.settleRound(dealerState)
  const { payout, message } = getSettlementInfo(settledState, blackjackPayout, insuranceBet)

  return {
    gameState: settledState,
    balance: currentBalance + payout,
    message,
    runningCount: countingEngine.getRunningCount(),
    trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
    dealerDrawnCards,
  }
}

/** Game store state and actions. */
export interface GameStoreState {
  shoe: Shoe | null
  gameEngine: GameEngine | null
  countingEngine: CountingEngine | null
  rules: CasinoRules
  gameState: GameState | null
  balance: number
  currentBet: number
  runningCount: number
  trueCount: number
  showCount: boolean
  countingSystemId: CountingSystemId
  isShoeEmpty: boolean
  message: string
  availableActions: Action[]
  /** Total cards in the shoe (numDecks × 52) – single source of truth. */
  totalCards: number
  /** Cards still in the shoe – decreases on every dealt card. Shoe component reads this. */
  remainingInShoe: number
  /** Cards collected in the discard tray – increases only at newRound (after settlement). Discard component reads this. */
  cardsInDiscard: number
  /** Cards currently on the table (during a hand) – moved to discard at newRound. */
  cardsOnTable: number
  /** True while card deal/flip animations are playing – buttons should be disabled. */
  isAnimating: boolean
}

export interface GameStoreActions {
  initGame: (rules?: CasinoRules) => void
  placeBet: (amount: number) => void
  clearBet: () => void
  startRound: () => void
  hit: () => void
  stand: () => void
  double: () => void
  split: () => void
  surrender: () => void
  insurance: () => void
  newRound: () => void
  toggleCountDisplay: () => void
  setCountingSystem: (systemId: CountingSystemId) => void
}

export type GameStore = GameStoreState & GameStoreActions

/**
 * Zustand store that bridges the pure-TypeScript engine with the React UI.
 *
 * All engine interactions go through this store. React components import
 * ONLY from this store, never directly from engine/.
 */
export const useGameStore = create<GameStore>((set, get) => ({
  // ── Initial State ────────────────────────────────────────────
  shoe: null,
  gameEngine: null,
  countingEngine: null,
  rules: DEFAULT_RULES,
  gameState: null,
  balance: 10000,
  currentBet: 0,
  runningCount: 0,
  trueCount: 0,
  showCount: false,
  countingSystemId: CountingSystemId.HiLo,
  isShoeEmpty: false,
  message: '',
  availableActions: [],
  totalCards: 0,
  remainingInShoe: 0,
  cardsInDiscard: 0,
  cardsOnTable: 0,
  isAnimating: false,

  // ── Actions ──────────────────────────────────────────────────

  initGame: (rules = DEFAULT_RULES) => {
    const shoe = new Shoe({ numDecks: rules.numDecks, penetration: rules.penetration })
    const gameEngine = new GameEngine(rules, shoe)
    const system = getSystemById(get().countingSystemId)
    const countingEngine = new CountingEngine(system, rules.numDecks)

    set({
      shoe,
      gameEngine,
      countingEngine,
      rules,
      gameState: null,
      balance: 10000,
      currentBet: 0,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
      isShoeEmpty: false,
      message: '',
      availableActions: [],
      totalCards: rules.numDecks * 52,
      remainingInShoe: shoe.remaining(),
      cardsInDiscard: 0,
      cardsOnTable: 0,
    })
  },

  placeBet: (amount: number) => {
    const { balance, currentBet } = get()
    if (amount > balance) return
    set({ currentBet: currentBet + amount, balance: balance - amount, message: '' })
  },

  clearBet: () => {
    const { currentBet, balance } = get()
    set({ currentBet: 0, balance: balance + currentBet })
  },

  startRound: () => {
    const { gameEngine, countingEngine, shoe, currentBet } = get()
    if (!gameEngine || !countingEngine || !shoe || currentBet <= 0) return

    const gameState = gameEngine.startRound(currentBet)

    // Process all 4 dealt cards in deal order
    countingEngine.processCard(gameState.playerHands[0].cards[0])
    countingEngine.processCard(gameState.dealerHand.cards[0])
    countingEngine.processCard(gameState.playerHands[0].cards[1])
    countingEngine.processCard(gameState.dealerHand.cards[1])

    // Check for player blackjack → auto-finish
    if (isBlackjack(gameState.playerHands[0].cards)) {
      set({
        gameState: { ...gameState },
        runningCount: countingEngine.getRunningCount(),
        trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
        isShoeEmpty: shoe.cutCardReached(),
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: 4,
        isAnimating: true,
      })
      // Finish round after deal animation completes
      setTimeout(() => {
        const result = finishRound(
          { ...gameState, phase: 'dealerTurn' },
          gameEngine, countingEngine, shoe,
          get().rules.blackjackPayout, get().balance, 0
        )
        set({
          gameState: result.gameState,
          balance: result.balance,
          message: result.message,
          runningCount: result.runningCount,
          trueCount: result.trueCount,
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
          remainingInShoe: shoe.remaining(),
          cardsOnTable: get().cardsOnTable + result.dealerDrawnCards,
          isAnimating: false,
        })
      }, 2200)
      return
    }

    // Lock buttons during initial deal animation (~2s)
    set({
      gameState,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
      isShoeEmpty: shoe.cutCardReached(),
      message: '',
      availableActions: [],
      remainingInShoe: shoe.remaining(),
      cardsOnTable: 4,
      isAnimating: true,
    })
    setTimeout(() => {
      set({
        availableActions: gameEngine.getAvailableActions(gameState),
        isAnimating: false,
      })
    }, 2200)
  },

  hit: () => {
    const { gameEngine, countingEngine, gameState, shoe } = get()
    if (!gameEngine || !countingEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    const newState = gameEngine.hit(gameState)
    const currentHand = newState.playerHands[gameState.currentHandIndex]
    countingEngine.processCard(currentHand.cards[currentHand.cards.length - 1])

    if (newState.phase === 'dealerTurn') {
      // Lock during hit animation, then finish round
      set({
        gameState: newState,
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: get().cardsOnTable + 1,
        isAnimating: true,
      })
      setTimeout(() => {
        const result = finishRound(
          newState, gameEngine, countingEngine, shoe,
          get().rules.blackjackPayout, get().balance, gameState.insuranceBet
        )
        set({
          gameState: result.gameState,
          balance: result.balance,
          message: result.message,
          runningCount: result.runningCount,
          trueCount: result.trueCount,
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
          remainingInShoe: shoe.remaining(),
          cardsOnTable: get().cardsOnTable + result.dealerDrawnCards,
          isAnimating: false,
        })
      }, 800)
      return
    }

    // Lock during hit animation
    set({
      gameState: newState,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
      availableActions: [],
      remainingInShoe: shoe.remaining(),
      cardsOnTable: get().cardsOnTable + 1,
      isAnimating: true,
    })
    setTimeout(() => {
      set({
        availableActions: gameEngine.getAvailableActions(newState),
        isAnimating: false,
      })
    }, 800)
  },

  stand: () => {
    const { gameEngine, countingEngine, gameState, shoe } = get()
    if (!gameEngine || !countingEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    const newState = gameEngine.stand(gameState)

    if (newState.phase === 'dealerTurn') {
      set({ availableActions: [], isAnimating: true })
      // Dealer draws after hole card flip (~1.1s), then settle
      setTimeout(() => {
        const result = finishRound(
          newState, gameEngine, countingEngine, shoe,
          get().rules.blackjackPayout, get().balance, gameState.insuranceBet
        )
        set({
          gameState: result.gameState,
          balance: result.balance,
          message: result.message,
          runningCount: result.runningCount,
          trueCount: result.trueCount,
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
          remainingInShoe: shoe.remaining(),
          cardsOnTable: get().cardsOnTable + result.dealerDrawnCards,
          isAnimating: false,
        })
      }, 1100)
      return
    }

    set({
      gameState: newState,
      availableActions: gameEngine.getAvailableActions(newState),
    })
  },

  double: () => {
    const { gameEngine, countingEngine, gameState, shoe, balance, currentBet } = get()
    if (!gameEngine || !countingEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    const newState = gameEngine.double(gameState)
    const currentHand = newState.playerHands[gameState.currentHandIndex]
    countingEngine.processCard(currentHand.cards[currentHand.cards.length - 1])

    // Deduct extra bet for the double
    const newBalance = balance - currentBet

    if (newState.phase === 'dealerTurn') {
      const cardsOnTableNow = get().cardsOnTable + 1
      const result = finishRound(
        newState, gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, newBalance, gameState.insuranceBet
      )
      set({
        gameState: result.gameState,
        balance: result.balance,
        message: result.message,
        runningCount: result.runningCount,
        trueCount: result.trueCount,
        isShoeEmpty: shoe.cutCardReached(),
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: cardsOnTableNow + result.dealerDrawnCards,
      })
      return
    }

    set({
      gameState: newState,
      balance: newBalance,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
      availableActions: gameEngine.getAvailableActions(newState),
      remainingInShoe: shoe.remaining(),
      cardsOnTable: get().cardsOnTable + 1,
    })
  },

  split: () => {
    const { gameEngine, countingEngine, gameState, shoe, balance, currentBet } = get()
    if (!gameEngine || !countingEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    const oldIdx = gameState.currentHandIndex
    const newState = gameEngine.split(gameState)

    // Process the 2 newly dealt cards (second card of each split hand)
    countingEngine.processCard(newState.playerHands[oldIdx].cards[1])
    countingEngine.processCard(newState.playerHands[oldIdx + 1].cards[1])

    // Deduct extra bet for the split hand
    const newBalance = balance - currentBet

    if (newState.phase === 'dealerTurn') {
      const cardsOnTableNow = get().cardsOnTable + 2
      const result = finishRound(
        newState, gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, newBalance, gameState.insuranceBet
      )
      set({
        gameState: result.gameState,
        balance: result.balance,
        message: result.message,
        runningCount: result.runningCount,
        trueCount: result.trueCount,
        isShoeEmpty: shoe.cutCardReached(),
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: cardsOnTableNow + result.dealerDrawnCards,
      })
      return
    }

    set({
      gameState: newState,
      balance: newBalance,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
      availableActions: gameEngine.getAvailableActions(newState),
      remainingInShoe: shoe.remaining(),
      cardsOnTable: get().cardsOnTable + 2,
    })
  },

  surrender: () => {
    const { gameEngine, gameState, shoe, countingEngine } = get()
    if (!gameEngine || !gameState || !shoe || !countingEngine) return
    if (get().isAnimating) return

    const newState = gameEngine.surrender(gameState)
    const { payout, message } = getSettlementInfo(newState, get().rules.blackjackPayout, gameState.insuranceBet)

    set({
      gameState: newState,
      balance: get().balance + payout,
      message,
      isShoeEmpty: shoe.cutCardReached(),
      availableActions: [],
    })
  },

  insurance: () => {
    const { gameEngine, gameState, shoe, currentBet, balance } = get()
    if (!gameEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    const newState = gameEngine.insurance(gameState)
    const insuranceBet = newState.insuranceBet

    set({
      gameState: newState,
      balance: balance - insuranceBet,
      availableActions: gameEngine.getAvailableActions(newState),
    })
  },

  newRound: () => {
    const { shoe, countingEngine } = get()
    if (!shoe || !countingEngine) return

    if (shoe.cutCardReached()) {
      shoe.reset()
      countingEngine.reset()
      set({
        gameState: null,
        currentBet: 0,
        runningCount: countingEngine.getRunningCount(),
        trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
        isShoeEmpty: false,
        message: 'Shuffling...',
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsInDiscard: 0,
        cardsOnTable: 0,
      })
    } else {
      set({
        gameState: null,
        currentBet: 0,
        message: '',
        availableActions: [],
        cardsInDiscard: get().cardsInDiscard + get().cardsOnTable,
        cardsOnTable: 0,
      })
    }
  },

  toggleCountDisplay: () => {
    set({ showCount: !get().showCount })
  },

  setCountingSystem: (systemId: CountingSystemId) => {
    const { rules, shoe } = get()
    const system = getSystemById(systemId)
    const countingEngine = new CountingEngine(system, rules.numDecks)

    set({
      countingEngine,
      countingSystemId: systemId,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe?.remainingDecks() ?? rules.numDecks),
    })
  },
}))
