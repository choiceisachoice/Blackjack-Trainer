import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AnalyticsDashboard, buildChartData, getStreakMotivation, computeQuickStats } from './AnalyticsDashboard'
import { useStatsStore } from '../../store/stats-store'
import type { TrainingSessionResult, LifetimeStats, ModeStats } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'

// Mock recharts — render children only
vi.mock('recharts', () => ({
  LineChart: ({ children }: React.PropsWithChildren) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

/** No-op loadStats so mounting doesn't trigger async loading. */
const noopLoadStats = vi.fn().mockResolvedValue(undefined)

function makeSession(overrides: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
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
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] },
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

  it('renders empty state when no sessions exist', () => {
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats })
    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('Play more sessions to see trends')
    expect(screen.getByTestId('deviations-empty')).toHaveTextContent('Complete deviation training to see weak spots')
    expect(screen.getByTestId('sessions-empty')).toHaveTextContent('No sessions recorded yet')
  })

  it('shows overview cards with data', () => {
    const stats: LifetimeStats = {
      totalSessions: 15,
      totalQuestions: 150,
      totalCorrect: 120,
      totalPracticeSeconds: 7200,
      overallAccuracy: 0.8,
      bestStreak: 5,
      byMode: {},
      dailyStats: [],
    }

    useStatsStore.setState({ lifetimeStats: stats })
    render(<AnalyticsDashboard />)

    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('2h 0m')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('120/150')).toBeInTheDocument()
  })

  it('shows mode breakdown with played and unplayed modes', () => {
    const stats: LifetimeStats = {
      ...emptyLifetimeStats,
      totalSessions: 5,
      byMode: {
        speedDrill: {
          totalSessions: 5,
          totalQuestions: 50,
          totalCorrect: 40,
          accuracy: 0.8,
          bestAccuracy: 0.9,
          totalPracticeSeconds: 600,
          bestStreak: 8,
        },
      },
    }

    const sessions = [makeSession({ mode: 'speedDrill' })]

    useStatsStore.setState({ lifetimeStats: stats, sessions })
    render(<AnalyticsDashboard />)

    // Speed Drill shows stats (appears in breakdown + session history)
    expect(screen.getAllByText('Speed Drill').length).toBeGreaterThanOrEqual(1)

    // Other modes show "Not yet played"
    const unplayed = screen.getAllByText('Not yet played')
    expect(unplayed.length).toBe(6) // 7 modes - 1 played = 6 unplayed
  })

  it('shows weakest deviations when deviation data exists', () => {
    const deviationSession = makeSession({
      mode: 'deviationFlashCards',
      details: {
        type: 'deviationFlashCards',
        deviationSet: 'i18',
        perDeviation: {
          'Insurance (16 vs A)': { correct: 2, incorrect: 8 },
          'Stand 16 vs 10': { correct: 7, incorrect: 3 },
        },
      },
    })

    useStatsStore.setState({
      sessions: [deviationSession],
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: 1 },
    })

    render(<AnalyticsDashboard />)

    expect(screen.getByText('Insurance (16 vs A)')).toBeInTheDocument()
    expect(screen.getByText('20% accuracy')).toBeInTheDocument()
    expect(screen.getByText('Stand 16 vs 10')).toBeInTheDocument()
    expect(screen.getByText('70% accuracy')).toBeInTheDocument()
  })

  it('shows session history', () => {
    const sessions = [
      makeSession({ mode: 'speedDrill', accuracy: 0.85, durationSeconds: 300 }),
      makeSession({ mode: 'tableCounting', accuracy: 0.7, durationSeconds: 180 }),
    ]

    useStatsStore.setState({
      sessions,
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: 2 },
    })

    render(<AnalyticsDashboard />)

    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('5m')).toBeInTheDocument()
    expect(screen.getByText('3m')).toBeInTheDocument()
  })

  it('shows chart when enough sessions exist', () => {
    const sessions = [
      makeSession({ mode: 'speedDrill', accuracy: 0.8 }),
      makeSession({ mode: 'speedDrill', accuracy: 0.7 }),
    ]

    useStatsStore.setState({
      sessions,
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: 2 },
    })

    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('chart-empty')).not.toBeInTheDocument()
  })

  it('handles reset with confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const resetSpy = vi.fn().mockResolvedValue(undefined)

    useStatsStore.setState({
      lifetimeStats: emptyLifetimeStats,
      resetAllStats: resetSpy,
    })

    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('reset-all-stats'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(resetSpy).toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('does not reset when confirmation is cancelled', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const resetSpy = vi.fn().mockResolvedValue(undefined)

    useStatsStore.setState({
      lifetimeStats: emptyLifetimeStats,
      resetAllStats: resetSpy,
    })

    render(<AnalyticsDashboard />)

    fireEvent.click(screen.getByTestId('reset-all-stats'))
    expect(confirmSpy).toHaveBeenCalled()
    expect(resetSpy).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('DeviationAtTable sessions appear in mode breakdown', () => {
    const stats: LifetimeStats = {
      ...emptyLifetimeStats,
      totalSessions: 3,
      byMode: {
        deviationAtTable: {
          totalSessions: 3,
          totalQuestions: 15,
          totalCorrect: 12,
          accuracy: 0.8,
          bestAccuracy: 0.9,
          totalPracticeSeconds: 600,
          bestStreak: 5,
        },
      },
    }

    const sessions = [makeSession({
      mode: 'deviationAtTable',
      details: {
        type: 'deviationAtTable',
        deviationSet: 'i18',
        perDeviation: { '16 vs 10': { correct: 4, incorrect: 1 } },
        avgTcError: 0.5,
      },
    })]

    useStatsStore.setState({ lifetimeStats: stats, sessions })
    render(<AnalyticsDashboard />)

    // Should show as played mode (not "Not yet played")
    const atTableLabels = screen.getAllByText('Deviation At Table')
    expect(atTableLabels.length).toBeGreaterThanOrEqual(1) // breakdown + session history
    expect(screen.getAllByText('Not yet played').length).toBe(6) // 7 modes - 1 played
  })

  it('weakest deviations shows correct accuracy from session data', () => {
    const sessions = [
      makeSession({
        mode: 'deviationFlashCards',
        details: {
          type: 'deviationFlashCards',
          deviationSet: 'i18',
          perDeviation: {
            '16 vs 10': { correct: 8, incorrect: 2 },
            '15 vs 10': { correct: 3, incorrect: 7 },
          },
        },
      }),
      makeSession({
        mode: 'deviationFlashCards',
        details: {
          type: 'deviationFlashCards',
          deviationSet: 'i18',
          perDeviation: {
            '16 vs 10': { correct: 6, incorrect: 4 },
          },
        },
      }),
    ]

    useStatsStore.setState({
      sessions,
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: 2 },
    })

    render(<AnalyticsDashboard />)

    // 16 vs 10: (8+6) correct / (8+2+6+4) total = 14/20 = 70%
    expect(screen.getByText('16 vs 10')).toBeInTheDocument()
    expect(screen.getByText('70% accuracy')).toBeInTheDocument()

    // 15 vs 10: 3 correct / (3+7) total = 30%
    expect(screen.getByText('15 vs 10')).toBeInTheDocument()
    expect(screen.getByText('30% accuracy')).toBeInTheDocument()
  })

  it('deviations with 0 attempts are excluded from weakest list', () => {
    const sessions = [
      makeSession({
        mode: 'deviationFlashCards',
        details: {
          type: 'deviationFlashCards',
          deviationSet: 'i18',
          perDeviation: {
            '16 vs 10': { correct: 5, incorrect: 5 },
            'Empty Dev': { correct: 0, incorrect: 0 },
          },
        },
      }),
    ]

    useStatsStore.setState({
      sessions,
      lifetimeStats: { ...emptyLifetimeStats, totalSessions: 1 },
    })

    render(<AnalyticsDashboard />)

    expect(screen.getByText('16 vs 10')).toBeInTheDocument()
    expect(screen.queryByText('Empty Dev')).not.toBeInTheDocument()
  })

  it('mode breakdown shows best and average accuracy', () => {
    const stats: LifetimeStats = {
      ...emptyLifetimeStats,
      totalSessions: 5,
      byMode: {
        speedDrill: {
          totalSessions: 5,
          totalQuestions: 50,
          totalCorrect: 40,
          accuracy: 0.8,
          bestAccuracy: 0.95,
          totalPracticeSeconds: 600,
          bestStreak: 8,
        },
      },
    }

    const sessions = [makeSession({ mode: 'speedDrill', accuracy: 0.7 })]
    useStatsStore.setState({ lifetimeStats: stats, sessions })
    render(<AnalyticsDashboard />)

    // Best accuracy: 95%
    expect(screen.getByTestId('mode-best-speedDrill')).toHaveTextContent('95%')
    // Average accuracy: 80%
    expect(screen.getByTestId('mode-avg-speedDrill')).toHaveTextContent('80%')
  })

  it('quick stats badges show correct best/worst/most practiced', () => {
    const stats: LifetimeStats = {
      ...emptyLifetimeStats,
      totalSessions: 10,
      byMode: {
        speedDrill: {
          totalSessions: 6,
          totalQuestions: 60,
          totalCorrect: 54,
          accuracy: 0.9,
          bestAccuracy: 1.0,
          totalPracticeSeconds: 600,
          bestStreak: 10,
        },
        deviationFlashCards: {
          totalSessions: 4,
          totalQuestions: 40,
          totalCorrect: 24,
          accuracy: 0.6,
          bestAccuracy: 0.7,
          totalPracticeSeconds: 400,
          bestStreak: 5,
        },
      },
    }

    useStatsStore.setState({ lifetimeStats: stats, sessions: [] })
    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('quick-stats')).toBeInTheDocument()
    expect(screen.getByTestId('quick-best')).toHaveTextContent('Best Mode: Speed Drill (90%)')
    expect(screen.getByTestId('quick-worst')).toHaveTextContent('Needs Work: Deviation Flash Cards (60%)')
    expect(screen.getByTestId('quick-most')).toHaveTextContent('Most Practiced: Speed Drill (6 sessions)')
  })
})

