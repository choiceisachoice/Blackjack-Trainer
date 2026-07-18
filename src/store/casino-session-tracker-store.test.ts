import { describe, it, expect, beforeEach } from 'vitest'
import { useCasinoSessionTrackerStore, type TrackedCasinoSession } from './casino-session-tracker-store'

function resetStore() {
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
}

function makeSample(overrides: Partial<TrackedCasinoSession> & { profit: number }): TrackedCasinoSession {
  return {
    id: `cs-${Date.now()}-${Math.random()}`,
    date: '2026-03-28',
    timestamp: Date.now(),
    handsPlayed: 25,
    duration: 1800,
    startingBankroll: 10000,
    finalBankroll: 10000 + overrides.profit,
    betAccuracy: 85,
    playAccuracy: 90,
    countAccuracy: 75,
    overallScore: 83,
    grade: 'B+',
    numBots: 2,
    config: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
    ...overrides,
  }
}

function addSample(overrides: Partial<TrackedCasinoSession> & { profit: number }) {
  useCasinoSessionTrackerStore.getState().addSession(makeSample(overrides))
}

describe('casino-session-tracker-store', () => {
  beforeEach(resetStore)

  it('addSession adds to sessions array', () => {
    addSample({ profit: 500 })

    const { sessions } = useCasinoSessionTrackerStore.getState()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].profit).toBe(500)
  })

  it('getCurrentBankroll = starting + sum(profits)', () => {
    useCasinoSessionTrackerStore.getState().setStartingBankroll(10000)
    addSample({ profit: 500 })
    addSample({ profit: -200 })
    addSample({ profit: 800 })

    expect(useCasinoSessionTrackerStore.getState().getCurrentBankroll()).toBe(11100)
  })

  it('getTotalProfit = sum(profits)', () => {
    addSample({ profit: 500 })
    addSample({ profit: -200 })
    addSample({ profit: 300 })

    expect(useCasinoSessionTrackerStore.getState().getTotalProfit()).toBe(600)
  })

  it('getWinRate counts positive profit sessions', () => {
    addSample({ profit: 500 })
    addSample({ profit: -200 })
    addSample({ profit: 300 })
    addSample({ profit: -100 })

    expect(useCasinoSessionTrackerStore.getState().getWinRate()).toBe(0.5)
  })

  it('getAvgScore averages overall scores', () => {
    addSample({ profit: 100, overallScore: 80 })
    addSample({ profit: -50, overallScore: 90 })
    addSample({ profit: 200, overallScore: 70 })

    expect(useCasinoSessionTrackerStore.getState().getAvgScore()).toBe(80)
  })

  it('getBestSession returns highest profit', () => {
    addSample({ profit: 200 })
    addSample({ profit: 800 })
    addSample({ profit: -100 })

    expect(useCasinoSessionTrackerStore.getState().getBestSession()!.profit).toBe(800)
  })

  it('getWorstSession returns lowest profit', () => {
    addSample({ profit: 200 })
    addSample({ profit: -400 })
    addSample({ profit: -100 })

    expect(useCasinoSessionTrackerStore.getState().getWorstSession()!.profit).toBe(-400)
  })

  it('deleteSession removes from array', () => {
    addSample({ profit: 500 })
    addSample({ profit: -200 })

    const { sessions } = useCasinoSessionTrackerStore.getState()
    expect(sessions).toHaveLength(2)

    useCasinoSessionTrackerStore.getState().deleteSession(sessions[0].id)
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(1)
  })

  it('persists in localStorage', () => {
    useCasinoSessionTrackerStore.getState().setStartingBankroll(10000)
    addSample({ profit: 500 })

    const stored = JSON.parse(localStorage.getItem('bjt_casino_session_tracker') ?? '{}')
    expect(stored.state.startingBankroll).toBe(10000)
    expect(stored.state.sessions).toHaveLength(1)
    expect(stored.state.sessions[0].profit).toBe(500)
  })

  it('starting bankroll editable without losing sessions', () => {
    useCasinoSessionTrackerStore.getState().setStartingBankroll(5000)
    addSample({ profit: 200 })
    addSample({ profit: -100 })

    useCasinoSessionTrackerStore.getState().setStartingBankroll(15000)

    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(15000)
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(2)
    expect(useCasinoSessionTrackerStore.getState().getCurrentBankroll()).toBe(15100)
  })

  it('handles empty sessions array', () => {
    const store = useCasinoSessionTrackerStore.getState()

    expect(store.getCurrentBankroll()).toBe(0)
    expect(store.getTotalProfit()).toBe(0)
    expect(store.getTotalHours()).toBe(0)
    expect(store.getWinRate()).toBe(0)
    expect(store.getAvgPerHour()).toBe(0)
    expect(store.getAvgScore()).toBe(0)
    expect(store.getBestSession()).toBeNull()
    expect(store.getWorstSession()).toBeNull()
    expect(store.getSessionCount()).toBe(0)
    expect(store.getWinningStreak()).toBe(0)
    expect(store.getLosingStreak()).toBe(0)
    expect(store.getTotalHands()).toBe(0)
  })

  it('winning streak counts consecutive wins by timestamp', () => {
    addSample({ profit: 100, timestamp: 1000 })
    addSample({ profit: 200, timestamp: 2000 })
    addSample({ profit: 300, timestamp: 3000 })
    addSample({ profit: -50, timestamp: 4000 })
    addSample({ profit: 100, timestamp: 5000 })

    expect(useCasinoSessionTrackerStore.getState().getWinningStreak()).toBe(3)
  })

  it('losing streak counts consecutive losses by timestamp', () => {
    addSample({ profit: 100, timestamp: 1000 })
    addSample({ profit: -50, timestamp: 2000 })
    addSample({ profit: -100, timestamp: 3000 })
    addSample({ profit: -200, timestamp: 4000 })
    addSample({ profit: 100, timestamp: 5000 })

    expect(useCasinoSessionTrackerStore.getState().getLosingStreak()).toBe(3)
  })

  it('getTotalHands sums all handsPlayed', () => {
    addSample({ profit: 100, handsPlayed: 20 })
    addSample({ profit: -50, handsPlayed: 30 })
    addSample({ profit: 200, handsPlayed: 15 })

    expect(useCasinoSessionTrackerStore.getState().getTotalHands()).toBe(65)
  })

  it('getTotalHours converts seconds to hours', () => {
    addSample({ profit: 100, duration: 3600 })  // 1 hour
    addSample({ profit: -50, duration: 1800 })   // 0.5 hours

    expect(useCasinoSessionTrackerStore.getState().getTotalHours()).toBe(1.5)
  })

  it('reset clears everything', () => {
    useCasinoSessionTrackerStore.getState().setStartingBankroll(10000)
    addSample({ profit: 500 })

    useCasinoSessionTrackerStore.getState().reset()

    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(0)
    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(0)
  })

  // ── Personal Records ──

  describe('getPersonalRecords', () => {
    it('returns empty records with no sessions', () => {
      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.bestSession).toBeNull()
      expect(records.worstSession).toBeNull()
      expect(records.bestScore).toBeNull()
      expect(records.bestGrade).toBe('')
      expect(records.longestWinStreak).toBe(0)
      expect(records.longestLossStreak).toBe(0)
      expect(records.highestBankroll).toBe(0)
      expect(records.lowestBankroll).toBe(0)
    })

    it('bestSession has highest profit', () => {
      addSample({ profit: 200, timestamp: 1000 })
      addSample({ profit: 800, timestamp: 2000 })
      addSample({ profit: -100, timestamp: 3000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.bestSession!.profit).toBe(800)
    })

    it('bestScore has highest overallScore', () => {
      addSample({ profit: 200, overallScore: 85, timestamp: 1000 })
      addSample({ profit: -100, overallScore: 97, timestamp: 2000 })
      addSample({ profit: 300, overallScore: 70, timestamp: 3000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.bestScore!.overallScore).toBe(97)
    })

    it('bestGrade picks highest grade', () => {
      addSample({ profit: 200, grade: 'B+', timestamp: 1000 })
      addSample({ profit: -100, grade: 'A', timestamp: 2000 })
      addSample({ profit: 300, grade: 'B', timestamp: 3000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.bestGrade).toBe('A')
    })

    it('longestWinStreak is correct', () => {
      addSample({ profit: 100, timestamp: 1000 })
      addSample({ profit: 200, timestamp: 2000 })
      addSample({ profit: 300, timestamp: 3000 })
      addSample({ profit: -50, timestamp: 4000 })
      addSample({ profit: 100, timestamp: 5000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.longestWinStreak).toBe(3)
    })

    it('highestBankroll is correct', () => {
      useCasinoSessionTrackerStore.getState().setStartingBankroll(10000)
      addSample({ profit: 500, timestamp: 1000 })
      addSample({ profit: 800, timestamp: 2000 })
      addSample({ profit: -200, timestamp: 3000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.highestBankroll).toBe(11300)
    })

    it('longestSession picks session with most hands', () => {
      addSample({ profit: 100, handsPlayed: 20, timestamp: 1000 })
      addSample({ profit: 200, handsPlayed: 85, timestamp: 2000 })
      addSample({ profit: -50, handsPlayed: 30, timestamp: 3000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.longestSession!.handsPlayed).toBe(85)
    })

    it('totalHandsPlayed sums all hands', () => {
      addSample({ profit: 100, handsPlayed: 20, timestamp: 1000 })
      addSample({ profit: -50, handsPlayed: 30, timestamp: 2000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.totalHandsPlayed).toBe(50)
    })

    it('averages accuracies correctly', () => {
      addSample({ profit: 100, betAccuracy: 80, playAccuracy: 90, countAccuracy: 70, timestamp: 1000 })
      addSample({ profit: -50, betAccuracy: 90, playAccuracy: 80, countAccuracy: 60, timestamp: 2000 })

      const records = useCasinoSessionTrackerStore.getState().getPersonalRecords()
      expect(records.avgBetAccuracy).toBe(85)
      expect(records.avgPlayAccuracy).toBe(85)
      expect(records.avgCountAccuracy).toBe(65)
    })
  })
})
