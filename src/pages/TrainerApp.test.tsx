import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TrainerApp } from './TrainerApp'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'

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

// Mock framer-motion. A Proxy rather than a fixed list of tags: this shell can
// render any screen, and a missing `motion.button` used to surface only as an
// "element type is invalid" crash that the ErrorBoundary swallowed — a passing
// test over a broken render.
vi.mock('framer-motion', () => {
  const element = (tag: string) =>
    ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, onAnimationComplete, whileHover, whileTap, variants, layout, ...rest } = props
      return React.createElement(tag, rest, children)
    }
  return {
    motion: new Proxy({} as Record<string, unknown>, {
      get: (cache, tag: string) => (cache[tag] ??= element(tag)),
    }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  }
})

describe('TrainerApp', () => {
  beforeEach(() => {
    localStorage.clear()
    useAppStore.setState({ currentMode: 'home' })
  })

  it('renders home screen by default for a placed learner', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    // Home is the dashboard: it greets the user and lists the training modes.
    // Its headline is the level title, so assert stable landmarks instead.
    expect(screen.getByRole('heading', { name: 'Training Modes' })).toBeInTheDocument()
    expect(screen.getByText(/^Welcome/)).toBeInTheDocument()
  })

  it('greets an unplaced learner on home, with nothing to shrug at underneath', () => {
    // `home` IS the plan now, so no redirect is involved — a new account simply
    // lands on the welcome screen, and the mode grid stays out of the way until
    // there is a plan to sit under.
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)

    expect(useAppStore.getState().currentMode).toBe('home')
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Training Modes' })).toBeNull()
  })

  it('shows the plan and the modes together once the learner is placed', () => {
    localStorage.setItem('bjt_placement', 'rules')
    localStorage.setItem('bjt_welcome_seen', 'true')
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)

    expect(useAppStore.getState().currentMode).toBe('home')
    // One answer on top...
    expect(screen.getByTestId('training-plan')).toBeInTheDocument()
    expect(screen.getByTestId('plan-up-next')).toBeInTheDocument()
    // ...browsing underneath.
    expect(screen.getByRole('heading', { name: 'Training Modes' })).toBeInTheDocument()
  })

  it('no longer shows a second onboarding checklist beside the plan', () => {
    localStorage.setItem('bjt_placement', 'rules')
    localStorage.setItem('bjt_welcome_seen', 'true')
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    expect(screen.queryByTestId('onboarding-card')).toBeNull()
  })

  it('never makes the shell itself scroll — the header must not create overflow', () => {
    // Measured regression: the shell was `h-screen overflow-y-auto` with a 62px
    // NavBar inside it while the content asked for `min-h-full` (another full
    // viewport). Every home visit got a scrollbar whose overflow was exactly the
    // header height, independent of content. jsdom has no layout, so this
    // asserts the structural rule instead: the shell never scrolls, and the
    // content area gets the remaining height via `flex-1 min-h-0`.
    localStorage.setItem('bjt_placement', 'hi-lo')
    localStorage.setItem('bjt_welcome_seen', 'true')
    const { container } = render(<MemoryRouter><TrainerApp /></MemoryRouter>)

    const shell = container.querySelector('.h-screen')!
    expect(shell.className).toContain('overflow-hidden')
    expect(shell.className).not.toContain('overflow-y-auto')

    const scrollArea = container.querySelector('.flex-1.min-h-0')!
    expect(scrollArea).toBeTruthy()
    expect(scrollArea.className).toContain('overflow-y-auto')
  })

  it('gives the content area no scrollbar for modes that scroll themselves', () => {
    // Analytics owns its own scroll container; a second one here would trap
    // scrolling to part of the view.
    useAppStore.setState({ currentMode: 'achievements' })
    const { container } = render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    const scrollArea = container.querySelector('.flex-1.min-h-0')!
    expect(scrollArea.className).toContain('overflow-hidden')
  })

  it('never overrides a mode the learner arrived on', () => {
    useAppStore.setState({ currentMode: 'analytics' })
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    expect(useAppStore.getState().currentMode).toBe('analytics')
  })

  it('renders the Flashcards trainer for deviationTraining mode', () => {
    useAppStore.setState({ currentMode: 'deviationTraining' })
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    expect(screen.getByText('Basic Strategy')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders BetSpread for betSpread mode', () => {
    useAppStore.setState({ currentMode: 'betSpread' })
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    expect(screen.getByText('Bet Spread Reference')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders DeckEstimation for deckEstimation mode', () => {
    useAppStore.setState({ currentMode: 'deckEstimation' })
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
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
    render(<MemoryRouter><TrainerApp /></MemoryRouter>)
    expect(screen.getByTestId('analytics-dashboard')).toBeInTheDocument()
  })

  it('all training modes are routed (no Coming Soon)', () => {
    const modes = ['speedDrill', 'deviationTraining', 'betSpread', 'deckEstimation'] as const
    for (const mode of modes) {
      useAppStore.setState({ currentMode: mode })
      const { unmount } = render(<MemoryRouter><TrainerApp /></MemoryRouter>)
      // No mode should show "Coming soon" anymore
      expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
      unmount()
    }
  })
})
