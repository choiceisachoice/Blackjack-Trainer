import { CasinoSessionEngine } from '../../engine/casino-session/session-engine'
import { Rank, Suit } from '../../engine/shoe/types'
import type { PlayerHandRecord } from '../../engine/casino-session/types'
import type { SavedLiveSession } from '../../services/casino-live-session'
import { DEFAULT_CONFIG } from './helpers'

/**
 * A casino table with hands already played, as it would be saved on a device —
 * for the tests of everything that happens to a saved table afterwards.
 *
 * Test support only: nothing in the app imports this.
 */

/** One finished hand: a $25 bet, stood on 19, won or lost. */
function playedHand(handNumber: number, profit: number, bankrollAfter: number): PlayerHandRecord {
  return {
    handNumber,
    trueCountAtBet: 0,
    runningCountAtBet: 0,
    remainingDecks: 6,
    playerBet: 25,
    correctBet: 25,
    betCorrect: true,
    betError: 0,
    playerCards: [{ rank: Rank.Ten, suit: Suit.Hearts }, { rank: Rank.Nine, suit: Suit.Clubs }],
    dealerUpCard: { rank: Rank.Seven, suit: Suit.Spades },
    dealerHoleCard: { rank: Rank.Ten, suit: Suit.Diamonds },
    dealerFinalCards: [{ rank: Rank.Seven, suit: Suit.Spades }, { rank: Rank.Ten, suit: Suit.Diamonds }],
    decisions: [{ action: 'Stand', correctAction: 'Stand', isCorrect: true, handValueAfter: 19 }],
    firstAction: 'Stand',
    correctFirstAction: 'Stand',
    firstActionCorrect: true,
    wasDeviationSituation: false,
    insuranceOffered: false,
    countChecked: false,
    actualRC: 0,
    actualTC: 0,
    playerHandValue: 19,
    dealerHandValue: 17,
    result: profit >= 0 ? 'win' : 'loss',
    profit,
    bankrollAfter,
    botResults: [],
  }
}

/**
 * A saved table.
 *
 * @param profits - The result of each hand played, in dollars; empty for a
 *   table that was opened and never played at
 * @param overrides - Fields of the saved record to replace (`id`, `savedAt`, …)
 */
export function savedTable(
  profits: number[] = [25, -25, 25],
  overrides: Partial<Omit<SavedLiveSession, 'version' | 'owner' | 'snapshot' | 'config'>> = {},
): Omit<SavedLiveSession, 'version' | 'owner'> {
  const config = { ...DEFAULT_CONFIG, sessionMode: 'unlimited' as const, numBots: 0, countCheckFrequency: 'never' as const, casinoAmbience: false }
  const engine = new CasinoSessionEngine(config)
  profits.forEach((profit, i) => {
    // A round as the table books it: the bet leaves, four cards are dealt,
    // the bet and the result come back, the hand is written down.
    engine.deductHumanBet(25)
    engine.dealNewRound()
    engine.updateHumanBankroll(25 + profit)
    engine.recordHand(playedHand(i + 1, profit, engine.getHumanBankroll()))
  })
  return {
    id: '11111111-2222-4333-8444-555555555555',
    snapshot: engine.snapshot(),
    config,
    elapsedSeconds: 600,
    savedAt: Date.now() - 60_000,
    ui: { lastBets: [25], keptPlaying: false },
    ...overrides,
  }
}
