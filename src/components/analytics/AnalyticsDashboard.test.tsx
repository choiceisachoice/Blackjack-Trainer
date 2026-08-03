import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import { useStatsStore } from '../../store/stats-store'
import { useAppStore } from '../../store/app-store'
import type { TrainingSessionResult, LifetimeStats, SessionDetails } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/** No-op loadStats so mounting doesn't trigger async loading. */
const noopLoadStats = vi.fn().mockResolvedValue(undefined)

function makeSession(overrides: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
  const details: SessionDetails = { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] }
  return {
    id: crypto.randomUUID(),
    mode: 'speedDrill',
    timestamp: new Date().toISOString(),
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 120,
    totalQuestions: 10,
    correctAnswers: 8,
    accuracy: 0.8,
    bestStreak: 5,
    details,
    ...overrides,
  }
}

const emptyLifetimeStats: LifetimeStats = {
  totalSessions: 0,
  totalQuestions: 0,
  totalCorrect: 0,
  totalPracticeSeconds: 0,
  overallAccuracy: 0,
  bestStreak: 0,
  byMode: {},
  dailyStats: [],
}

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    useStatsStore.setState({
      sessions: [],
      lifetimeStats: null,
      isLoading: false,
      loadStats: noopLoadStats,
    })
    noopLoadStats.mockClear()
    localStorage.clear()
  })

  it('renders the empty state when no sessions exist', () => {
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats })
    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument()
    expect(screen.getByText('No sessions recorded yet')).toBeInTheDocument()
    // No KPI tiles or insight strip in the empty state.
    expect(screen.queryByTestId('insight-strip')).not.toBeInTheDocument()
  })

  it('renders the KPI row and insight strip with data', () => {
    const sessions = [makeSession({ totalQuestions: 10, correctAnswers: 8 })]
    useStatsStore.setState({
      sessions,
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: 1, totalQuestions: 10, totalCorrect: 8 },
    })
    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('insight-strip')).toBeInTheDocument()
    // Accuracy KPI shows 80% (value + small unit rendered separately)
    expect(within(screen.getByTestId('kpi-accuracy')).getByText('80')).toBeInTheDocument()
    expect(within(screen.getByTestId('kpi-sessions')).getByText('1')).toBeInTheDocument()
  })

  it('renders the weakest-hands block from deviation data', () => {
    const sessions = [
      makeSession({
        mode: 'deviationFlashCards',
        details: {
          type: 'deviationFlashCards',
          deviationSet: 'i18',
          perDeviation: { '16 vs 10': { correct: 2, incorrect: 8 } },
        },
      }),
    ]
    useStatsStore.setState({ sessions, lifetimeStats: { ...emptyLifetimeStats, totalSessions: 1 } })
    render(<AnalyticsDashboard />)

    const weak = screen.getByTestId('weakest-hands')
    expect(within(weak).getByText('16 vs 10')).toBeInTheDocument()
    // 80% miss-rate shown
    expect(within(weak).getByText('80%')).toBeInTheDocument()
  })

  it('renders the real Casino Session edge block', () => {
    const sessions = [
      makeSession({
        mode: 'casinoSession',
        details: {
          type: 'casinoSession', handsPlayed: 40, netProfit: 250, overallScore: 82, grade: 'B',
          betAccuracy: 80, playAccuracy: 85, countAccuracy: 90, deviationAccuracy: 75,
          numBots: 2, hadBlackjack: true, longestWinStreak: 3, splitAces: false, maxSplitHands: 2,
        },
      }),
    ]
    useStatsStore.setState({ sessions, lifetimeStats: { ...emptyLifetimeStats, totalSessions: 1 } })
    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('edge-chart')).toBeInTheDocument()
    expect(screen.getByText('+$250')).toBeInTheDocument()
  })

  it('switches range when a chip is clicked', () => {
    useStatsStore.setState({ sessions: [makeSession()], lifetimeStats: { ...emptyLifetimeStats, totalSessions: 1 } })
    render(<AnalyticsDashboard />)

    const chip7d = screen.getByRole('button', { name: '7d' })
    fireEvent.click(chip7d)
    expect(chip7d).toHaveAttribute('aria-pressed', 'true')
  })

  it('resets data only after confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const resetSpy = vi.fn().mockResolvedValue(undefined)
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats, resetAllStats: resetSpy })
    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('reset-all-stats'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(resetSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('tells the user when the deletion fails', async () => {
    // It was fire-and-forget: a failed clear left the old data on screen with
    // nothing said, after the user had already confirmed a destructive action.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const resetSpy = vi.fn().mockRejectedValue(new Error('offline'))
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats, resetAllStats: resetSpy })
    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('reset-all-stats'))

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('offline')
    confirmSpy.mockRestore()
  })

  it('promises only what it actually deletes', () => {
    // The old wording said "reset all training data". It cleared the session
    // history and nothing else — level, XP, achievements and challenge progress
    // all survived, so anyone asking for a clean slate was told they had one.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats, resetAllStats: vi.fn() })
    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('reset-all-stats'))

    const asked = confirmSpy.mock.calls[0][0] as string
    expect(asked).toMatch(/level|XP|achievements/i)
    expect(asked).not.toMatch(/all training data/i)
    confirmSpy.mockRestore()
  })

  it('does not reset when confirmation is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const resetSpy = vi.fn().mockResolvedValue(undefined)
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats, resetAllStats: resetSpy })
    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('reset-all-stats'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(resetSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})

describe('AnalyticsDashboard — the training plan strip', () => {
  const withData = (sessions: TrainingSessionResult[]) =>
    useStatsStore.setState({
      sessions,
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: sessions.length, totalQuestions: 10, totalCorrect: 8 },
      isLoading: false,
      loadStats: noopLoadStats,
    })

  beforeEach(() => {
    localStorage.clear()
  })

  it('says nothing about a plan the learner has not been placed on', () => {
    // An empty progress bar would imply a plan exists.
    withData([makeSession()])
    render(<AnalyticsDashboard />)
    expect(screen.queryByTestId('analytics-plan-strip')).toBeNull()
  })

  it('names the stage the learner is on', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    withData([makeSession()])
    render(<AnalyticsDashboard />)

    const strip = screen.getByTestId('analytics-plan-strip')
    expect(within(strip).getByText('The Hi-Lo count')).toBeInTheDocument()
    // Placed at index 2 of 7 → five stages remain.
    expect(within(strip).getByText(/0 of 5 stages/)).toBeInTheDocument()
  })

  it('counts cleared stages the same way the plan does', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    withData(Array.from({ length: 3 }, () => makeSession({ accuracy: 0.95 })))
    render(<AnalyticsDashboard />)

    const strip = screen.getByTestId('analytics-plan-strip')
    expect(within(strip).getByText(/1 of 5 stages/)).toBeInTheDocument()
    expect(within(strip).getByText('True count')).toBeInTheDocument()
  })

  it('opens the plan', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    withData([makeSession()])
    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('analytics-plan-strip'))
    expect(useAppStore.getState().currentMode).toBe('plan')
  })

  it('stays hidden in the empty state, where there are no numbers to place', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ sessions: [], lifetimeStats: emptyLifetimeStats, isLoading: false, loadStats: noopLoadStats })
    render(<AnalyticsDashboard />)
    expect(screen.queryByTestId('analytics-plan-strip')).toBeNull()
  })
})
