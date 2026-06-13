import { describe, it, expect, beforeEach } from 'vitest'
import { useBankrollTrackerStore } from './bankroll-tracker-store'

function resetStore() {
  useBankrollTrackerStore.setState({ sessions: [], startingBankroll: 0 })
}

function addSample(overrides: Partial<Parameters<typeof useBankrollTrackerStore.getState>['0']> & { result: number; date?: string }) {
  useBankrollTrackerStore.getState().addSession({
    date: overrides.date ?? '2026-03-20',
    casino: 'Test Casino',
    result: overrides.result,
    hoursPlayed: overrides.hoursPlayed ?? 3,
    notes: '',
  })
}

describe('bankroll-tracker-store', () => {
  beforeEach(resetStore)

  it('addSession adds to sessions array', () => {
    const store = useBankrollTrackerStore.getState()
    store.addSession({
      date: '2026-03-25',
      casino: 'Bellagio',
      result: 500,
      hoursPlayed: 3,
      notes: 'Good shoe',
    })

    const { sessions } = useBankrollTrackerStore.getState()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].casino).toBe('Bellagio')
    expect(sessions[0].result).toBe(500)
    expect(sessions[0].id).toBeTruthy()
    expect(sessions[0].createdAt).toBeGreaterThan(0)
  })

  it('getCurrentBankroll = starting + sum(results)', () => {
    useBankrollTrackerStore.getState().setStartingBankroll(10000)
    addSample({ result: 500 })
    addSample({ result: -200 })
    addSample({ result: 800 })

    expect(useBankrollTrackerStore.getState().getCurrentBankroll()).toBe(11100)
  })

  it('getTotalProfit = sum(results)', () => {
    addSample({ result: 500 })
    addSample({ result: -200 })
    addSample({ result: 300 })

    expect(useBankrollTrackerStore.getState().getTotalProfit()).toBe(600)
  })

  it('getWinRate counts positive sessions', () => {
    addSample({ result: 500 })
    addSample({ result: -200 })
    addSample({ result: 300 })
    addSample({ result: -100 })

    // 2 wins out of 4 = 50%
    expect(useBankrollTrackerStore.getState().getWinRate()).toBe(0.5)
  })

  it('getAvgPerHour = totalProfit / totalHours', () => {
    addSample({ result: 300, hoursPlayed: 3 })
    addSample({ result: -100, hoursPlayed: 2 })

    // Profit: 200, Hours: 5 → $40/hr
    expect(useBankrollTrackerStore.getState().getAvgPerHour()).toBe(40)
  })

  it('getBestSession returns highest result', () => {
    addSample({ result: 200 })
    addSample({ result: 800 })
    addSample({ result: -100 })

    expect(useBankrollTrackerStore.getState().getBestSession()!.result).toBe(800)
  })

  it('getWorstSession returns lowest result', () => {
    addSample({ result: 200 })
    addSample({ result: -400 })
    addSample({ result: -100 })

    expect(useBankrollTrackerStore.getState().getWorstSession()!.result).toBe(-400)
  })

  it('deleteSession removes from array', () => {
    addSample({ result: 500 })
    addSample({ result: -200 })

    const { sessions } = useBankrollTrackerStore.getState()
    expect(sessions).toHaveLength(2)

    useBankrollTrackerStore.getState().deleteSession(sessions[0].id)

    expect(useBankrollTrackerStore.getState().sessions).toHaveLength(1)
    expect(useBankrollTrackerStore.getState().sessions[0].result).toBe(-200)
  })

  it('editSession updates fields', () => {
    addSample({ result: 500 })

    const id = useBankrollTrackerStore.getState().sessions[0].id
    useBankrollTrackerStore.getState().editSession(id, {
      result: 700,
      casino: 'MGM Grand',
      notes: 'Updated note',
    })

    const updated = useBankrollTrackerStore.getState().sessions[0]
    expect(updated.result).toBe(700)
    expect(updated.casino).toBe('MGM Grand')
    expect(updated.notes).toBe('Updated note')
    expect(updated.id).toBe(id) // ID unchanged
  })

  it('persists in localStorage', () => {
    useBankrollTrackerStore.getState().setStartingBankroll(10000)
    addSample({ result: 500 })

    // Read directly from localStorage
    const stored = JSON.parse(localStorage.getItem('bjt_bankroll_tracker') ?? '{}')
    expect(stored.state.startingBankroll).toBe(10000)
    expect(stored.state.sessions).toHaveLength(1)
    expect(stored.state.sessions[0].result).toBe(500)
  })

  it('handles empty sessions array', () => {
    const store = useBankrollTrackerStore.getState()

    expect(store.getCurrentBankroll()).toBe(0)
    expect(store.getTotalProfit()).toBe(0)
    expect(store.getTotalHours()).toBe(0)
    expect(store.getWinRate()).toBe(0)
    expect(store.getAvgPerHour()).toBe(0)
    expect(store.getBestSession()).toBeNull()
    expect(store.getWorstSession()).toBeNull()
    expect(store.getSessionCount()).toBe(0)
    expect(store.getWinningStreak()).toBe(0)
    expect(store.getLosingStreak()).toBe(0)
  })

  it('winning streak counts consecutive wins by date', () => {
    addSample({ result: 100, date: '2026-03-01' })
    addSample({ result: 200, date: '2026-03-02' })
    addSample({ result: 300, date: '2026-03-03' })
    addSample({ result: -50, date: '2026-03-04' })
    addSample({ result: 100, date: '2026-03-05' })

    expect(useBankrollTrackerStore.getState().getWinningStreak()).toBe(3)
  })

  it('losing streak counts consecutive losses by date', () => {
    addSample({ result: 100, date: '2026-03-01' })
    addSample({ result: -50, date: '2026-03-02' })
    addSample({ result: -100, date: '2026-03-03' })
    addSample({ result: -200, date: '2026-03-04' })
    addSample({ result: 100, date: '2026-03-05' })

    expect(useBankrollTrackerStore.getState().getLosingStreak()).toBe(3)
  })

  it('getTotalHours sums all hoursPlayed', () => {
    addSample({ result: 100, hoursPlayed: 2.5 })
    addSample({ result: -50, hoursPlayed: 3.0 })
    addSample({ result: 200, hoursPlayed: 1.5 })

    expect(useBankrollTrackerStore.getState().getTotalHours()).toBe(7)
  })

  it('getSessionCount returns total number of sessions', () => {
    addSample({ result: 100 })
    addSample({ result: -50 })
    addSample({ result: 200 })

    expect(useBankrollTrackerStore.getState().getSessionCount()).toBe(3)
  })

  it('setStartingBankroll updates starting amount', () => {
    useBankrollTrackerStore.getState().setStartingBankroll(5000)
    expect(useBankrollTrackerStore.getState().startingBankroll).toBe(5000)

    useBankrollTrackerStore.getState().setStartingBankroll(25000)
    expect(useBankrollTrackerStore.getState().startingBankroll).toBe(25000)
  })

  it('zero-result sessions are not counted as win or loss for streaks', () => {
    addSample({ result: 100, date: '2026-03-01' })
    addSample({ result: 0, date: '2026-03-02' })
    addSample({ result: 200, date: '2026-03-03' })

    // 0-result breaks both win and loss streaks
    expect(useBankrollTrackerStore.getState().getWinningStreak()).toBe(1)
  })

  // ── Personal Records ──

  describe('getPersonalRecords', () => {
    it('returns empty records with no sessions', () => {
      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.bestSession).toBeNull()
      expect(records.worstSession).toBeNull()
      expect(records.longestWinStreak).toBe(0)
      expect(records.longestLossStreak).toBe(0)
      expect(records.highestBankroll).toBe(0)
      expect(records.lowestBankroll).toBe(0)
    })

    it('bestSession is highest result', () => {
      addSample({ result: 200, date: '2026-03-01' })
      addSample({ result: 800, date: '2026-03-02' })
      addSample({ result: -100, date: '2026-03-03' })

      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.bestSession!.result).toBe(800)
    })

    it('longestWinStreak is correct', () => {
      addSample({ result: 100, date: '2026-03-01' })
      addSample({ result: 200, date: '2026-03-02' })
      addSample({ result: 300, date: '2026-03-03' })
      addSample({ result: -50, date: '2026-03-04' })
      addSample({ result: 100, date: '2026-03-05' })

      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.longestWinStreak).toBe(3)
    })

    it('highestBankroll is correct', () => {
      useBankrollTrackerStore.getState().setStartingBankroll(10000)
      addSample({ result: 500, date: '2026-03-01' })
      addSample({ result: 800, date: '2026-03-02' })
      addSample({ result: -200, date: '2026-03-03' })

      // Peak: 10000 + 500 + 800 = 11300
      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.highestBankroll).toBe(11300)
    })

    it('bestCasino sums by casino', () => {
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-01', casino: 'Bellagio', result: 500, hoursPlayed: 3, notes: '',
      })
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-02', casino: 'MGM', result: 800, hoursPlayed: 3, notes: '',
      })
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-03', casino: 'Bellagio', result: 600, hoursPlayed: 3, notes: '',
      })

      // Bellagio: 500+600 = 1100, MGM: 800
      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.mostProfitableCasino).toBe('Bellagio')
    })

    it('longestSession picks session with most hours', () => {
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-01', casino: 'A', result: 100, hoursPlayed: 2, notes: '',
      })
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-02', casino: 'B', result: 200, hoursPlayed: 6, notes: '',
      })
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-03', casino: 'C', result: 300, hoursPlayed: 3, notes: '',
      })

      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.longestSession!.hoursPlayed).toBe(6)
    })

    it('bestHourlyRate picks best $/hr session', () => {
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-01', casino: 'A', result: 600, hoursPlayed: 3, notes: '', // $200/hr
      })
      useBankrollTrackerStore.getState().addSession({
        date: '2026-03-02', casino: 'B', result: 100, hoursPlayed: 1, notes: '', // $100/hr
      })

      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.bestHourlyRate!.result / records.bestHourlyRate!.hoursPlayed).toBe(200)
    })

    it('totalWinningDays counts sessions with positive result', () => {
      addSample({ result: 100, date: '2026-03-01' })
      addSample({ result: -50, date: '2026-03-02' })
      addSample({ result: 200, date: '2026-03-03' })
      addSample({ result: 0, date: '2026-03-04' })

      const records = useBankrollTrackerStore.getState().getPersonalRecords()
      expect(records.totalWinningDays).toBe(2)
    })
  })
})
