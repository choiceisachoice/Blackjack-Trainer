import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
    // No invented figures before there is anything to report.
    expect(screen.queryByText(/\d+% accuracy/)).not.toBeInTheDocument()
    expect(screen.queryByText(/-day streak/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Awards/)).not.toBeInTheDocument()
    // And no paragraph in their place. "Nothing tracked yet — play a session"
    // sat directly above the plan's own start button and said the same thing
    // less precisely; with no history the card is the level and nothing else.
    expect(screen.queryByText(/Nothing tracked yet/)).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
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

describe('DashboardHeader — no way in of its own', () => {
  /**
   * There used to be a "Continue <last mode>" button here. It sat beside the
   * plan's "start today's session" and the two disagreed about what to do
   * next — the last mode is where you *were*, the plan knows where you are
   * *going*. The plan is the one that knows, so this card leads nowhere,
   * whatever the history says. Three tests pinned where that button went;
   * they now pin that it is gone for each of those histories.
   */
  const histories: [string, TrainingMode][] = [
    ['a drill', 'speedDrill'],
    ['a session whose screen has another name', 'deviationFlashCards'],
    ['the table', 'casinoSession'],
    // Old history can still hold modes whose screen no longer exists.
    ['a retired mode', 'tableCounting' as TrainingMode],
  ]

  for (const [what, mode] of histories) {
    it(`offers nothing to continue after ${what}`, () => {
      useStatsStore.setState({ lifetimeStats: STATS, sessions: [session(mode)] })
      render(<DashboardHeader />)

      expect(screen.queryByText(/Continue/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
      // Rendering it changes nothing about where the learner is.
      expect(useAppStore.getState().currentMode).toBe('home')
      // The figures are still there: it reports, it does not direct.
      expect(screen.getByText('87% accuracy')).toBeInTheDocument()
    })
  }
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
