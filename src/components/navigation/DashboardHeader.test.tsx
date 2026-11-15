import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DashboardHeader } from './DashboardHeader'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
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

  /**
   * There is no start button here any more, and that is the fix.
   *
   * This card sits under the training plan, which carries the one button that
   * starts the learner's current stage. A second "Start: <the stage>" down
   * here was the fourth place on the home screen to name that stage (audit of
   * 13 Nov 2026). Four tests used to pin where that button led — a free mode,
   * never past the plan, never a counting drill for someone placed at the
   * rules. All four hold more strongly now: it leads nowhere, because the
   * plan above is the only way in.
   */
  it('offers no start button of its own when there is nothing to resume', () => {
    for (const placement of [null, 'rules', 'hi-lo']) {
      localStorage.clear()
      if (placement) localStorage.setItem('bjt_placement', placement)
      useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 }, sessions: [] })
      const { unmount } = render(<DashboardHeader />)
      expect(screen.queryByRole('button'), String(placement)).toBeNull()
      unmount()
    }
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
    // The noun is the nav's own word for the screen, in the reader's language.
    expect(screen.getByText(/12\/\d+ Awards/)).toBeInTheDocument()
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

  it('offers nothing to continue when the last session used a retired mode', () => {
    // Old history can still hold modes whose screen no longer exists. A
    // retired mode never routes into the void: there is simply no button.
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('tableCounting')] })
    render(<DashboardHeader />)

    expect(screen.queryByText(/Continue/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
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
