import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DashboardHeader } from './DashboardHeader'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { isProMode } from '../../services/pro-features'
import type { LifetimeStats, TrainingMode, TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'

const STATS: LifetimeStats = {
  totalSessions: 12,
  totalQuestions: 300,
  totalCorrect: 261,
  totalPracticeSeconds: 7_500, // 2h 5m
  overallAccuracy: 0.87,
  bestStreak: 14,
  byMode: {},
  dailyStats: [],
}

/** A session fixture; only `mode` and `timestamp` are read by the header. */
function session(mode: TrainingMode, when = new Date()): TrainingSessionResult {
  return {
    id: `id-${mode}-${when.getTime()}`,
    mode,
    timestamp: when.toISOString(),
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 300,
    totalQuestions: 25,
    correctAnswers: 22,
    accuracy: 0.88,
    bestStreak: 6,
    details: { type: mode },
  } as unknown as TrainingSessionResult
}

beforeEach(() => {
  useStatsStore.setState({
    sessions: [],
    lifetimeStats: null,
    isLoading: false,
    loadStats: vi.fn().mockResolvedValue(undefined),
  })
  useAchievementStore.setState({ totalUnlocked: 12 })
  useAppStore.setState({ currentMode: 'home' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DashboardHeader — first run', () => {
  it('greets a new user without a wall of zeros', () => {
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)

    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument()
    expect(screen.getByText(/Nothing tracked yet/)).toBeInTheDocument()
    // No invented figures before there is anything to report. (The invitation
    // copy mentions "accuracy" as a word, so match the stat's number format.)
    expect(screen.queryByText(/\d+% accuracy/)).not.toBeInTheDocument()
    expect(screen.queryByText(/-day streak/)).not.toBeInTheDocument()
  })

  it('points a brand-new account at a free mode, not the paywall', () => {
    // The Casino Session is Pro-gated: using it as the no-history fallback made
    // the app open on a paywall for every new free account.
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)

    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    const mode = useAppStore.getState().currentMode
    expect(isProMode(mode), `first-run CTA opened Pro mode "${mode}"`).toBe(false)
  })

  it('sends an unplaced account to Learn, never past its own plan', () => {
    // The old fallback was `speedDrill` unconditionally — stage three of seven,
    // which assumes you already know the Hi-Lo values. With no placement there
    // is no stage to follow, so reading is the honest destination.
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)

    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(useAppStore.getState().currentMode).toBe('learn')
  })

  it('follows the plan stage once the learner has been placed', () => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)

    // Named after the stage, so the button says where it goes.
    fireEvent.click(screen.getByRole('button', { name: /The Hi-Lo count/ }))
    expect(useAppStore.getState().currentMode).toBe('speedDrill')
  })

  it('never sends a learner placed at the rules into a counting drill', () => {
    // The measured regression: "I've never played blackjack" placed someone at
    // stage one, and the CTA dropped them into stage three.
    localStorage.setItem('bjt_placement', 'rules')
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)

    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(useAppStore.getState().currentMode).not.toBe('speedDrill')
  })
})

describe('DashboardHeader — returning user', () => {
  beforeEach(() => {
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('speedDrill')] })
  })

  it('welcomes them back and reports only derived figures', () => {
    render(<DashboardHeader />)
    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    // overallAccuracy is a 0..1 fraction — it must render as a percentage.
    expect(screen.getByText('87% accuracy')).toBeInTheDocument()
    expect(screen.getByText('2h 5m')).toBeInTheDocument()
    expect(screen.getByText(/12\/\d+ awards/)).toBeInTheDocument()
  })

  it('shows the real consecutive-day streak', () => {
    render(<DashboardHeader />)
    expect(screen.getByText('1-day streak')).toBeInTheDocument()
  })

  it('exposes level progress to assistive tech', () => {
    render(<DashboardHeader />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toBeInTheDocument()
    expect(bar).toHaveAttribute('aria-valuenow')
  })
})

describe('DashboardHeader — resume', () => {
  it('continues the last training mode', () => {
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('speedDrill')] })
    render(<DashboardHeader />)

    const cta = screen.getByRole('button', { name: /Continue Speed Drill/ })
    fireEvent.click(cta)
    expect(useAppStore.getState().currentMode).toBe('speedDrill')
  })

  it('maps a flashcards session onto its differently-named screen', () => {
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('deviationFlashCards')] })
    render(<DashboardHeader />)

    fireEvent.click(screen.getByRole('button', { name: /Continue Flashcards/ }))
    expect(useAppStore.getState().currentMode).toBe('deviationTraining')
  })

  it('falls back to the generic CTA when the last session used a retired mode', () => {
    // Old history can still hold modes whose screen no longer exists.
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('tableCounting')] })
    render(<DashboardHeader />)

    expect(screen.queryByText(/Continue/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    // No placement in this test, so the plan has nothing to point at and Learn
    // is the honest destination — the important part is that a retired mode
    // never routes into the void.
    expect(useAppStore.getState().currentMode).toBe('learn')
  })
})

describe('DashboardHeader — hydration', () => {
  it('loads stats itself, since nothing else does on the home path', () => {
    const loadStats = vi.fn().mockResolvedValue(undefined)
    useStatsStore.setState({ lifetimeStats: null, loadStats })
    render(<DashboardHeader />)
    expect(loadStats).toHaveBeenCalled()
  })

  it('does not reload when stats are already present', () => {
    const loadStats = vi.fn().mockResolvedValue(undefined)
    useStatsStore.setState({ lifetimeStats: STATS, loadStats })
    render(<DashboardHeader />)
    expect(loadStats).not.toHaveBeenCalled()
  })
})