// ── Exported utility function tests ──────────────────────────────

describe('buildChartData', () => {
  it('uses time labels when all sessions are on the same day', () => {
    const sessions: TrainingSessionResult[] = [
      makeSession({ timestamp: '2026-02-19T14:30:00.000Z', accuracy: 0.8 }),
      makeSession({ timestamp: '2026-02-19T15:45:00.000Z', accuracy: 0.9 }),
    ]

    const data = buildChartData(sessions)

    // Sessions are reversed (chronological), so first is 14:30
    expect(data).toHaveLength(2)
    // label is now unique index
    expect(data[0].label).toBe('#1')
    expect(data[1].label).toBe('#2')
    // date holds the original time display
    expect(data[0].date).toMatch(/^\d{2}:\d{2}$/)
    expect(data[1].date).toMatch(/^\d{2}:\d{2}$/)
    expect(data[0].date).not.toBe(data[1].date)
  })

  it('uses date labels when sessions span multiple days', () => {
    const sessions: TrainingSessionResult[] = [
      makeSession({ timestamp: '2026-02-18T14:30:00.000Z', accuracy: 0.7 }),
      makeSession({ timestamp: '2026-02-19T15:45:00.000Z', accuracy: 0.9 }),
    ]

    const data = buildChartData(sessions)

    expect(data).toHaveLength(2)
    // label is unique index
    expect(data[0].label).toBe('#1')
    expect(data[1].label).toBe('#2')
    // date holds the original date display
    expect(data[0].date).toMatch(/\w+ \d+/)
    expect(data[1].date).toMatch(/\w+ \d+/)
  })
})

