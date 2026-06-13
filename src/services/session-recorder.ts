import type { Card } from '../engine/shoe/types'
import type { CasinoSessionConfig } from '../engine/casino-session/types'

// ─── Card Format Helpers ─────────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = {
  Hearts: '\u2665',
  Diamonds: '\u2666',
  Clubs: '\u2663',
  Spades: '\u2660',
}

/** Formats a Card object as a readable string like "A\u2660" or "K\u2665". */
export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit] ?? card.suit}`
}

/** Formats an array of Cards as a space-separated string like "A\u2660 K\u2665". */
export function formatHand(cards: Card[]): string {
  return cards.map(formatCard).join(' ')
}

// ─── Types ───────────────────────────────────────────────

/** A single recorded event with timestamp and data. */
export interface RecordedEvent {
  /** Milliseconds since session start. */
  timestamp: number
  /** Event type identifier. */
  type: string
  /** Event-specific data. */
  data: Record<string, unknown>
}

/** Complete state snapshot at a point during a hand. */
export interface HandSnapshot {
  handNumber: number
  phase: string

  // Shoe State
  cardsRemainingInShoe: number
  runningCount: number
  trueCount: number
  cardsDealtThisShoe: number

  // Dealer
  dealerUpCard: string | null
  dealerHoleCard: string | null
  dealerAllCards: string[]
  dealerHandValue: number
  dealerIsBlackjack: boolean

  // Human Player
  humanCards: string[]
  humanHandValue: number
  humanIsBlackjack: boolean
  humanBet: number
  humanBankroll: number
  humanSplitHands?: string[][]

  // Bots
  bots: Array<{
    name: string
    seatIndex: number
    cards: string[]
    handValue: number
    isBlackjack: boolean
    bet: number
    bankroll: number
    splitHands?: string[][]
  }>
}

/** Interface for the recorder — used as a type-only import in the engine. */
export interface SessionEventRecorder {
  record(type: string, data: Record<string, unknown>): void
  recordNewHand(handNumber: number): void
  recordShuffle(handNumber: number): void
  recordCardDealt(
    recipient: string,
    card: string,
    handNumber: number,
    runningCountAfter: number,
    trueCountAfter: number,
  ): void
  recordDealerReveal(
    holeCard: string,
    handNumber: number,
    expectedHoleCard: string,
    runningCountAfter: number,
  ): void
  recordDealerUpCardCheck(
    upCardAtDeal: string,
    upCardAtReveal: string,
    handNumber: number,
  ): void
  recordPlayerAction(
    player: string,
    action: string,
    handValue: number,
    dealerUpCard: string,
    correctAction: string,
    isCorrect: boolean,
    isBlackjack: boolean,
    handNumber: number,
  ): void
  recordBlackjackCheck(
    player: string,
    cards: string[],
    isBlackjack: boolean,
    handNumber: number,
  ): void
  recordSettlement(
    player: string,
    result: string,
    profit: number,
    playerValue: number,
    playerIsBlackjack: boolean,
    dealerValue: number,
    dealerIsBlackjack: boolean,
    bet: number,
    handNumber: number,
  ): void
  recordInsurance(
    playerTook: boolean,
    trueCount: number,
    correctDecision: boolean,
    handNumber: number,
  ): void
  recordCountCheck(
    handNumber: number,
    playerRC: number,
    actualRC: number,
    playerTC: number,
    actualTC: number,
  ): void
  recordBetPlaced(
    player: string,
    amount: number,
    correctAmount: number,
    trueCount: number,
    handNumber: number,
  ): void
  recordPhaseChange(
    handNumber: number,
    fromPhase: string,
    toPhase: string,
  ): void
  recordTimingEvent(
    event: string,
    durationMs: number,
    handNumber: number,
  ): void
  takeSnapshot(handNumber: number, phase: string, state: HandSnapshot): void
  exportLog(): string
  getAnomalyCount(): number
  getAnomalies(): string[]
}

/** Exported log structure. */
interface SessionLog {
  exportedAt: string
  sessionDurationMs: number
  config: CasinoSessionConfig | null
  summary: {
    totalHands: number
    totalEvents: number
    totalAnomalies: number
    anomalies: string[]
  }
  anomalies: string[]
  events: RecordedEvent[]
  handSnapshots: Record<string, HandSnapshot[]>
}

// ─── Session Recorder ────────────────────────────────────

/**
 * Records all events during a Casino Session for diagnostic purposes.
 * Detects anomalies automatically and exports a complete debug log.
 */
export class SessionRecorder implements SessionEventRecorder {
  private events: RecordedEvent[] = []
  private handSnapshots: Map<number, HandSnapshot[]> = new Map()
  private startTime: number = 0
  private config: CasinoSessionConfig | null = null
  private anomalies: string[] = []
  private cardTracker: Map<string, string[]> = new Map()

  /**
   * Starts a new recording session. Resets all state.
   * @param config - The casino session configuration
   */
  start(config: CasinoSessionConfig): void {
    this.events = []
    this.handSnapshots = new Map()
    this.anomalies = []
    this.cardTracker = new Map()
    this.startTime = Date.now()
    this.config = config
    this.record('session_start', { config: config as unknown as Record<string, unknown> })
  }

  // ─── Generic Event Recording ─────────────────────────

  /** Records a generic event with timestamp. */
  record(type: string, data: Record<string, unknown>): void {
    this.events.push({
      timestamp: Date.now() - this.startTime,
      type,
      data,
    })
  }

  // ─── Specific Recorders ──────────────────────────────

  /** Records the start of a new hand. */
  recordNewHand(handNumber: number): void {
    this.record('new_hand', { handNumber })
  }

  /** Records a shoe reshuffle. */
  recordShuffle(handNumber: number): void {
    this.record('shuffle', { handNumber, note: 'New shoe started' })
  }

  /**
   * Records a card being dealt to a specific recipient.
   * Also tracks dealt cards for consistency checking.
   */
  recordCardDealt(
    recipient: string,
    card: string,
    handNumber: number,
    runningCountAfter: number,
    trueCountAfter: number,
  ): void {
    this.record('card_dealt', {
      handNumber,
      recipient,
      card,
      runningCount: runningCountAfter,
      trueCount: trueCountAfter,
    })

    const handKey = `hand_${handNumber}_${recipient}`
    if (!this.cardTracker.has(handKey)) {
      this.cardTracker.set(handKey, [])
    }
    this.cardTracker.get(handKey)!.push(card)
  }

  /**
   * Records the dealer's hole card being revealed.
   * Checks for card change anomaly.
   */
  recordDealerReveal(
    holeCard: string,
    handNumber: number,
    expectedHoleCard: string,
    runningCountAfter: number,
  ): void {
    const cardsMatch = holeCard === expectedHoleCard
    this.record('dealer_reveal', {
      handNumber,
      holeCard,
      expectedHoleCard,
      cardsMatch,
      runningCount: runningCountAfter,
    })

    if (!cardsMatch) {
      const msg = `ANOMALY Hand #${handNumber}: Dealer hole card CHANGED! ` +
        `Expected ${expectedHoleCard}, got ${holeCard}`
      this.anomalies.push(msg)
      this.record('anomaly', {
        handNumber,
        type: 'dealer_card_changed',
        expected: expectedHoleCard,
        actual: holeCard,
      })
    }
  }

  /**
   * Checks whether the dealer's up card changed between deal and reveal.
   */
  recordDealerUpCardCheck(
    upCardAtDeal: string,
    upCardAtReveal: string,
    handNumber: number,
  ): void {
    if (upCardAtDeal !== upCardAtReveal) {
      const msg = `ANOMALY Hand #${handNumber}: Dealer UP card CHANGED! ` +
        `Was ${upCardAtDeal} at deal, now ${upCardAtReveal}`
      this.anomalies.push(msg)
      this.record('anomaly', {
        handNumber,
        type: 'dealer_upcard_changed',
        atDeal: upCardAtDeal,
        atReveal: upCardAtReveal,
      })
    }
  }

  /**
   * Records a player action (human or bot).
   * Detects bot basic strategy violations.
   */
  recordPlayerAction(
    player: string,
    action: string,
    handValue: number,
    dealerUpCard: string,
    correctAction: string,
    isCorrect: boolean,
    isBlackjack: boolean,
    handNumber: number,
  ): void {
    this.record('player_action', {
      handNumber,
      player,
      action,
      handValue,
      dealerUpCard,
      correctAction,
      isCorrect,
      isBlackjack,
    })

    if (player.startsWith('bot:') && !isCorrect && !isBlackjack) {
      const msg = `ANOMALY Hand #${handNumber}: ${player} played ${action} ` +
        `but correct was ${correctAction} (hand: ${handValue} vs dealer ${dealerUpCard})`
      this.anomalies.push(msg)
    }
  }

  /**
   * Records a blackjack check for any player/dealer.
   */
  recordBlackjackCheck(
    player: string,
    cards: string[],
    isBlackjack: boolean,
    handNumber: number,
  ): void {
    this.record('blackjack_check', {
      handNumber,
      player,
      cards,
      isBlackjack,
      cardCount: cards.length,
    })
  }

  /**
   * Records the settlement of a hand.
   * Detects settlement anomalies (BJ not rewarded, wrong win/loss, etc.).
   */
  recordSettlement(
    player: string,
    result: string,
    profit: number,
    playerValue: number,
    playerIsBlackjack: boolean,
    dealerValue: number,
    dealerIsBlackjack: boolean,
    bet: number,
    handNumber: number,
  ): void {
    this.record('settlement', {
      handNumber,
      player,
      result,
      profit,
      playerValue,
      playerIsBlackjack,
      dealerValue,
      dealerIsBlackjack,
      bet,
    })

    // BJ player vs non-BJ dealer should be 'blackjack' result
    if (playerIsBlackjack && !dealerIsBlackjack && result !== 'blackjack') {
      this.anomalies.push(
        `ANOMALY Hand #${handNumber}: ${player} has BLACKJACK vs dealer ` +
        `${dealerValue} (no BJ) but result is "${result}" instead of "blackjack"`,
      )
    }

    // BJ player vs non-BJ dealer should have positive profit
    if (playerIsBlackjack && !dealerIsBlackjack && profit <= 0) {
      this.anomalies.push(
        `ANOMALY Hand #${handNumber}: ${player} has BLACKJACK but profit is ` +
        `${profit} (should be positive!)`,
      )
    }

    // Player value > dealer value (both <=21) should be a win
    if (
      !playerIsBlackjack && playerValue > dealerValue &&
      dealerValue <= 21 && playerValue <= 21 && result !== 'win'
    ) {
      this.anomalies.push(
        `ANOMALY Hand #${handNumber}: ${player} has ${playerValue} > dealer ` +
        `${dealerValue} but result is "${result}" instead of "win"`,
      )
    }

    // Dealer bust — non-busted player should win
    if (playerValue <= 21 && dealerValue > 21 && result !== 'win' && !playerIsBlackjack) {
      this.anomalies.push(
        `ANOMALY Hand #${handNumber}: Dealer BUST (${dealerValue}) but ` +
        `${player} result is "${result}" instead of "win"`,
      )
    }

    // Win with zero profit
    if (result === 'win' && profit === 0) {
      this.anomalies.push(
        `ANOMALY Hand #${handNumber}: ${player} result is "win" but profit is 0`,
      )
    }
  }

  /** Records an insurance decision. */
  recordInsurance(
    playerTook: boolean,
    trueCount: number,
    correctDecision: boolean,
    handNumber: number,
  ): void {
    this.record('insurance', {
      handNumber,
      playerTook,
      trueCount,
      correctDecision,
    })
  }

  /** Records a count check (player's RC/TC vs actual). */
  recordCountCheck(
    handNumber: number,
    playerRC: number,
    actualRC: number,
    playerTC: number,
    actualTC: number,
  ): void {
    this.record('count_check', {
      handNumber,
      playerRC,
      actualRC,
      rcCorrect: playerRC === actualRC,
      rcError: playerRC - actualRC,
      playerTC,
      actualTC,
      tcCorrect: Math.abs(playerTC - actualTC) <= 0.5,
      tcError: playerTC - actualTC,
    })
  }

  /** Records a bet being placed. */
  recordBetPlaced(
    player: string,
    amount: number,
    correctAmount: number,
    trueCount: number,
    handNumber: number,
  ): void {
    this.record('bet_placed', {
      handNumber,
      player,
      amount,
      correctAmount,
      trueCount,
      isCorrect: Math.abs(amount - correctAmount) <= correctAmount * 0.5,
    })
  }

  /** Records a game phase change. */
  recordPhaseChange(
    handNumber: number,
    fromPhase: string,
    toPhase: string,
  ): void {
    this.record('phase_change', {
      handNumber,
      from: fromPhase,
      to: toPhase,
    })
  }

  /** Records a timing event and detects too-fast animations. */
  recordTimingEvent(
    event: string,
    durationMs: number,
    handNumber: number,
  ): void {
    this.record('timing', {
      handNumber,
      event,
      durationMs,
    })

    if (durationMs < 100 && event.includes('animation')) {
      this.anomalies.push(
        `ANOMALY Hand #${handNumber}: ${event} took only ${durationMs}ms ` +
        `(should be at least 300ms for visibility)`,
      )
    }
  }

  // ─── Hand Snapshot ───────────────────────────────────

  /** Takes a complete state snapshot at a point during a hand. */
  takeSnapshot(handNumber: number, phase: string, state: HandSnapshot): void {
    if (!this.handSnapshots.has(handNumber)) {
      this.handSnapshots.set(handNumber, [])
    }
    state.handNumber = handNumber
    state.phase = phase
    this.handSnapshots.get(handNumber)!.push(state)
  }

  // ─── Export ──────────────────────────────────────────

  /** Exports the complete debug log as a JSON string. */
  exportLog(): string {
    const log: SessionLog = {
      exportedAt: new Date().toISOString(),
      sessionDurationMs: Date.now() - this.startTime,
      config: this.config,

      summary: {
        totalHands: this.handSnapshots.size,
        totalEvents: this.events.length,
        totalAnomalies: this.anomalies.length,
        anomalies: [...this.anomalies],
      },

      anomalies: [...this.anomalies],
      events: this.events,
      handSnapshots: Object.fromEntries(this.handSnapshots),
    }

    return JSON.stringify(log, null, 2)
  }

  /** Returns the number of detected anomalies. */
  getAnomalyCount(): number {
    return this.anomalies.length
  }

  /** Returns a copy of all detected anomaly messages. */
  getAnomalies(): string[] {
    return [...this.anomalies]
  }
}
