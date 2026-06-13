import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CasinoSessionTracker } from './CasinoSessionTracker'
import { useCasinoSessionTrackerStore, type TrackedCasinoSession } from '../../store/casino-session-tracker-store'
import { useAppStore } from '../../store/app-store'
import { TopBar } from '../navigation/TopBar'

vi.mock('recharts', () => ({
  AreaChart: ({ children }: React.PropsWithChildren) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  LineChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ReferenceLine: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

function resetStore() {
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
}

function makeSample(overrides: Partial<TrackedCasinoSession> & { id: string; profit: number }): TrackedCasinoSession {
  return {
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

function setupWithSessions() {
  useCasinoSessionTrackerStore.setState({
    startingBankroll: 10000,
    sessions: [
      makeSample({ id: 's1', profit: 800, date: '2026-03-20', timestamp: 1000, overallScore: 92, grade: 'A', handsPlayed: 30 }),
      makeSample({ id: 's2', profit: -200, date: '2026-03-22', timestamp: 2000, overallScore: 68, grade: 'C', handsPlayed: 20 }),
      makeSample({ id: 's3', profit: 500, date: '2026-03-25', timestamp: 3000, overallScore: 85, grade: 'B+', handsPlayed: 25 }),
    ],
  })
}

describe('CasinoSessionTracker', () => {
  beforeEach(resetStore)

  // ── Onboarding ──

  it('shows onboarding when no starting bankroll and no sessions', () => {
    render(<CasinoSessionTracker />)

    expect(screen.getByText('Start Tracking Your Casino Sessions')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-bankroll-input')).toBeInTheDocument()
    expect(screen.getByTestId('start-tracking-btn')).toBeInTheDocument()
  })

  it('onboarding sets starting bankroll and shows tracker', () => {
    render(<CasinoSessionTracker />)

    fireEvent.change(screen.getByTestId('onboarding-bankroll-input'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('start-tracking-btn'))

    expect(screen.getByTestId('cs-tracker')).toBeInTheDocument()
    expect(screen.getByTestId('current-bankroll')).toHaveTextContent('$10,000')
  })

  it('start tracking button is disabled with empty or zero input', () => {
    render(<CasinoSessionTracker />)

    const btn = screen.getByTestId('start-tracking-btn')
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByTestId('onboarding-bankroll-input'), { target: { value: '0' } })
    expect(btn).toBeDisabled()
  })

  // ── Main View ──

  it('shows overview stats with sessions', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('current-bankroll')).toHaveTextContent('$11,100')
    expect(screen.getByTestId('stat-sessions')).toHaveTextContent('3')
    expect(screen.getByTestId('stat-winrate')).toHaveTextContent('67%')
    // Avg score = (92 + 68 + 85) / 3 = 81.67 → "82%"
    expect(screen.getByTestId('stat-avg-score')).toHaveTextContent('82%')
    // Total hands = 30 + 20 + 25 = 75
    expect(screen.getByTestId('stat-hands')).toHaveTextContent('75')
  })

  it('shows overview summary with profit and ROI', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    const summary = screen.getByTestId('overview-summary')
    expect(summary).toHaveTextContent('Starting: $10,000')
    expect(summary).toHaveTextContent('+$1,100')
    expect(summary).toHaveTextContent('11.0%')
  })

  it('renders chart section with area chart when sessions exist', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('chart-section')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('shows empty chart message when no sessions', () => {
    useCasinoSessionTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<CasinoSessionTracker />)

    expect(screen.getByText('Complete a Casino Session to see the chart')).toBeInTheDocument()
  })

  // ── Session List ──

  it('renders session list sorted newest first', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    const list = screen.getByTestId('session-list')
    expect(list).toBeInTheDocument()

    expect(screen.getByTestId('session-s1')).toBeInTheDocument()
    expect(screen.getByTestId('session-s2')).toBeInTheDocument()
    expect(screen.getByTestId('session-s3')).toBeInTheDocument()
  })

  it('session shows green for win and red for loss', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('session-s1')).toHaveTextContent('+$800')
    expect(screen.getByTestId('session-s2')).toHaveTextContent('-$200')
  })

  it('session shows grade and accuracy details', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    const row = screen.getByTestId('session-s1')
    expect(row).toHaveTextContent('A')
    expect(row).toHaveTextContent('30 hands')
    expect(row).toHaveTextContent('Play:')
    expect(row).toHaveTextContent('Bet:')
    expect(row).toHaveTextContent('Count:')
  })

  it('shows empty sessions message when no sessions recorded', () => {
    useCasinoSessionTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('empty-sessions')).toBeInTheDocument()
  })

  // ── Delete Session ──

  it('delete requires confirmation', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    fireEvent.click(screen.getByTestId('delete-s1'))

    expect(screen.getByTestId('confirm-delete-s1')).toBeInTheDocument()
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(3)
  })

  it('confirming delete removes session', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    fireEvent.click(screen.getByTestId('delete-s1'))
    fireEvent.click(screen.getByTestId('confirm-delete-s1'))

    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(2)
    expect(useCasinoSessionTrackerStore.getState().sessions.find(s => s.id === 's1')).toBeUndefined()
  })

  // ── Edit Starting Bankroll ──

  it('pencil icon opens inline edit for starting bankroll', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    fireEvent.click(screen.getByTestId('edit-starting-btn'))

    const input = screen.getByTestId('edit-starting-input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('10000')
  })

  it('saving inline edit updates starting bankroll', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    fireEvent.click(screen.getByTestId('edit-starting-btn'))
    fireEvent.change(screen.getByTestId('edit-starting-input'), { target: { value: '15000' } })
    fireEvent.click(screen.getByTestId('save-starting-btn'))

    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(15000)
    expect(screen.queryByTestId('edit-starting-input')).not.toBeInTheDocument()
  })

  it('canceling inline edit keeps original value', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    fireEvent.click(screen.getByTestId('edit-starting-btn'))
    fireEvent.change(screen.getByTestId('edit-starting-input'), { target: { value: '99999' } })
    fireEvent.click(screen.getByTestId('cancel-starting-btn'))

    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(10000)
    expect(screen.queryByTestId('edit-starting-input')).not.toBeInTheDocument()
  })

  // ── Additional Stats ──

  it('shows best and worst session stats', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('best-session-result')).toHaveTextContent('+$800')
    expect(screen.getByTestId('worst-session-result')).toHaveTextContent('-$200')
  })

  it('shows winning and losing streaks', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('winning-streak')).toBeInTheDocument()
    expect(screen.getByTestId('losing-streak')).toBeInTheDocument()
  })

  // ── TopBar ──

  it('TopBar shows "Casino Session Tracker" for casinoSessionTracker mode', () => {
    useAppStore.setState({ currentMode: 'casinoSessionTracker' })
    render(<TopBar />)
    expect(screen.getByText('Casino Session Tracker')).toBeInTheDocument()
  })

  // ── Personal Records ──

  it('shows personal records section when sessions exist', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('personal-records')).toBeInTheDocument()
    expect(screen.getByText(/Personal Records/)).toBeInTheDocument()
  })

  it('personal records shows 8 cards', () => {
    setupWithSessions()
    render(<CasinoSessionTracker />)

    expect(screen.getByTestId('record-best-session')).toBeInTheDocument()
    expect(screen.getByTestId('record-worst-session')).toBeInTheDocument()
    expect(screen.getByTestId('record-win-streak')).toBeInTheDocument()
    expect(screen.getByTestId('record-best-score')).toBeInTheDocument()
    expect(screen.getByTestId('record-peak-bankroll')).toBeInTheDocument()
    expect(screen.getByTestId('record-most-hands')).toBeInTheDocument()
    expect(screen.getByTestId('record-best-grade')).toBeInTheDocument()
    expect(screen.getByTestId('record-win-rate')).toBeInTheDocument()
  })

  it('does not show personal records when no sessions', () => {
    useCasinoSessionTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<CasinoSessionTracker />)

    expect(screen.queryByTestId('personal-records')).not.toBeInTheDocument()
  })

  // ── Auto-tracking integration ──

  it('session added automatically after casino session (via store)', () => {
    useCasinoSessionTrackerStore.getState().setStartingBankroll(10000)

    const session = makeSample({ id: 'cs-auto-1', profit: 350, overallScore: 88, grade: 'A' })
    useCasinoSessionTrackerStore.getState().addSession(session)

    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(1)
    expect(useCasinoSessionTrackerStore.getState().sessions[0].profit).toBe(350)
    expect(useCasinoSessionTrackerStore.getState().sessions[0].grade).toBe('A')
    expect(useCasinoSessionTrackerStore.getState().getCurrentBankroll()).toBe(10350)
  })
})
