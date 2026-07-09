import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import { useStatsStore } from '../../store/stats-store'
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
