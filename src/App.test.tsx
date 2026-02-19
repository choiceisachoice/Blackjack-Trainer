import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'
import { useAppStore } from './store/app-store'
import { useStatsStore } from './store/stats-store'

// Mock recharts for AnalyticsDashboard
vi.mock('recharts', () => ({
  LineChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

// Mock framer-motion for DeckEstimation's ShoeVisual
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, onAnimationComplete, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState({ currentMode: 'home' })
  })

  it('renders home screen by default', () => {
    render(<App />)
    expect(screen.getByText('Blackjack Card Counting Trainer')).toBeInTheDocument()
  })

  it('renders DeviationTraining for deviationTraining mode', () => {
    useAppStore.setState({ currentMode: 'deviationTraining' })
    render(<App />)
    expect(screen.getByText('Deviation Set')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders BetSpread for betSpread mode', () => {
    useAppStore.setState({ currentMode: 'betSpread' })
    render(<App />)
    expect(screen.getByText('Bet Spread Reference')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders DeckEstimation for deckEstimation mode', () => {
    useAppStore.setState({ currentMode: 'deckEstimation' })
    render(<App />)
    expect(screen.getByText('Decks in Shoe')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders AnalyticsDashboard for analytics mode', () => {
    useAppStore.setState({ currentMode: 'analytics' })
    useStatsStore.setState({
      sessions: [],
      lifetimeStats: {
        totalSessions: 0, totalQuestions: 0, totalCorrect: 0,
        totalPracticeSeconds: 0, overallAccuracy: 0, bestStreak: 0,
        byMode: {}, dailyStats: [],
      },
      isLoading: false,
      loadStats: vi.fn().mockResolvedValue(undefined),
    })
    render(<App />)
    expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument()
  })

  it('all 5 training modes are routed (no Coming Soon)', () => {
    const modes = ['speedDrill', 'tableCounting', 'deviationTraining', 'betSpread', 'deckEstimation'] as const
    for (const mode of modes) {
      useAppStore.setState({ currentMode: mode })
      const { unmount } = render(<App />)
      // No mode should show "Coming soon" anymore
      expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
      unmount()
    }
  })
})
