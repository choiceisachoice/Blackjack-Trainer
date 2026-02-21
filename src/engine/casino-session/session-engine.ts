import { Shoe } from '../shoe/shoe'
import type { Card } from '../shoe/types'
import { getHandValue, isBlackjack, isBust, isSoft } from '../rules/hand-utils'
import { getOptimalAction } from '../strategy/basic-strategy'
import type { CasinoRules } from '../rules/types'
import { Action, DEFAULT_RULES } from '../rules/types'
import { getCountValue, getInitialRunningCount, getSystemById } from '../counting/counting-systems'
import { findMatchingDeviation, getDeviationAction, ILLUSTRIOUS_18, FAB_4 } from '../counting/deviations'
import type { CountingSystemConfig, Deviation } from '../counting/types'
import { createBot, playBotTurn, refillBotBankroll } from './bot-player'
import type {
  BotPlayer,
  BotRoundResult,
  CasinoSessionConfig,
  CasinoSessionResult,
  DealResult,
  PlayDecision,
  PlayerHandRecord,
} from './types'

/** Maximum number of seats at the table. */
const MAX_SEATS = 6

/** Bet spread multipliers indexed by true count. */
const BET_SPREAD: Record<number, number> = {
  0: 1,    // TC ≤ 0
  1: 2,    // TC +1
  2: 4,    // TC +2
  3: 8,    // TC +3
  4: 12,   // TC +4
  5: 16,   // TC +5+
}

/**
 * Core engine for the Casino Session Simulator.
 *
 * Manages a multi-player blackjack table with bot players, card counting,
 * bet evaluation, play evaluation, and session scoring.
 *
 * This engine is INDEPENDENT from the existing game-store.ts and GameEngine.
 * It reuses utility functions (Shoe, handValue, basicStrategy, deviations)
 * but manages its own state and game loop.
 */
export class CasinoSessionEngine {
  private config: CasinoSessionConfig
  private shoe: Shoe
  private countingSystem: CountingSystemConfig
  private allDeviations: Deviation[]

  /** Array of seats (null = empty seat). */
  private seats: (BotPlayer | null)[]
  private humanSeatIndex: number
  private usedBotNames: Set<string> = new Set()

  private runningCount: number = 0
  private cardsDealt: number = 0
  private totalCards: number

  private handHistory: PlayerHandRecord[] = []
  private currentHandNumber: number = 0

  private humanBankroll: number
  private peakBankroll: number
  private worstDrawdown: number = 0

  /** CasinoRules derived from session config (for basic strategy lookups). */
  private casinoRules: CasinoRules

  constructor(config: CasinoSessionConfig) {
    this.config = config
    this.humanBankroll = config.startingBankroll
    this.peakBankroll = config.startingBankroll
    this.countingSystem = getSystemById(config.countingSystem)
    this.allDeviations = [...ILLUSTRIOUS_18, ...FAB_4]
    this.humanSeatIndex = config.playerSeatIndex
    this.totalCards = config.numDecks * 52

    this.casinoRules = {
      ...DEFAULT_RULES,
      numDecks: config.numDecks,
      penetration: config.penetration,
      dealerHitsSoft17: config.dealerHitsSoft17,
      blackjackPayout: config.blackjackPays,
      doubleAfterSplit: config.doubleAfterSplit,
      surrenderAllowed: config.surrenderAllowed ? 'late' : 'none',
      maxSplitHands: config.maxSplitHands,
    }

    this.shoe = this.createShoe()
    this.seats = this.initializeSeats()
  }

  // ─── Initialization ──────────────────────────────────

  private createShoe(): Shoe {
    return new Shoe({
      numDecks: this.config.numDecks,
      penetration: this.config.penetration,
    })
  }

  /**
   * Reshuffles the shoe and resets counting state.
   */
  reshuffle(): void {
    this.shoe.reset()
    this.cardsDealt = 0
    this.runningCount = getInitialRunningCount(
      this.countingSystem,
      this.config.numDecks,
    )
  }

