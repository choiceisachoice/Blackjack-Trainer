import { Shoe } from '../shoe/shoe'
import { Rank } from '../shoe/types'
import { getHandValue, isBlackjack, isBust, isPair, isSoft } from './hand-utils'
import type { CardSource, CasinoRules, GameState, Hand } from './types'
import { Action, DEFAULT_RULES, HandResult } from './types'

/**
 * Creates a fresh hand with default values.
 * @param bet - The wager for this hand
 * @returns A new Hand with empty cards and default flags
 */
function createHand(bet: number): Hand {
  return {
    cards: [],
    bet,
    isDoubled: false,
    isSplit: false,
    isStanding: false,
  }
}

/**
 * Core Blackjack game engine implementing standard casino rules.
 *
 * Every action method returns a **new** GameState (immutable pattern).
 * The engine imports the Shoe class from `engine/shoe` and exposes it
 * via the CardSource interface for testability.
 */
export class GameEngine {
  private readonly rules: CasinoRules
  private readonly shoe: CardSource

  /**
   * Creates a new GameEngine.
   * @param rules - Casino rule set (defaults to standard Las Vegas Strip rules)
   * @param shoe - Optional CardSource for dependency injection (defaults to a new Shoe)
   */
  constructor(rules: CasinoRules = DEFAULT_RULES, shoe?: CardSource) {
    this.rules = rules
    this.shoe =
      shoe ??
      new Shoe({ numDecks: rules.numDecks, penetration: rules.penetration })
  }

  /**
   * Starts a new round by dealing 2 cards each to player and dealer.
   *
   * Deal order: player card 1, dealer card 1, player card 2, dealer card 2.
   * @param bet - The player's wager for this round
   * @returns New GameState with dealt cards, phase = playerTurn
   */
  startRound(bet: number): GameState {
    const playerHand: Hand = { ...createHand(bet) }
    const dealerHand: Hand = { ...createHand(0) }

    playerHand.cards = [this.shoe.deal()]
    dealerHand.cards = [this.shoe.deal()]
    playerHand.cards = [...playerHand.cards, this.shoe.deal()]
    dealerHand.cards = [...dealerHand.cards, this.shoe.deal()]

    return {
      shoe: this.shoe,
      dealerHand,
      playerHands: [playerHand],
      currentHandIndex: 0,
      isRoundOver: false,
      phase: 'playerTurn',
      insuranceBet: 0,
    }
  }

  /**
   * Checks whether the dealer has blackjack and settles the round if so.
   * Used after insurance decision or implicit insurance decline.
   * @param state - Current game state
   * @returns New GameState — settled if dealer has BJ, unchanged otherwise
   */
  checkDealerBlackjack(state: GameState): GameState {
    if (isBlackjack(state.dealerHand.cards)) {
      return this.settleRound({
        ...state,
        phase: 'settlement',
      })
    }
    return state
  }

  /**
   * Player takes a card on the current hand.
   *
   * If the hand busts or reaches 21, it is marked as standing and play advances.
   * @param state - Current game state
   * @returns New GameState with the dealt card added
   */
  hit(state: GameState): GameState {
    const card = state.shoe.deal()
    const current = state.playerHands[state.currentHandIndex]
    const newCards = [...current.cards, card]
    const busted = isBust(newCards)

    const newHand: Hand = {
      ...current,
      cards: newCards,
      isStanding: busted || getHandValue(newCards).best === 21,
    }

    const newPlayerHands = [...state.playerHands]
    newPlayerHands[state.currentHandIndex] = newHand

    return this.advanceIfNeeded({
      ...state,
      playerHands: newPlayerHands,
    })
  }

  /**
   * Player stands on the current hand, ending their turn for that hand.
   * @param state - Current game state
   * @returns New GameState with hand marked as standing
   */
  stand(state: GameState): GameState {
    const current = state.playerHands[state.currentHandIndex]
    const newHand: Hand = { ...current, isStanding: true }

    const newPlayerHands = [...state.playerHands]
    newPlayerHands[state.currentHandIndex] = newHand

    return this.advanceIfNeeded({
      ...state,
      playerHands: newPlayerHands,
    })
  }

  /**
   * Player doubles down: bet is doubled, exactly one card is dealt, then stand.
   * @param state - Current game state
   * @returns New GameState with doubled bet, one additional card, hand standing
   * @throws Error if double is not available (not first two cards)
   */
  double(state: GameState): GameState {
    const current = state.playerHands[state.currentHandIndex]
    if (current.cards.length !== 2) {
      throw new Error('Double is only allowed on first two cards')
    }

    const card = state.shoe.deal()
    const newHand: Hand = {
      ...current,
      cards: [...current.cards, card],
      bet: current.bet * 2,
      isDoubled: true,
      isStanding: true,
    }

    const newPlayerHands = [...state.playerHands]
    newPlayerHands[state.currentHandIndex] = newHand

    return this.advanceIfNeeded({
      ...state,
      playerHands: newPlayerHands,
    })
  }

