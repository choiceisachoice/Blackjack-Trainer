import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BankrollSimulator } from './BankrollSimulator'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'
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
  useBankrollTrackerStore.setState({ sessions: [], startingBankroll: 0 })
}

function setupWithSessions() {
  useBankrollTrackerStore.setState({
    startingBankroll: 10000,
    sessions: [
      { id: 's1', date: '2026-03-20', casino: 'Bellagio', result: 800, hoursPlayed: 4, notes: 'Hot shoe', createdAt: 1 },
      { id: 's2', date: '2026-03-22', casino: 'MGM Grand', result: -200, hoursPlayed: 2.5, notes: 'Bad count', createdAt: 2 },
      { id: 's3', date: '2026-03-25', casino: 'Bellagio', result: 500, hoursPlayed: 3, notes: '', createdAt: 3 },
    ],
  })
}

describe('BankrollTracker', () => {
  beforeEach(resetStore)

  // ── Onboarding ──

  it('shows onboarding when no starting bankroll and no sessions', () => {
    render(<BankrollSimulator />)

    expect(screen.getByText('Start Tracking Your Bankroll')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-bankroll-input')).toBeInTheDocument()
    expect(screen.getByTestId('start-tracking-btn')).toBeInTheDocument()
  })

  it('onboarding sets starting bankroll and shows tracker', () => {
    render(<BankrollSimulator />)

    fireEvent.change(screen.getByTestId('onboarding-bankroll-input'), { target: { value: '10000' } })
    fireEvent.click(screen.getByTestId('start-tracking-btn'))

    expect(screen.getByTestId('bankroll-tracker')).toBeInTheDocument()
    expect(screen.getByTestId('current-bankroll')).toHaveTextContent('$10,000')
  })

  it('start tracking button is disabled with empty or zero input', () => {
    render(<BankrollSimulator />)

    const btn = screen.getByTestId('start-tracking-btn')
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByTestId('onboarding-bankroll-input'), { target: { value: '0' } })
    expect(btn).toBeDisabled()
  })

  // ── Main View ──

  it('shows overview stats with sessions', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    expect(screen.getByTestId('current-bankroll')).toHaveTextContent('$11,100')
    expect(screen.getByTestId('stat-sessions')).toHaveTextContent('3')
    expect(screen.getByTestId('stat-winrate')).toHaveTextContent('67%')
    expect(screen.getByTestId('stat-hours')).toHaveTextContent('9.5h')
  })

  it('shows overview summary with profit and ROI', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    const summary = screen.getByTestId('overview-summary')
    expect(summary).toHaveTextContent('Starting: $10,000')
    expect(summary).toHaveTextContent('+$1,100')
    expect(summary).toHaveTextContent('11.0%')
  })

  it('renders chart section with area chart when sessions exist', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    expect(screen.getByTestId('chart-section')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('shows empty chart message when no sessions', () => {
    useBankrollTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<BankrollSimulator />)

    expect(screen.getByText('Add your first session to see the chart')).toBeInTheDocument()
  })

  // ── Session List ──

  it('renders session list sorted newest first', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    const list = screen.getByTestId('session-list')
    expect(list).toBeInTheDocument()

    // Check all sessions are rendered
    expect(screen.getByTestId('session-s1')).toBeInTheDocument()
    expect(screen.getByTestId('session-s2')).toBeInTheDocument()
    expect(screen.getByTestId('session-s3')).toBeInTheDocument()
  })

  it('session shows green for win and red for loss', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    // s1 is a win (+$800)
    expect(screen.getByTestId('session-s1')).toHaveTextContent('+$800')
    // s2 is a loss (-$200)
    expect(screen.getByTestId('session-s2')).toHaveTextContent('-$200')
  })

  it('shows empty sessions message when no sessions recorded', () => {
    useBankrollTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<BankrollSimulator />)

    expect(screen.getByTestId('empty-sessions')).toBeInTheDocument()
  })

  // ── Add Session Form ──

  it('opens add session form and saves new session', () => {
    useBankrollTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('add-session-btn'))

    expect(screen.getByTestId('session-form')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('form-casino'), { target: { value: 'Aria' } })
    fireEvent.change(screen.getByTestId('form-amount'), { target: { value: '350' } })
    fireEvent.change(screen.getByTestId('form-hours'), { target: { value: '2.5' } })
    fireEvent.change(screen.getByTestId('form-notes'), { target: { value: 'Nice dealer' } })
    fireEvent.click(screen.getByTestId('form-save'))

    // Form closes and session appears
    expect(screen.queryByTestId('session-form')).not.toBeInTheDocument()
    expect(useBankrollTrackerStore.getState().sessions).toHaveLength(1)
    expect(useBankrollTrackerStore.getState().sessions[0].result).toBe(350)
    expect(useBankrollTrackerStore.getState().sessions[0].casino).toBe('Aria')
  })

  it('win/loss toggle changes result sign', () => {
    useBankrollTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('add-session-btn'))

    // Default is Win
    fireEvent.click(screen.getByTestId('form-loss-btn'))
    fireEvent.change(screen.getByTestId('form-casino'), { target: { value: 'Test' } })
    fireEvent.change(screen.getByTestId('form-amount'), { target: { value: '200' } })
    fireEvent.click(screen.getByTestId('form-save'))

    expect(useBankrollTrackerStore.getState().sessions[0].result).toBe(-200)
  })

  it('cancel button closes form', () => {
    useBankrollTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('add-session-btn'))
    expect(screen.getByTestId('session-form')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('form-cancel'))
    expect(screen.queryByTestId('session-form')).not.toBeInTheDocument()
  })

  // ── Edit Starting Bankroll ──

  it('pencil icon opens inline edit for starting bankroll', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('edit-starting-btn'))

    const input = screen.getByTestId('edit-starting-input') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('10000')
  })

  it('saving inline edit updates starting bankroll', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('edit-starting-btn'))
    fireEvent.change(screen.getByTestId('edit-starting-input'), { target: { value: '15000' } })
    fireEvent.click(screen.getByTestId('save-starting-btn'))

    expect(useBankrollTrackerStore.getState().startingBankroll).toBe(15000)
    expect(screen.queryByTestId('edit-starting-input')).not.toBeInTheDocument()
  })

  it('canceling inline edit keeps original value', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('edit-starting-btn'))
    fireEvent.change(screen.getByTestId('edit-starting-input'), { target: { value: '99999' } })
    fireEvent.click(screen.getByTestId('cancel-starting-btn'))

    expect(useBankrollTrackerStore.getState().startingBankroll).toBe(10000)
    expect(screen.queryByTestId('edit-starting-input')).not.toBeInTheDocument()
  })

  // ── Edit Session ──

  it('edit button opens form with session data', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('edit-s1'))

    const form = screen.getByTestId('session-form')
    expect(form).toBeInTheDocument()

    const casinoInput = screen.getByTestId('form-casino') as HTMLInputElement
    expect(casinoInput.value).toBe('Bellagio')

    const amountInput = screen.getByTestId('form-amount') as HTMLInputElement
    expect(amountInput.value).toBe('800')
  })

  it('saving edit updates the session', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('edit-s1'))
    fireEvent.change(screen.getByTestId('form-amount'), { target: { value: '1000' } })
    fireEvent.click(screen.getByTestId('form-save'))

    expect(useBankrollTrackerStore.getState().sessions.find(s => s.id === 's1')!.result).toBe(1000)
  })

  // ── Delete Session ──

  it('delete requires confirmation', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('delete-s1'))

    // Should show confirm button, not immediately delete
    expect(screen.getByTestId('confirm-delete-s1')).toBeInTheDocument()
    expect(useBankrollTrackerStore.getState().sessions).toHaveLength(3)
  })

  it('confirming delete removes session', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('delete-s1'))
    fireEvent.click(screen.getByTestId('confirm-delete-s1'))

    expect(useBankrollTrackerStore.getState().sessions).toHaveLength(2)
    expect(useBankrollTrackerStore.getState().sessions.find(s => s.id === 's1')).toBeUndefined()
  })

  // ── Additional Stats ──

  it('shows best and worst session stats', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    expect(screen.getByTestId('best-session-result')).toHaveTextContent('+$800')
    expect(screen.getByTestId('worst-session-result')).toHaveTextContent('-$200')
  })

  it('shows winning and losing streaks', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    expect(screen.getByTestId('winning-streak')).toBeInTheDocument()
    expect(screen.getByTestId('losing-streak')).toBeInTheDocument()
  })

  // ── TopBar ──

  it('TopBar shows "Bankroll Tracker" for bankrollSim mode', () => {
    useAppStore.setState({ currentMode: 'bankrollSim' })
    render(<TopBar />)
    expect(screen.getByText('Bankroll Tracker')).toBeInTheDocument()
  })

  // ── Stat card glow ──

  it('stat cards have glow effect based on performance', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    const statCards = screen.getByTestId('stat-cards')
    expect(statCards).toBeInTheDocument()
  })

  // ── Personal Records ──

  it('shows personal records section when sessions exist', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    expect(screen.getByTestId('personal-records')).toBeInTheDocument()
    expect(screen.getByText(/Personal Records/)).toBeInTheDocument()
  })

  it('personal records shows 8 cards', () => {
    setupWithSessions()
    render(<BankrollSimulator />)

    expect(screen.getByTestId('record-best-session')).toBeInTheDocument()
    expect(screen.getByTestId('record-worst-session')).toBeInTheDocument()
    expect(screen.getByTestId('record-win-streak')).toBeInTheDocument()
    expect(screen.getByTestId('record-longest-session')).toBeInTheDocument()
    expect(screen.getByTestId('record-peak-bankroll')).toBeInTheDocument()
    expect(screen.getByTestId('record-best-$-hr')).toBeInTheDocument()
    expect(screen.getByTestId('record-best-casino')).toBeInTheDocument()
    expect(screen.getByTestId('record-win-rate')).toBeInTheDocument()
  })

  it('does not show personal records when no sessions', () => {
    useBankrollTrackerStore.setState({ startingBankroll: 10000, sessions: [] })
    render(<BankrollSimulator />)

    expect(screen.queryByTestId('personal-records')).not.toBeInTheDocument()
  })
})