  private initializeSeats(): (BotPlayer | null)[] {
    const seats: (BotPlayer | null)[] = new Array(MAX_SEATS).fill(null)

    // Find available seats (excluding human's seat)
    const availableSeats: number[] = []
    for (let i = 0; i < MAX_SEATS; i++) {
      if (i !== this.humanSeatIndex) {
        availableSeats.push(i)
      }
    }

    // Shuffle available seats
    for (let i = availableSeats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableSeats[i], availableSeats[j]] = [availableSeats[j], availableSeats[i]]
    }

    // Place bots at random seats
    for (let i = 0; i < this.config.numBots && i < availableSeats.length; i++) {
      const seatIdx = availableSeats[i]
      seats[seatIdx] = createBot(
        seatIdx,
        this.config.minBet,
        this.usedBotNames,
        `bot-${i}`,
      )
    }

    return seats
  }

  // ─── Card Drawing ────────────────────────────────────

  /**
   * Draws a card from the shoe and updates the running count.
   * All cards drawn through this method are automatically counted.
   * @returns The drawn card
   */
  drawCard(): Card {
    const card = this.shoe.deal()
    this.cardsDealt++
    this.runningCount += getCountValue(card, this.countingSystem)
    return card
  }

  // ─── Shoe Management ─────────────────────────────────

  /**
   * Checks whether the shoe needs to be reshuffled based on penetration.
   * @returns true if the penetration threshold has been reached
   */
  shouldReshuffle(): boolean {
    return this.cardsDealt >= this.totalCards * this.config.penetration
  }

  /**
   * Reshuffles the shoe if the penetration threshold has been reached.
   * @returns true if a reshuffle occurred
   */
  reshuffleIfNeeded(): boolean {
    if (this.shouldReshuffle()) {
      this.reshuffle()
      return true
    }
    return false
  }

  // ─── Game State Getters ──────────────────────────────

  /** Returns the current running count. */
  getRunningCount(): number {
    return this.runningCount
  }

  /**
   * Returns the current true count (RC / remaining decks),
   * rounded to the nearest 0.5 for realism.
   */
  getTrueCount(): number {
    const remainingDecks = this.getRemainingDecks()
    if (remainingDecks <= 0.25) return 0
    const tc = this.runningCount / remainingDecks
    return Math.round(tc * 2) / 2
  }

  /** Returns the number of remaining decks (as a decimal). */
  getRemainingDecks(): number {
    return (this.totalCards - this.cardsDealt) / 52
  }

  /** Returns the human player's current bankroll. */
  getHumanBankroll(): number {
    return this.humanBankroll
  }

  /** Returns the current hand number. */
  getCurrentHandNumber(): number {
    return this.currentHandNumber
  }

  /** Returns the full hand history. */
  getHandHistory(): PlayerHandRecord[] {
    return [...this.handHistory]
  }

  /** Returns the seat layout. */
  getSeats(): (BotPlayer | null)[] {
    return [...this.seats]
  }

  /** Returns the cards dealt count. */
  getCardsDealt(): number {
    return this.cardsDealt
  }

  /** Returns the total cards in the shoe. */
  getTotalCards(): number {
    return this.totalCards
  }

  // ─── Correct Action Determination ────────────────────

  /**
   * Calculates the correct bet based on the current true count and bet spread.
   * @param trueCount - The current true count
   * @returns The correct bet amount
   */
  getCorrectBet(trueCount: number): number {
    let multiplier = 1
    if (trueCount >= 5) multiplier = BET_SPREAD[5]
    else if (trueCount >= 4) multiplier = BET_SPREAD[4]
    else if (trueCount >= 3) multiplier = BET_SPREAD[3]
    else if (trueCount >= 2) multiplier = BET_SPREAD[2]
    else if (trueCount >= 1) multiplier = BET_SPREAD[1]
    else multiplier = BET_SPREAD[0]

    const bet = this.config.minBet * multiplier
    return Math.min(bet, this.config.maxBet, this.humanBankroll)
  }

  /**
   * Determines the correct action for the player's hand.
   *
   * First checks for applicable deviations, then falls back to basic strategy.
   * @returns The correct action, whether it's a deviation, and the deviation name
   */
  getCorrectAction(
    playerCards: Card[],
    dealerUpCard: Card,
    trueCount: number,
    canSplit: boolean,
    canDouble: boolean,
    canSurrender: boolean,
  ): { action: Action; isDeviation: boolean; deviationName?: string } {
    const bsAction = getOptimalAction(playerCards, dealerUpCard, this.casinoRules)

    // Pairs: if BS says Split, always split (hard-total deviations like
    // "16 vs 10" do NOT apply to pairs like 8,8). Only pair-specific
    // deviations (e.g. "10,10 vs 5") can override a split.
    if (bsAction === Action.Split && canSplit) {
      // Check for pair-specific deviations only (playerHand contains comma)
      const pairDevs = this.allDeviations.filter(d => d.playerHand.includes(','))
      const pairMatch = findMatchingDeviation(playerCards, dealerUpCard, pairDevs)
      if (pairMatch) {
        const devAction = getDeviationAction(playerCards, dealerUpCard, trueCount, pairDevs)
        if (devAction !== null && devAction !== bsAction) {
          return { action: devAction, isDeviation: true, deviationName: pairMatch.name }
        }
      }
      return { action: Action.Split, isDeviation: false }
    }

    // Non-pair hands: check ALL matching deviations (I18 first, then Fab4)
    const playDeviations = this.allDeviations.filter(d => d.playerHand !== '*')

    // Iterate through all deviations to find one that fires at this TC
    for (const dev of playDeviations) {
      const matching = findMatchingDeviation(playerCards, dealerUpCard, [dev])
      if (!matching) continue

      if (trueCount >= dev.trueCountThreshold) {
        const devAction = dev.actionAbove
        if (devAction !== bsAction) {
          return { action: devAction, isDeviation: true, deviationName: dev.name }
        }
      }
      // Don't break — a later deviation (e.g., Fab4) might fire
    }

    return { action: bsAction, isDeviation: false }
  }

  /**
   * Returns whether taking insurance is the correct decision.
   * Insurance is correct at TC >= +3 (I18 #1).
   */
  getCorrectInsurance(trueCount: number): boolean {
    return trueCount >= 3
  }

  // ─── Bet Correctness ─────────────────────────────────

  /**
   * Checks if a player's bet is within acceptable tolerance.
   * @param playerBet - The bet the player placed
   * @param correctBet - The mathematically correct bet
   * @returns true if the bet is acceptable
   */
  isBetCorrect(playerBet: number, correctBet: number): boolean {
    if (correctBet === this.config.minBet) {
      return playerBet === this.config.minBet
    }
    const lowerBound = correctBet * 0.5
    const upperBound = correctBet * 1.5
    return playerBet >= lowerBound && playerBet <= upperBound
  }

  // ─── Deal a Complete Round ───────────────────────────

  /**
   * Deals a new round to all players at the table.
   *
   * Cards are dealt in casino order: left-to-right for round 1 (all face up),
   * then left-to-right for round 2 (face up for players, hole card for dealer).
   *
   * All bot cards are visible and counted — the human player must track them.
   *
   * @returns DealResult with all dealt cards and positions
   */
  dealNewRound(): DealResult {
    const reshuffled = this.reshuffleIfNeeded()
    this.currentHandNumber++

    const humanCards: Card[] = []
    const dealerCards: Card[] = []
    const botHands = new Map<string, Card[]>()
    const allDealtCards: Card[] = []

    // Prepare bots for new round
    for (const seat of this.seats) {
      if (seat && seat.isActive) {
        refillBotBankroll(seat, this.config.minBet, this.usedBotNames)
        seat.currentBet = Math.min(seat.flatBetAmount, seat.bankroll)
        seat.bankroll -= seat.currentBet
        seat.hands = [{
          cards: [],
          bet: seat.currentBet,
          isDoubled: false,
          isSplit: false,
          isBusted: false,
          isStanding: false,
        }]
        botHands.set(seat.id, [])
      }
    }

    // Round 1: One card to each seat (left to right), then dealer
    for (let seatIdx = 0; seatIdx < MAX_SEATS; seatIdx++) {
      if (seatIdx === this.humanSeatIndex) {
        const card = this.drawCard()
        humanCards.push(card)
        allDealtCards.push(card)
      } else {
        const bot = this.seats[seatIdx]
        if (bot && bot.isActive) {
          const card = this.drawCard()
          bot.hands[0].cards.push(card)
          const botCards = botHands.get(bot.id)!
          botCards.push(card)
          allDealtCards.push(card)
        }
      }
    }
    // Dealer's up card
    const dealerUpCard = this.drawCard()
    dealerCards.push(dealerUpCard)
    allDealtCards.push(dealerUpCard)

    // Round 2: Second card to each seat (left to right), then dealer hole card
    for (let seatIdx = 0; seatIdx < MAX_SEATS; seatIdx++) {
      if (seatIdx === this.humanSeatIndex) {
        const card = this.drawCard()
        humanCards.push(card)
        allDealtCards.push(card)
      } else {
        const bot = this.seats[seatIdx]
        if (bot && bot.isActive) {
          const card = this.drawCard()
          bot.hands[0].cards.push(card)
          const botCards = botHands.get(bot.id)!
          botCards.push(card)
          allDealtCards.push(card)
        }
      }
    }
    // Dealer's hole card (face down — NOT counted yet)
    const dealerHoleCard = this.shoe.deal()
    this.cardsDealt++
    // Hole card is NOT added to running count until revealed
    dealerCards.push(dealerHoleCard)
    allDealtCards.push(dealerHoleCard)

    return {
      humanCards,
      dealerUpCard,
      dealerHoleCard,
      botHands,
      reshuffled,
      allDealtCards,
    }
  }

  // ─── Play Bot Hands ──────────────────────────────────

  /**
   * Plays all bot hands in seat order (left to right).
   * Returns an array of all cards drawn by bots (for UI animation/display).
   */
  playAllBotsBefore(humanSeatIndex: number): Card[] {
    return this.playBotRange(0, humanSeatIndex)
  }

  /**
   * Plays all bot hands AFTER the human player's seat.
   */
  playAllBotsAfter(humanSeatIndex: number): Card[] {
    return this.playBotRange(humanSeatIndex + 1, MAX_SEATS)
  }

  private playBotRange(fromSeat: number, toSeat: number): Card[] {
    const drawnCards: Card[] = []

    for (let seatIdx = fromSeat; seatIdx < toSeat; seatIdx++) {
      const bot = this.seats[seatIdx]
      if (!bot || !bot.isActive || bot.hands.length === 0) continue

      // Skip if bot has blackjack
      if (bot.hands[0].cards.length === 2 && isBlackjack(bot.hands[0].cards)) {
        bot.hands[0].isStanding = true
        continue
      }

      const cardsBefore = this.cardsDealt
      bot.hands = playBotTurn(bot, bot.hands[0].cards.length > 0 ? this.getDealerUpCardFromSeats() : bot.hands[0].cards[0], () => this.drawCard(), this.casinoRules)
      // Collect newly drawn cards (approximate)
      const cardsAfter = this.cardsDealt
      // We can't easily collect individual cards here, but the RC is updated via drawCard
    }

    return drawnCards
  }

  private getDealerUpCardFromSeats(): Card {
    // This will be set by the caller — we need to store it
    throw new Error('Use playBotsWithDealerCard instead')
  }

  /**
   * Plays a specific bot's hand against the dealer up card.
   * @param seatIndex - The seat of the bot to play
   * @param dealerUpCard - The dealer's face-up card
   */
  playBotAtSeat(seatIndex: number, dealerUpCard: Card): void {
    const bot = this.seats[seatIndex]
    if (!bot || !bot.isActive || bot.hands.length === 0) return

    // Skip if bot has blackjack
    if (bot.hands[0].cards.length === 2 && isBlackjack(bot.hands[0].cards)) {
      bot.hands[0].isStanding = true
      return
    }

    bot.hands = playBotTurn(
      bot,
      dealerUpCard,
      () => this.drawCard(),
      this.casinoRules,
    )
  }

  /**
   * Plays all bots at the table in seat order.
   * @param dealerUpCard - The dealer's face-up card
   */
  playAllBots(dealerUpCard: Card): void {
    for (let seatIdx = 0; seatIdx < MAX_SEATS; seatIdx++) {
      if (seatIdx === this.humanSeatIndex) continue
      this.playBotAtSeat(seatIdx, dealerUpCard)
    }
  }

  // ─── Play Dealer Hand ────────────────────────────────

  /**
   * Plays the dealer's hand according to casino rules.
   *
   * The hole card is revealed (counted) first, then the dealer draws
   * until reaching 17+ (or soft 17 with H17 rules).
   *
   * @param dealerCards - The dealer's current cards [upCard, holeCard]
   * @returns All dealer cards after playing
   */
  playDealerHand(dealerCards: Card[]): Card[] {
    // Reveal hole card — now it gets counted
    if (dealerCards.length >= 2) {
      this.runningCount += getCountValue(dealerCards[1], this.countingSystem)
    }

    let cards = [...dealerCards]

    // Check if anyone is still in the game (not all busted)
    const allPlayersBusted = this.areAllPlayersBusted()
    if (allPlayersBusted) {
      return cards
    }

    while (this.dealerMustHit(cards)) {
      const card = this.drawCard()
      cards = [...cards, card]
    }

    return cards
  }

  private areAllPlayersBusted(): boolean {
    // Check human — we don't track human hand here, caller should check
    // For now, return false — dealer always plays
    return false
  }

  private dealerMustHit(cards: Card[]): boolean {
    const { best } = getHandValue(cards)
    if (best < 17) return true
    if (best > 17) return false
    // best === 17: hit only if soft 17 and H17 rule
    return this.config.dealerHitsSoft17 && isSoft(cards)
  }

  // ─── Settlement ──────────────────────────────────────

  /**
   * Settles a hand and returns the result and profit/loss.
   * @param playerCards - The player's final cards
   * @param dealerCards - The dealer's final cards
   * @param bet - The bet amount
   * @param isDoubled - Whether the hand was doubled
   * @param isSurrendered - Whether the hand was surrendered
   * @param isSplitHand - Whether this hand came from a split
   * @returns The result and profit for this hand
   */
  settleHand(
    playerCards: Card[],
    dealerCards: Card[],
    bet: number,
    isDoubled: boolean,
    isSurrendered: boolean,
    isSplitHand: boolean = false,
  ): { result: 'win' | 'loss' | 'push' | 'blackjack' | 'surrender'; profit: number } {
    if (isSurrendered) {
      return { result: 'surrender', profit: -bet / 2 }
    }

    const playerValue = getHandValue(playerCards).best
    const dealerValue = getHandValue(dealerCards).best
    const playerHasBJ = isBlackjack(playerCards) && !isSplitHand
    const dealerHasBJ = isBlackjack(dealerCards)

    if (isBust(playerCards)) {
      return { result: 'loss', profit: -bet }
    }

    if (playerHasBJ && dealerHasBJ) {
      return { result: 'push', profit: 0 }
    }

    if (playerHasBJ) {
      return { result: 'blackjack', profit: bet * this.config.blackjackPays }
    }

    if (dealerHasBJ) {
      return { result: 'loss', profit: -bet }
    }

    if (isBust(dealerCards)) {
      return { result: 'win', profit: bet }
    }

    if (playerValue > dealerValue) {
      return { result: 'win', profit: bet }
    }

    if (playerValue < dealerValue) {
      return { result: 'loss', profit: -bet }
    }

    return { result: 'push', profit: 0 }
  }

  /**
   * Settles all bot hands against the dealer.
   * @param dealerCards - The dealer's final cards
   * @returns Array of per-bot round results
   */
  settleBotHands(dealerCards: Card[]): BotRoundResult[] {
    const results: BotRoundResult[] = []

    for (const seat of this.seats) {
      if (!seat || !seat.isActive) continue

      let totalProfit = 0
      for (const hand of seat.hands) {
        const { result, profit } = this.settleHand(
          hand.cards,
          dealerCards,
          hand.bet,
          hand.isDoubled,
          hand.result === 'surrender',
          hand.isSplit,
        )
        hand.result = result
        hand.profit = profit
        totalProfit += profit
        seat.bankroll += hand.bet + profit
      }

      // Use the first hand for display
      const mainHand = seat.hands[0]
      results.push({
        name: seat.name,
        cards: mainHand.cards,
        handValue: getHandValue(mainHand.cards).best,
        result: mainHand.result || 'loss',
        profit: totalProfit,
      })
    }

    return results
  }

  // ─── Human Bankroll ──────────────────────────────────

  /**
   * Updates the human player's bankroll after a hand.
   * Also updates peak and drawdown tracking.
   * @param profit - The profit/loss from the hand
   */
  updateHumanBankroll(profit: number): void {
    this.humanBankroll += profit
    if (this.humanBankroll > this.peakBankroll) {
      this.peakBankroll = this.humanBankroll
    }
    const drawdown = this.peakBankroll - this.humanBankroll
    if (drawdown > this.worstDrawdown) {
      this.worstDrawdown = drawdown
    }
  }

  /**
   * Deducts the bet from the human player's bankroll.
   * @param bet - The bet amount to deduct
   */
  deductHumanBet(bet: number): void {
    this.humanBankroll -= bet
  }

  // ─── Hand Record ─────────────────────────────────────

  /**
   * Records a completed hand for the human player.
   * @param record - The complete hand record
   */
  recordHand(record: PlayerHandRecord): void {
    this.handHistory.push(record)
  }

  // ─── Session Scoring ─────────────────────────────────

  /**
   * Calculates the complete session result with accuracy scores and grade.
   * @param startTime - Session start timestamp
   * @param endTime - Session end timestamp
   * @returns Complete session result
   */
  calculateSessionResult(startTime: number, endTime: number): CasinoSessionResult {
    const hands = this.handHistory

    // Bet accuracy
    const betDecisions = hands.filter(h => h.playerBet > 0)
    const correctBets = betDecisions.filter(h => h.betCorrect).length
    const betAccuracy = betDecisions.length > 0
      ? (correctBets / betDecisions.length) * 100
      : 100

    // Overbet/underbet averages
    let totalOverbet = 0
    let overbetCount = 0
    let totalUnderbet = 0
    let underbetCount = 0
    for (const h of betDecisions) {
      if (h.betError > 0) {
        totalOverbet += h.betError
        overbetCount++
      } else if (h.betError < 0) {
        totalUnderbet += Math.abs(h.betError)
        underbetCount++
      }
    }

    // Play accuracy
    const allDecisions = hands.flatMap(h => h.decisions)
    const correctDecisions = allDecisions.filter(d => d.isCorrect).length
    const playAccuracy = allDecisions.length > 0
      ? (correctDecisions / allDecisions.length) * 100
      : 100

    // Count accuracy
    const countChecks = hands.filter(h => h.countChecked)
    const correctRC = countChecks.filter(h => h.rcCorrect).length
    const correctTC = countChecks.filter(h => h.tcCorrect).length
    const avgRCError = countChecks.length > 0
      ? countChecks.reduce((sum, h) => sum + (h.rcError ?? 0), 0) / countChecks.length
      : 0
    const avgTCError = countChecks.length > 0
      ? countChecks.reduce((sum, h) => sum + (h.tcError ?? 0), 0) / countChecks.length
      : 0
    const countAccuracy = countChecks.length > 0
      ? ((correctRC + correctTC) / (countChecks.length * 2)) * 100
      : 100

    // Deviation accuracy
    const deviationHands = hands.filter(h => h.wasDeviationSituation)
    const correctDevs = deviationHands.filter(h => h.playerFollowedDeviation).length
    const deviationAccuracy = deviationHands.length > 0
      ? (correctDevs / deviationHands.length) * 100
      : 100
    const missedDeviations = deviationHands
      .filter(h => !h.playerFollowedDeviation)
      .map(h => h.deviationName || 'Unknown')

    // Insurance accuracy
    const insuranceHands = hands.filter(h => h.insuranceOffered)
    const correctInsurance = insuranceHands.filter(h => h.correctInsuranceDecision).length
    const insuranceAccuracy = insuranceHands.length > 0
      ? (correctInsurance / insuranceHands.length) * 100
      : 100

    // Overall score (weighted)
    let overallScore: number
    if (this.config.countCheckFrequency === 'never') {
      overallScore = (betAccuracy * 0.30)
        + (playAccuracy * 0.50)
        + (deviationAccuracy * 0.20)
    } else {
      overallScore = (betAccuracy * 0.25)
        + (playAccuracy * 0.40)
        + (countAccuracy * 0.25)
        + (deviationAccuracy * 0.10)
    }

    // Grade
    const { grade, gradeColor } = this.calculateGrade(overallScore)

    // Bankroll stats
    const netProfit = this.humanBankroll - this.config.startingBankroll

    return {
      config: this.config,
      hands,

      startTime,
      endTime,
      durationSeconds: Math.round((endTime - startTime) / 1000),

      startingBankroll: this.config.startingBankroll,
      finalBankroll: this.humanBankroll,
      netProfit,
      peakBankroll: this.peakBankroll,
      worstDrawdown: this.worstDrawdown,

      betAccuracy,
      playAccuracy,
      countAccuracy,
      deviationAccuracy,
      insuranceAccuracy,
      overallScore,

      totalCountChecks: countChecks.length,
      correctRCChecks: correctRC,
      correctTCChecks: correctTC,
      avgRCError,
      avgTCError,

      totalPlayDecisions: allDecisions.length,
      correctPlayDecisions: correctDecisions,
      totalDeviationSituations: deviationHands.length,
      correctDeviations: correctDevs,
      missedDeviations,

      totalBetDecisions: betDecisions.length,
      correctBetDecisions: correctBets,
      avgOverbetAmount: overbetCount > 0 ? totalOverbet / overbetCount : 0,
      avgUnderbetAmount: underbetCount > 0 ? totalUnderbet / underbetCount : 0,

      totalInsuranceOffers: insuranceHands.length,
      correctInsuranceDecisions: correctInsurance,

      grade,
      gradeColor,
    }
  }

  private calculateGrade(score: number): { grade: string; gradeColor: string } {
    if (score >= 95) return { grade: 'A+', gradeColor: '#22c55e' }
    if (score >= 90) return { grade: 'A', gradeColor: '#22c55e' }
    if (score >= 85) return { grade: 'B+', gradeColor: '#84cc16' }
    if (score >= 80) return { grade: 'B', gradeColor: '#eab308' }
    if (score >= 70) return { grade: 'C', gradeColor: '#f97316' }
    if (score >= 60) return { grade: 'D', gradeColor: '#ef4444' }
    return { grade: 'F', gradeColor: '#dc2626' }
  }

  // ─── Deviation Detection ─────────────────────────────

  /**
   * Checks if the current hand situation is a deviation situation.
   * @param playerCards - The player's cards
   * @param dealerUpCard - The dealer's face-up card
   * @param trueCount - The current true count
   * @returns Deviation info if applicable, null otherwise
   */
  checkDeviation(
    playerCards: Card[],
    dealerUpCard: Card,
    trueCount: number,
  ): { name: string; correctAction: Action } | null {
    const bsAction = getOptimalAction(playerCards, dealerUpCard, this.casinoRules)
    const playDeviations = this.allDeviations.filter(d => d.playerHand !== '*')

    // Check all matching deviations (I18 first, then Fab4)
    for (const dev of playDeviations) {
      const matching = findMatchingDeviation(playerCards, dealerUpCard, [dev])
      if (!matching) continue

      const action = trueCount >= dev.trueCountThreshold
        ? dev.actionAbove
        : dev.actionBelow

      if (action !== bsAction) {
        return { name: dev.name, correctAction: action }
      }
    }

    return null
  }

  // ─── Count Check Logic ───────────────────────────────

  /**
   * Determines if a count check should happen on this hand.
   * @param handNumber - The current hand number
   * @returns true if a count check should be performed
   */
  shouldCheckCount(handNumber: number): boolean {
    switch (this.config.countCheckFrequency) {
      case 'every': return true
      case 'every5': return handNumber % 5 === 0
      case 'every10': return handNumber % 10 === 0
      case 'never': return false
    }
  }

  /**
   * Validates a player's count input.
   * RC is exact match. TC allows ±0.5 tolerance.
   */
  validateCountInput(
    playerRC: number,
    playerTC: number,
  ): { rcCorrect: boolean; tcCorrect: boolean; rcError: number; tcError: number } {
    const actualRC = this.runningCount
    const actualTC = this.getTrueCount()

    const rcError = Math.abs(playerRC - actualRC)
    const tcError = Math.abs(playerTC - actualTC)

    return {
      rcCorrect: rcError === 0,
      tcCorrect: tcError <= 0.5,
      rcError,
      tcError,
    }
  }
}