  /**
   * Player splits a pair into two separate hands, each receiving one new card.
   *
   * When splitting Aces with `hitSplitAces = false`, both hands stand immediately.
   * @param state - Current game state
   * @returns New GameState with the pair split into two hands
   * @throws Error if the current hand is not a pair or max split hands reached
   */
  split(state: GameState): GameState {
    const current = state.playerHands[state.currentHandIndex]

    if (!isPair(current.cards)) {
      throw new Error('Split is only allowed on pairs')
    }
    if (state.playerHands.length >= this.rules.maxSplitHands) {
      throw new Error(
        `Cannot split beyond ${this.rules.maxSplitHands} hands`
      )
    }

    const isAces = current.cards[0].rank === Rank.Ace
    const autoStand = isAces && !this.rules.hitSplitAces

    const hand1Cards = [current.cards[0], state.shoe.deal()]
    // Non-aces: hand 2 waits with 1 card until it becomes active.
    // Aces with autoStand: both hands get cards immediately (standard casino rule).
    const hand2Cards = autoStand
      ? [current.cards[1], state.shoe.deal()]
      : [current.cards[1]]

    const newPlayerHands = [
      ...state.playerHands.slice(0, state.currentHandIndex),
      // placeholders — filled below
      {} as Hand,
      {} as Hand,
      ...state.playerHands.slice(state.currentHandIndex + 1),
    ]

    // Check if re-splitting Aces is possible (room for another split)
    const newHandCount = newPlayerHands.length
    const canReSplit =
      autoStand &&
      this.rules.resplitAllowed &&
      newHandCount < this.rules.maxSplitHands

    const hand1: Hand = {
      cards: hand1Cards,
      bet: current.bet,
      isDoubled: false,
      isSplit: true,
      isStanding:
        canReSplit && hand1Cards[1].rank === Rank.Ace
          ? false
          : autoStand || getHandValue(hand1Cards).best === 21,
    }
    const hand2: Hand = {
      cards: hand2Cards,
      bet: current.bet,
      isDoubled: false,
      isSplit: true,
      isStanding:
        canReSplit && hand2Cards[1].rank === Rank.Ace
          ? false
          : autoStand,
    }

    newPlayerHands[state.currentHandIndex] = hand1
    newPlayerHands[state.currentHandIndex + 1] = hand2

    return this.advanceIfNeeded({
      ...state,
      playerHands: newPlayerHands,
    })
  }

  /**
   * Player surrenders, forfeiting half the bet. Only allowed as the first action.
   * @param state - Current game state
   * @returns New GameState with the round over and hand result = Surrender
   */
  surrender(state: GameState): GameState {
    const current = state.playerHands[state.currentHandIndex]
    if (current.cards.length !== 2 || current.isSplit) {
      throw new Error('Surrender is only allowed as the first action')
    }

    const newHand: Hand = {
      ...current,
      isStanding: true,
      result: HandResult.Surrender,
    }

    return {
      ...state,
      playerHands: [newHand],
      isRoundOver: true,
      phase: 'settlement',
    }
  }

  /**
   * Player takes insurance (side bet of half the original wager).
   * Available only when dealer's upcard is an Ace.
   * @param state - Current game state
   * @returns New GameState with insuranceBet set
   */
  insurance(state: GameState): GameState {
    const dealerUpcard = state.dealerHand.cards[0]
    if (dealerUpcard.rank !== Rank.Ace) {
      throw new Error('Insurance is only available when dealer shows Ace')
    }

    return {
      ...state,
      insuranceBet: Math.floor(state.playerHands[0].bet / 2),
    }
  }

  /**
   * Dealer draws cards according to casino rules.
   *
   * - Dealer must hit on hard 16 or less
   * - With H17: dealer also hits on soft 17
   * - With S17: dealer stands on all 17s
   * @param state - Current game state (phase should be dealerTurn)
   * @returns New GameState after dealer has finished drawing
   */
  playDealerHand(state: GameState): GameState {
    // If all player hands are busted or natural BJ, dealer doesn't need to draw
    const allBustedOrBJ = state.playerHands.every(
      (h) => isBust(h.cards) || (isBlackjack(h.cards) && !h.isSplit)
    )
    if (allBustedOrBJ) {
      return { ...state, phase: 'settlement' }
    }

    let dealerCards = [...state.dealerHand.cards]

    while (this.dealerMustHit(dealerCards)) {
      dealerCards = [...dealerCards, state.shoe.deal()]
    }

    return {
      ...state,
      dealerHand: { ...state.dealerHand, cards: dealerCards },
      phase: 'settlement',
    }
  }

