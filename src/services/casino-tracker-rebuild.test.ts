import { describe, it, expect } from 'vitest'
import { rebuildTrackedSessions, mergeTrackedSessions } from './casino-tracker-rebuild'
import type { TrainingSessionResult, CasinoSessionDetails } from './stats-types'
import type { TrackedCasinoSession } from '../store/casino-session-tracker-store'
import { CountingSystemId } from '../engine/counting/types'

function casinoDetails(over: Partial<CasinoSessionDetails> = {}): CasinoSessionDetails {
  return {
    type: 'casinoSession',
    handsPlayed: 40,
    netProfit: 120,
    overallScore: 88,
    grade: 'A',
    betAccuracy: 91,
    playAccuracy: 95,
    countAccuracy: 87,
    deviationAccuracy: 80,
    numBots: 2,
    hadBlackjack: true,
    longestWinStreak: 4,
    splitAces: false,
    maxSplitHands: 2,
    startingBankroll: 1000,
    finalBankroll: 1120,
    tableConfig: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
    ...over,
  }
}

function session(over: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
  return {
    id: 'a',
    mode: 'casinoSession',
    timestamp: '2026-08-20T18:30:00.000Z',
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 1800,
    totalQuestions: 60,
    correctAnswers: 55,
    accuracy: 55 / 60,
    bestStreak: 9,
    details: casinoDetails(),
    ...over,
  } as TrainingSessionResult
}

describe('rebuildTrackedSessions', () => {
  it('rebuilds a tracker row from a synced casino session', () => {
    const [row] = rebuildTrackedSessions([session()])
    expect(row).toMatchObject({
      id: 'a',
      handsPlayed: 40,
      duration: 1800,
      startingBankroll: 1000,
      finalBankroll: 1120,
      profit: 120,
      grade: 'A',
      numBots: 2,
      config: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
    })
  })

  /**
   * The point of the module. A tracker chart is a money chart, and a fabricated
   * opening balance would look exactly as authoritative as a real one — so a
   * session recorded before those fields existed is left out, not filled in.
   */
  it('skips sessions that predate the bankroll fields rather than inventing them', () => {
    const old = session({
      id: 'old',
      details: { ...casinoDetails(), startingBankroll: undefined, finalBankroll: undefined },
    })
    expect(rebuildTrackedSessions([old])).toEqual([])
    expect(rebuildTrackedSessions([old, session({ id: 'new' })])).toHaveLength(1)
  })

  it('ignores sessions from other training modes', () => {
    const drill = session({
      id: 'drill',
      mode: 'speedDrill',
      details: { type: 'speedDrill', cardsPerRound: 20, speedMs: 1000, rcErrors: [] },
    })
    expect(rebuildTrackedSessions([drill])).toEqual([])
  })

  it('sorts oldest first, so the bankroll curve reads left to right', () => {
    const rows = rebuildTrackedSessions([
      session({ id: 'later', timestamp: '2026-08-22T10:00:00.000Z' }),
      session({ id: 'earlier', timestamp: '2026-08-20T10:00:00.000Z' }),
    ])
    expect(rows.map(r => r.id)).toEqual(['earlier', 'later'])
  })
})

describe('mergeTrackedSessions', () => {
  const row = (id: string, timestamp: number, profit: number): TrackedCasinoSession => ({
    id, date: '2026-08-20', timestamp, handsPlayed: 10, duration: 600,
    startingBankroll: 1000, finalBankroll: 1000 + profit, profit,
    betAccuracy: 90, playAccuracy: 90, countAccuracy: 90, overallScore: 90,
    grade: 'A', numBots: 1, config: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
  })

  it('keeps rows that exist only on one side', () => {
    const merged = mergeTrackedSessions([row('local', 2, 50)], [row('cloud', 1, 10)])
    expect(merged.map(r => r.id)).toEqual(['cloud', 'local'])
  })

  /** Same rule as the bankroll sync: an edit made here is the newer fact. */
  it('lets the local row win a conflict', () => {
    const merged = mergeTrackedSessions([row('x', 1, 999)], [row('x', 1, 10)])
    expect(merged).toHaveLength(1)
    expect(merged[0].profit).toBe(999)
  })
})