describe('getStreakMotivation', () => {
  it('returns correct text for each streak range', () => {
    expect(getStreakMotivation(0)).toBe('Start your streak today!')
    expect(getStreakMotivation(1)).toContain('Keep it going!')
    expect(getStreakMotivation(2)).toContain('Keep it going!')
    expect(getStreakMotivation(3)).toContain('on fire!')
    expect(getStreakMotivation(6)).toContain('on fire!')
    expect(getStreakMotivation(7)).toContain('One week strong!')
    expect(getStreakMotivation(13)).toContain('One week strong!')
    expect(getStreakMotivation(14)).toContain('Unstoppable!')
    expect(getStreakMotivation(30)).toContain('Unstoppable!')
  })

  it('renders motivation text in dashboard', () => {
    useStatsStore.setState({ lifetimeStats: emptyLifetimeStats })
    render(<AnalyticsDashboard />)

    expect(screen.getByTestId('streak-motivation')).toHaveTextContent('Start your streak today!')
  })
})

describe('computeQuickStats', () => {
  const makeModeStats = (overrides: Partial<ModeStats> = {}): ModeStats => ({
    totalSessions: 1,
    totalQuestions: 10,
    totalCorrect: 8,
    accuracy: 0.8,
    bestAccuracy: 0.9,
    totalPracticeSeconds: 120,
    bestStreak: 5,
    ...overrides,
  })

  it('returns null when fewer than 2 modes have data', () => {
    expect(computeQuickStats({})).toBeNull()
    expect(computeQuickStats({ speedDrill: makeModeStats() })).toBeNull()
  })

  it('identifies best, worst, and most practiced modes', () => {
    const result = computeQuickStats({
      speedDrill: makeModeStats({ accuracy: 0.95, totalSessions: 3 }),
      betSpread: makeModeStats({ accuracy: 0.5, totalSessions: 7 }),
      tableCounting: makeModeStats({ accuracy: 0.7, totalSessions: 2 }),
    })

    expect(result).not.toBeNull()
    expect(result!.best.mode).toBe('speedDrill')
    expect(result!.best.accuracy).toBe(0.95)
    expect(result!.worst.mode).toBe('betSpread')
    expect(result!.worst.accuracy).toBe(0.5)
    expect(result!.mostPracticed.mode).toBe('betSpread')
    expect(result!.mostPracticed.sessions).toBe(7)
  })
})