  /**
   * Settles all hands: compares player totals to dealer total,
   * assigns HandResult to each hand, and marks the round as over.
   * @param state - Current game state (phase should be settlement)
   * @returns New GameState with all hands settled and isRoundOver = true
   */
  settleRound(state: GameState): GameState {
    const dealerValue = getHandValue(state.dealerHand.cards).best
    const dealerHasBJ = isBlackjack(state.dealerHand.cards)

    const settledHands = state.playerHands.map((hand): Hand => {
      // Already settled (e.g. surrender)
      if (hand.result !== undefined) {
        return hand
      }

      const playerValue = getHandValue(hand.cards).best
      const playerHasBJ = isBlackjack(hand.cards) && !hand.isSplit

      if (isBust(hand.cards)) {
        return { ...hand, result: HandResult.Loss }
      }

      if (playerHasBJ && dealerHasBJ) {
        return { ...hand, result: HandResult.Push }
      }

      if (playerHasBJ) {
        return { ...hand, result: HandResult.Blackjack }
      }

      if (dealerHasBJ) {
        return { ...hand, result: HandResult.Loss }
      }

      if (isBust(state.dealerHand.cards)) {
        return { ...hand, result: HandResult.Win }
      }

      if (playerValue > dealerValue) {
        return { ...hand, result: HandResult.Win }
      }

      if (playerValue < dealerValue) {
        return { ...hand, result: HandResult.Loss }
      }

      return { ...hand, result: HandResult.Push }
    })

    return {
      ...state,
      playerHands: settledHands,
      isRoundOver: true,
      phase: 'settlement',
    }
  }

  /**
   * Determines which actions are currently available to the player.
   * @param state - Current game state
   * @returns Array of available Action values
   */
  getAvailableActions(state: GameState): Action[] {
    if (state.isRoundOver || state.phase !== 'playerTurn') {
      return []
    }

    const current = state.playerHands[state.currentHandIndex]

    if (current.isStanding) {
      return []
    }

    // Player has natural blackjack (not from split)
    if (isBlackjack(current.cards) && !current.isSplit) {
      // Dealer shows Ace and no insurance taken → offer insurance + stand
      if (
        state.dealerHand.cards[0].rank === Rank.Ace &&
        state.insuranceBet === 0 &&
        this.rules.insuranceAllowed
      ) {
        return [Action.Insurance, Action.Stand]
      }
      // Otherwise → auto-settle (no actions needed)
      return []
    }

    // Hand has reached 21 (3+ cards) → auto-stand
    if (getHandValue(current.cards).best === 21) {
      return []
    }

    // Split Aces with no-hit: only Stand (and possibly Split) — no Hit or Double
    const isSplitAcesNoHit =
      current.isSplit &&
      current.cards[0].rank === Rank.Ace &&
      !this.rules.hitSplitAces

    const actions: Action[] = isSplitAcesNoHit
      ? [Action.Stand]
      : [Action.Hit, Action.Stand]
    const isFirstAction = current.cards.length === 2 && !current.isSplit

    // Double: allowed on first 2 cards (and after split if doubleAfterSplit)
    if (!isSplitAcesNoHit && current.cards.length === 2) {
      if (!current.isSplit || this.rules.doubleAfterSplit) {
        actions.push(Action.Double)
      }
    }

    // Split: allowed on pairs if under maxSplitHands and resplit allowed
    if (
      isPair(current.cards) &&
      state.playerHands.length < this.rules.maxSplitHands
    ) {
      if (!current.isSplit || this.rules.resplitAllowed) {
        actions.push(Action.Split)
      }
    }

    // Surrender: only as very first action, not on split hands
    if (isFirstAction && this.rules.surrenderAllowed !== 'none') {
      actions.push(Action.Surrender)
    }

    // Insurance: only when dealer shows Ace and no insurance yet taken
    if (
      isFirstAction &&
      state.insuranceBet === 0 &&
      this.rules.insuranceAllowed &&
      state.dealerHand.cards[0].rank === Rank.Ace
    ) {
      actions.push(Action.Insurance)
    }

    return actions
  }

  /**
   * Checks if dealer must draw another card according to the rules.
   */
  private dealerMustHit(cards: readonly import('../shoe/types').Card[]): boolean {
    const { best } = getHandValue([...cards])
    if (best < 17) return true
    if (best > 17) return false
    // best === 17: hit only if soft 17 and H17 rule
    return this.rules.dealerHitsSoft17 && isSoft([...cards])
  }

  /**
   * Advances to the next unfinished hand or to dealer turn
   * if all player hands are standing/busted.
   */
  private advanceIfNeeded(state: GameState): GameState {
    const current = state.playerHands[state.currentHandIndex]

    // If current hand is still active, no advance needed
    if (!current.isStanding) {
      return state
    }

    let updatedState = state

    // Find the next hand that isn't standing
    for (let i = state.currentHandIndex + 1; i < updatedState.playerHands.length; i++) {
      let hand = updatedState.playerHands[i]

      // Deal card to 1-card split hand when it becomes active
      if (hand.isSplit && hand.cards.length === 1) {
        const card = updatedState.shoe.deal()
        const newCards = [...hand.cards, card]
        hand = {
          ...hand,
          cards: newCards,
          isStanding: getHandValue(newCards).best === 21,
        }
        const newHands = [...updatedState.playerHands]
        newHands[i] = hand
        updatedState = { ...updatedState, playerHands: newHands }
      }

      if (!hand.isStanding) {
        return { ...updatedState, currentHandIndex: i }
      }
    }

    // All hands done → move to dealer turn
    return { ...updatedState, phase: 'dealerTurn' }
  }
}
