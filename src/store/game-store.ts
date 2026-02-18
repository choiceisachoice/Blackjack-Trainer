import { create } from 'zustand'
import { Shoe } from '../engine/shoe/shoe'
import { GameEngine } from '../engine/rules/game-engine'
import { CountingEngine } from '../engine/counting/counting-engine'
import { getSystemById } from '../engine/counting/counting-systems'
import { isBlackjack, isBust, getCardValue } from '../engine/rules/hand-utils'
import type { GameState, CasinoRules } from '../engine/rules/types'
import { DEFAULT_RULES, Action, HandResult } from '../engine/rules/types'
import { CountingSystemId } from '../engine/counting/types'
import type { Card } from '../engine/shoe/types'
import { Rank } from '../engine/shoe/types'

// ── Animation Timing Constants (ms) ──────────────────────
/** Initial 4-card deal animation total duration. */
const DEAL_ANIM_MS = 2200
/** Single card slide-in duration. */
const CARD_SLIDE_MS = 800
/** Hole card flip duration. */
const HOLE_FLIP_MS = 600
/** Pause after hole flip before dealer draws. */
const POST_FLIP_PAUSE_MS = 800
/** Per dealer-drawn card: slide + pause. */
const PER_DEALER_CARD_MS = 800
/** Final pause after last dealer card before settlement. */
const POST_DEALER_PAUSE_MS = 1000
/** Split animation: aces (both hands get cards). */
const SPLIT_ANIM_MS = 2800
/** Split animation: non-aces (only hand 1 gets card). */
const SPLIT_ONE_CARD_MS = 2000
/** Pause after bust card before dealer reveals. */
const BUST_PAUSE_MS = 1500
/** Pause after stand/21 before dealer starts. */
const PRE_DEALER_PAUSE_MS = 1000

/**
 * Calculates the total delay for dealer play animation.
 * Accounts for hole card flip + pause + per-card stagger + final pause.
 */
function dealerPlayDelay(dealerDrawnCards: number): number {
  return HOLE_FLIP_MS + POST_FLIP_PAUSE_MS +
    dealerDrawnCards * PER_DEALER_CARD_MS +
    POST_DEALER_PAUSE_MS
}

/** Tracks the pending settlement/animation timeout so it can be cleared across rounds. */
let _pendingTimer: ReturnType<typeof setTimeout> | null = null

function clearPendingTimer() {
  if (_pendingTimer !== null) {
    clearTimeout(_pendingTimer)
    _pendingTimer = null
  }
}

/**
 * Detects advance cards dealt to split hands during advanceIfNeeded.
 * Returns the cards and number of newly dealt cards beyond actionHandIdx.
 */
function getAdvanceInfo(
  oldState: GameState,
  newState: GameState,
  actionHandIdx: number
): { cards: Card[]; count: number } {
  const cards: Card[] = []
  for (let i = actionHandIdx + 1; i < newState.playerHands.length; i++) {
    const oldLen = oldState.playerHands[i]?.cards.length ?? 0
    for (let j = oldLen; j < newState.playerHands[i].cards.length; j++) {
      cards.push(newState.playerHands[i].cards[j])
    }
  }
  return { cards, count: cards.length }
}

/**
 * Creates an intermediate GameState without advance cards (hands beyond
 * actionHandIdx keep their old card count). Used for animation staggering.
 */
function stateWithoutAdvanceCards(
  newState: GameState,
  oldState: GameState,
  actionHandIdx: number
): GameState {
  const hands = newState.playerHands.map((hand, i) => {
    if (i <= actionHandIdx) return hand
    const oldLen = oldState.playerHands[i]?.cards.length ?? 0
    if (hand.cards.length > oldLen) {
      return {
        ...hand,
        cards: hand.cards.slice(0, oldLen),
        isStanding: false,
      }
    }
    return hand
  })
  return { ...newState, playerHands: hands }
}

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

/**
 * Returns true when dealer shows Ace, no insurance taken, and current hand
 * is in first-action position (2 cards, not split). This means the player
 * is implicitly declining insurance by taking another action.
 */
function needsDealerPeek(gameState: GameState): boolean {
  const current = gameState.playerHands[gameState.currentHandIndex]
  return (
    gameState.dealerHand.cards[0].rank === Rank.Ace &&
    gameState.insuranceBet === 0 &&
    current.cards.length === 2 &&
    !current.isSplit
  )
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
  /** Split animation delays: [hand0CardDelaySec, hand1CardDelaySec] or null. */
  splitNewCardDelays: [number, number] | null
  /** Optional callback that intercepts newRound(). If set, called instead of the default logic. */
  newRoundInterceptor: (() => void) | null
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
  setNewRoundInterceptor: (fn: (() => void) | null) => void
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
  splitNewCardDelays: null,
  newRoundInterceptor: null,

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
    clearPendingTimer()

    const gameState = gameEngine.startRound(currentBet)

    // Process all 4 dealt cards in deal order
    countingEngine.processCard(gameState.playerHands[0].cards[0])
    countingEngine.processCard(gameState.dealerHand.cards[0])
    countingEngine.processCard(gameState.playerHands[0].cards[1])
    countingEngine.processCard(gameState.dealerHand.cards[1])

    // Check for player blackjack
    if (isBlackjack(gameState.playerHands[0].cards)) {
      const dealerUpcard = gameState.dealerHand.cards[0].rank

      if (dealerUpcard === Rank.Ace) {
        // Dealer shows Ace → offer Insurance/Stand, don't auto-finish
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
        setTimeout(() => {
          set({
            availableActions: [Action.Insurance, Action.Stand],
            isAnimating: false,
          })
        }, 2200)
        return
      }

      if (getCardValue(dealerUpcard) === 10) {
        // Dealer shows 10-value → peek for dealer BJ
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
        setTimeout(() => {
          const peeked = gameEngine.checkDealerBlackjack({
            ...gameState,
            phase: 'dealerTurn',
          })
          if (peeked.isRoundOver) {
            // Dealer also has BJ → push
            const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
            set({
              gameState: peeked,
              balance: get().balance + payout,
              message,
              runningCount: countingEngine.getRunningCount(),
              trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
              isShoeEmpty: shoe.cutCardReached(),
              availableActions: [],
              remainingInShoe: shoe.remaining(),
              isAnimating: false,
            })
          } else {
            // No dealer BJ → player BJ wins
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
          }
        }, 2200)
        return
      }

      // Dealer shows 2-9 → auto-finish, player BJ wins
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

    // Dealer shows 10-value (no player BJ) → peek for dealer BJ before player acts
    if (getCardValue(gameState.dealerHand.cards[0].rank) === 10) {
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
      setTimeout(() => {
        const peeked = gameEngine.checkDealerBlackjack(gameState)
        if (peeked.isRoundOver) {
          // Dealer has BJ → round over immediately
          const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
          set({
            gameState: peeked,
            balance: get().balance + payout,
            message,
            runningCount: countingEngine.getRunningCount(),
            trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
            isShoeEmpty: shoe.cutCardReached(),
            availableActions: [],
            remainingInShoe: shoe.remaining(),
            isAnimating: false,
          })
        } else {
          // No dealer BJ → normal play
          set({
            availableActions: gameEngine.getAvailableActions(gameState),
            isAnimating: false,
          })
        }
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

    // Implicit insurance decline: dealer peek when dealer shows Ace
    if (needsDealerPeek(gameState)) {
      const peeked = gameEngine.checkDealerBlackjack(gameState)
      if (peeked.isRoundOver) {
        const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
        set({
          gameState: peeked,
          balance: get().balance + payout,
          message,
          runningCount: countingEngine.getRunningCount(),
          trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
        })
        return
      }
    }

    const actionIdx = gameState.currentHandIndex
    const newState = gameEngine.hit(gameState)
    const currentHand = newState.playerHands[actionIdx]
    countingEngine.processCard(currentHand.cards[currentHand.cards.length - 1])

    // Detect advance cards dealt to split hands during advanceIfNeeded
    const advance = getAdvanceInfo(gameState, newState, actionIdx)
    advance.cards.forEach(c => countingEngine.processCard(c))

    if (newState.phase === 'dealerTurn') {
      // Compute dealer play + settlement
      const result = finishRound(
        newState, gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, get().balance, gameState.insuranceBet
      )
      const playerBusted = isBust(newState.playerHands[actionIdx].cards)

      if (advance.count > 0) {
        // Hit caused bust/21 on split hand → advance dealt to next hand → dealerTurn
        // Phase 1: Show hit card + intermediate (advance hands keep 1 card)
        const intermediate = stateWithoutAdvanceCards(newState, gameState, actionIdx)
        set({
          gameState: { ...intermediate, phase: 'playerTurn' as const },
          availableActions: [],
          remainingInShoe: shoe.remaining(),
          cardsOnTable: get().cardsOnTable + 1 + advance.count + result.dealerDrawnCards,
          isAnimating: true,
        })
        // Phase 2: After hit card → show advance cards
        _pendingTimer = setTimeout(() => {
          set({ gameState: { ...newState, phase: 'playerTurn' as const } })
          // Phase 3: After advance card + pause → reveal dealer
          _pendingTimer = setTimeout(() => {
            set({ gameState: result.gameState })
            // Phase 4: After dealer animation → settle
            const dealerDelay = dealerPlayDelay(result.dealerDrawnCards)
            _pendingTimer = setTimeout(() => {
              _pendingTimer = null
              set({
                balance: result.balance,
                message: result.message,
                runningCount: result.runningCount,
                trueCount: result.trueCount,
                isShoeEmpty: shoe.cutCardReached(),
                isAnimating: false,
              })
            }, dealerDelay)
          }, CARD_SLIDE_MS + PRE_DEALER_PAUSE_MS)
        }, CARD_SLIDE_MS + (playerBusted ? BUST_PAUSE_MS : PRE_DEALER_PAUSE_MS))
        return
      }

      // No advance cards — standard flow
      // Phase 1: Show hit card but keep dealer hidden (phase stays 'playerTurn')
      set({
        gameState: { ...newState, phase: 'playerTurn' as const },
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: get().cardsOnTable + 1 + result.dealerDrawnCards,
        isAnimating: true,
      })

      // Phase 2: After hit card + pause → reveal dealer
      const playerDelay = CARD_SLIDE_MS + (playerBusted ? BUST_PAUSE_MS : PRE_DEALER_PAUSE_MS)
      _pendingTimer = setTimeout(() => {
        set({ gameState: result.gameState })
        // Phase 3: After dealer animation → settle
        const dealerDelay = playerBusted && result.dealerDrawnCards === 0
          ? HOLE_FLIP_MS + POST_FLIP_PAUSE_MS
          : dealerPlayDelay(result.dealerDrawnCards)
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            balance: result.balance,
            message: result.message,
            runningCount: result.runningCount,
            trueCount: result.trueCount,
            isShoeEmpty: shoe.cutCardReached(),
            isAnimating: false,
          })
        }, dealerDelay)
      }, playerDelay)
      return
    }

    if (advance.count > 0) {
      // Hit caused bust/21 → advance dealt card to next split hand → still playing
      // Phase 1: Show hit card + intermediate (advance hands keep 1 card)
      const intermediate = stateWithoutAdvanceCards(newState, gameState, actionIdx)
      set({
        gameState: intermediate,
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: get().cardsOnTable + 1 + advance.count,
        isAnimating: true,
      })
      // Phase 2: After hit card → show advance card
      _pendingTimer = setTimeout(() => {
        set({ gameState: newState })
        // Phase 3: After advance card slide → enable actions
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            runningCount: countingEngine.getRunningCount(),
            trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
            availableActions: gameEngine.getAvailableActions(newState),
            isAnimating: false,
          })
        }, CARD_SLIDE_MS)
      }, CARD_SLIDE_MS)
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
    _pendingTimer = setTimeout(() => {
      _pendingTimer = null
      set({
        availableActions: gameEngine.getAvailableActions(newState),
        isAnimating: false,
      })
    }, CARD_SLIDE_MS)
  },

  stand: () => {
    const { gameEngine, countingEngine, gameState, shoe } = get()
    if (!gameEngine || !countingEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    // Implicit insurance decline: dealer peek when dealer shows Ace
    if (needsDealerPeek(gameState)) {
      const peeked = gameEngine.checkDealerBlackjack(gameState)
      if (peeked.isRoundOver) {
        const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
        set({
          gameState: peeked,
          balance: get().balance + payout,
          message,
          runningCount: countingEngine.getRunningCount(),
          trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
        })
        return
      }
      // No dealer BJ — if player has BJ, auto-finish with BJ win
      if (isBlackjack(gameState.playerHands[0].cards) && !gameState.playerHands[0].isSplit) {
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
        })
        return
      }
    }

    const actionIdx = gameState.currentHandIndex
    const newState = gameEngine.stand(gameState)

    // Detect advance cards dealt to split hands during advanceIfNeeded
    const advance = getAdvanceInfo(gameState, newState, actionIdx)
    advance.cards.forEach(c => countingEngine.processCard(c))

    if (newState.phase === 'dealerTurn') {
      // Compute dealer play + settlement
      const result = finishRound(
        newState, gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, get().balance, gameState.insuranceBet
      )

      if (advance.count > 0) {
        // Stand → advance dealt card to split hand(s) → all done → dealerTurn
        // Phase 1: Show intermediate (advance hands keep 1 card)
        const intermediate = stateWithoutAdvanceCards(newState, gameState, actionIdx)
        set({
          gameState: intermediate,
          availableActions: [],
          isAnimating: true,
          remainingInShoe: shoe.remaining(),
          cardsOnTable: get().cardsOnTable + advance.count + result.dealerDrawnCards,
        })
        // Phase 2: Show advance cards
        _pendingTimer = setTimeout(() => {
          set({ gameState: { ...newState, phase: 'playerTurn' as const } })
          // Phase 3: After advance card + pause → reveal dealer
          _pendingTimer = setTimeout(() => {
            set({ gameState: result.gameState })
            // Phase 4: After dealer animation → settle
            _pendingTimer = setTimeout(() => {
              _pendingTimer = null
              set({
                balance: result.balance,
                message: result.message,
                runningCount: result.runningCount,
                trueCount: result.trueCount,
                isShoeEmpty: shoe.cutCardReached(),
                isAnimating: false,
              })
            }, dealerPlayDelay(result.dealerDrawnCards))
          }, CARD_SLIDE_MS + PRE_DEALER_PAUSE_MS)
        }, 300)
        return
      }

      // No advance cards — standard dealer play
      // Phase 1: Keep dealer hidden while pausing
      set({
        availableActions: [],
        isAnimating: true,
        remainingInShoe: shoe.remaining(),
        cardsOnTable: get().cardsOnTable + result.dealerDrawnCards,
      })
      // Phase 2: After pause → reveal dealer
      _pendingTimer = setTimeout(() => {
        set({ gameState: result.gameState })
        // Phase 3: After dealer animation → settle
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            balance: result.balance,
            message: result.message,
            runningCount: result.runningCount,
            trueCount: result.trueCount,
            isShoeEmpty: shoe.cutCardReached(),
            isAnimating: false,
          })
        }, dealerPlayDelay(result.dealerDrawnCards))
      }, PRE_DEALER_PAUSE_MS)
      return
    }

    if (advance.count > 0) {
      // Stand → advance dealt card to next split hand → still playing
      // Phase 1: Show intermediate (advance hands keep 1 card)
      const intermediate = stateWithoutAdvanceCards(newState, gameState, actionIdx)
      set({
        gameState: intermediate,
        availableActions: [],
        isAnimating: true,
        remainingInShoe: shoe.remaining(),
        cardsOnTable: get().cardsOnTable + advance.count,
      })
      // Phase 2: After brief pause → show advance card
      _pendingTimer = setTimeout(() => {
        set({ gameState: newState })
        // Phase 3: After card slide → enable actions
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            runningCount: countingEngine.getRunningCount(),
            trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
            availableActions: gameEngine.getAvailableActions(newState),
            isAnimating: false,
          })
        }, CARD_SLIDE_MS)
      }, 300)
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

    // Implicit insurance decline: dealer peek when dealer shows Ace
    if (needsDealerPeek(gameState)) {
      const peeked = gameEngine.checkDealerBlackjack(gameState)
      if (peeked.isRoundOver) {
        const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
        set({
          gameState: peeked,
          balance: get().balance + payout,
          message,
          runningCount: countingEngine.getRunningCount(),
          trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
        })
        return
      }
    }

    const actionIdx = gameState.currentHandIndex
    const newState = gameEngine.double(gameState)
    const currentHand = newState.playerHands[actionIdx]
    countingEngine.processCard(currentHand.cards[currentHand.cards.length - 1])

    // Detect advance cards dealt to split hands during advanceIfNeeded
    const advance = getAdvanceInfo(gameState, newState, actionIdx)
    advance.cards.forEach(c => countingEngine.processCard(c))

    // Deduct extra bet for the double
    const newBalance = balance - currentBet

    if (newState.phase === 'dealerTurn') {
      const cardsOnTableNow = get().cardsOnTable + 1 + advance.count
      const result = finishRound(
        newState, gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, newBalance, gameState.insuranceBet
      )
      const playerBusted = isBust(newState.playerHands[actionIdx].cards)

      if (advance.count > 0) {
        // Double on split hand → advance dealt to next hand → dealerTurn
        const intermediate = stateWithoutAdvanceCards(newState, gameState, actionIdx)
        set({
          gameState: { ...intermediate, phase: 'playerTurn' as const },
          balance: newBalance,
          availableActions: [],
          remainingInShoe: shoe.remaining(),
          cardsOnTable: cardsOnTableNow + result.dealerDrawnCards,
          isAnimating: true,
        })
        // Phase 2: After double card → show advance cards
        _pendingTimer = setTimeout(() => {
          set({ gameState: { ...newState, phase: 'playerTurn' as const } })
          // Phase 3: After advance card + pause → reveal dealer
          _pendingTimer = setTimeout(() => {
            set({ gameState: result.gameState })
            // Phase 4: After dealer animation → settle
            _pendingTimer = setTimeout(() => {
              _pendingTimer = null
              set({
                balance: result.balance,
                message: result.message,
                runningCount: result.runningCount,
                trueCount: result.trueCount,
                isShoeEmpty: shoe.cutCardReached(),
                isAnimating: false,
              })
            }, dealerPlayDelay(result.dealerDrawnCards))
          }, CARD_SLIDE_MS + PRE_DEALER_PAUSE_MS)
        }, CARD_SLIDE_MS + (playerBusted ? BUST_PAUSE_MS : PRE_DEALER_PAUSE_MS))
        return
      }

      // No advance cards — standard flow
      // Phase 1: Show double card but keep dealer hidden
      set({
        gameState: { ...newState, phase: 'playerTurn' as const },
        balance: newBalance,
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: cardsOnTableNow + result.dealerDrawnCards,
        isAnimating: true,
      })

      // Phase 2: After double card + pause → reveal dealer
      const playerDelay = CARD_SLIDE_MS + (playerBusted ? BUST_PAUSE_MS : PRE_DEALER_PAUSE_MS)
      _pendingTimer = setTimeout(() => {
        set({ gameState: result.gameState })
        // Phase 3: After dealer animation → settle
        const dealerDelay = playerBusted && result.dealerDrawnCards === 0
          ? HOLE_FLIP_MS + POST_FLIP_PAUSE_MS
          : dealerPlayDelay(result.dealerDrawnCards)
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            balance: result.balance,
            message: result.message,
            runningCount: result.runningCount,
            trueCount: result.trueCount,
            isShoeEmpty: shoe.cutCardReached(),
            isAnimating: false,
          })
        }, dealerDelay)
      }, playerDelay)
      return
    }

    if (advance.count > 0) {
      // Double on split hand → advance dealt to next hand → still playing
      const intermediate = stateWithoutAdvanceCards(newState, gameState, actionIdx)
      set({
        gameState: intermediate,
        balance: newBalance,
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: get().cardsOnTable + 1 + advance.count,
        isAnimating: true,
      })
      _pendingTimer = setTimeout(() => {
        set({ gameState: newState })
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            runningCount: countingEngine.getRunningCount(),
            trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
            availableActions: gameEngine.getAvailableActions(newState),
            isAnimating: false,
          })
        }, CARD_SLIDE_MS)
      }, CARD_SLIDE_MS)
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

    // Implicit insurance decline: dealer peek when dealer shows Ace
    if (needsDealerPeek(gameState)) {
      const peeked = gameEngine.checkDealerBlackjack(gameState)
      if (peeked.isRoundOver) {
        const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
        set({
          gameState: peeked,
          balance: get().balance + payout,
          message,
          runningCount: countingEngine.getRunningCount(),
          trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
        })
        return
      }
    }

    const oldIdx = gameState.currentHandIndex
    const newState = gameEngine.split(gameState)

    // Detect how many cards were dealt (aces: 2, non-aces: 1 or 2 if hand1→21→advance)
    const hand2HasCard = newState.playerHands[oldIdx + 1].cards.length >= 2
    const cardsDealt = hand2HasCard ? 2 : 1

    // Process newly dealt cards for counting
    countingEngine.processCard(newState.playerHands[oldIdx].cards[1])
    if (hand2HasCard) {
      countingEngine.processCard(newState.playerHands[oldIdx + 1].cards[1])
    }

    // Deduct extra bet for the split hand
    const newBalance = balance - currentBet
    const splitAnimMs = hand2HasCard ? SPLIT_ANIM_MS : SPLIT_ONE_CARD_MS

    if (newState.phase === 'dealerTurn') {
      const cardsOnTableNow = get().cardsOnTable + cardsDealt
      const result = finishRound(
        newState, gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, newBalance, gameState.insuranceBet
      )
      // Phase 1: Show split with animation, keep dealer hidden
      set({
        gameState: { ...newState, phase: 'playerTurn' as const },
        balance: newBalance,
        splitNewCardDelays: [1.0, 1.8],
        availableActions: [],
        remainingInShoe: shoe.remaining(),
        cardsOnTable: cardsOnTableNow + result.dealerDrawnCards,
        isAnimating: true,
      })
      // Phase 2: After split animation + pause → reveal dealer
      _pendingTimer = setTimeout(() => {
        set({ gameState: result.gameState, splitNewCardDelays: null })
        // Phase 3: After dealer animation → settle
        _pendingTimer = setTimeout(() => {
          _pendingTimer = null
          set({
            balance: result.balance,
            message: result.message,
            runningCount: result.runningCount,
            trueCount: result.trueCount,
            isShoeEmpty: shoe.cutCardReached(),
            isAnimating: false,
          })
        }, dealerPlayDelay(result.dealerDrawnCards))
      }, splitAnimMs + PRE_DEALER_PAUSE_MS)
      return
    }

    set({
      gameState: newState,
      balance: newBalance,
      runningCount: countingEngine.getRunningCount(),
      trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
      splitNewCardDelays: [1.0, 1.8],
      availableActions: [],
      remainingInShoe: shoe.remaining(),
      cardsOnTable: get().cardsOnTable + cardsDealt,
      isAnimating: true,
    })
    _pendingTimer = setTimeout(() => {
      _pendingTimer = null
      set({
        splitNewCardDelays: null,
        availableActions: gameEngine.getAvailableActions(newState),
        isAnimating: false,
      })
    }, splitAnimMs)
  },

  surrender: () => {
    const { gameEngine, gameState, shoe, countingEngine } = get()
    if (!gameEngine || !gameState || !shoe || !countingEngine) return
    if (get().isAnimating) return

    // Implicit insurance decline: dealer peek when dealer shows Ace
    if (needsDealerPeek(gameState)) {
      const peeked = gameEngine.checkDealerBlackjack(gameState)
      if (peeked.isRoundOver) {
        const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, 0)
        set({
          gameState: peeked,
          balance: get().balance + payout,
          message,
          runningCount: countingEngine.getRunningCount(),
          trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
          isShoeEmpty: shoe.cutCardReached(),
          availableActions: [],
        })
        return
      }
    }

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
    const { gameEngine, countingEngine, gameState, shoe, balance } = get()
    if (!gameEngine || !countingEngine || !gameState || !shoe) return
    if (get().isAnimating) return

    const newState = gameEngine.insurance(gameState)
    const insuranceBet = newState.insuranceBet
    const newBalance = balance - insuranceBet

    // Dealer peek after taking insurance
    const peeked = gameEngine.checkDealerBlackjack(newState)
    if (peeked.isRoundOver) {
      // Dealer has BJ → settle immediately (loss + insurance pays 2:1)
      const { payout, message } = getSettlementInfo(peeked, get().rules.blackjackPayout, insuranceBet)
      set({
        gameState: peeked,
        balance: newBalance + payout,
        message,
        runningCount: countingEngine.getRunningCount(),
        trueCount: countingEngine.getTrueCount(shoe.remainingDecks()),
        isShoeEmpty: shoe.cutCardReached(),
        availableActions: [],
      })
      return
    }

    // No dealer BJ — check if player has BJ → auto-finish with BJ win
    if (isBlackjack(newState.playerHands[0].cards) && !newState.playerHands[0].isSplit) {
      const result = finishRound(
        { ...newState, phase: 'dealerTurn' },
        gameEngine, countingEngine, shoe,
        get().rules.blackjackPayout, newBalance, insuranceBet
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
      })
      return
    }

    // No dealer BJ, normal hand → continue play (insurance lost later at settlement)
    set({
      gameState: newState,
      balance: newBalance,
      availableActions: gameEngine.getAvailableActions(newState),
    })
  },

  newRound: () => {
    const { shoe, countingEngine, newRoundInterceptor } = get()
    if (!shoe || !countingEngine) return

    if (newRoundInterceptor) {
      newRoundInterceptor()
      return
    }

    clearPendingTimer()
    set({ isAnimating: false })

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

  setNewRoundInterceptor: (fn) => {
    set({ newRoundInterceptor: fn })
  },
}))
