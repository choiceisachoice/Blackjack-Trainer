import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
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
  /*
    The greeting moved to the home screen's heading row (HomeScreen.test pins
    "Welcome" / "Welcome back"); this card is the rail's "how am I doing".

    "No invented figures" still holds, in the form the owner asked for on
    24 Nov 2026: an empty learner sees a preview of what will appear, and every
    sample figure sits inside a block labelled as an example and hidden from
    assistive tech — none is presented as the learner's own.
  */
  it('shows a new user a labelled example instead of a wall of zeros', () => {
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)

    const example = screen.getByTestId('stats-example')
    expect(within(example).getByTestId('example-tag')).toHaveTextContent('Example')
    expect(example).toHaveTextContent('Your own figures after your first session')
    // Every figure on the card is the example's — nothing outside it.
    for (const pattern of [/\d+% accuracy/, /-day streak/, /Awards/]) {
      const hits = screen.queryAllByText(pattern)
      expect(hits.length, String(pattern)).toBeGreaterThan(0)
      hits.forEach(el => expect(example.contains(el), String(pattern)).toBe(true))
    }
    // ...and the sample figures are not read out as the learner's.
    expect(example.querySelector('[aria-hidden="true"]')).toHaveTextContent(/\d+% accuracy/)
    // No paragraph in their place. "Nothing tracked yet — play a session"
    // sat directly above the plan's own start button and said the same thing
    // less precisely.
    expect(screen.queryByText(/Nothing tracked yet/)).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('never shows the example to someone with sessions on record', () => {
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('speedDrill')] })
    render(<DashboardHeader />)
    expect(screen.queryByTestId('stats-example')).toBeNull()
    expect(screen.queryByTestId('example-tag')).toBeNull()
  })

  it('shows the level, its title and the XP to the next level', () => {
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)
    expect(screen.getByTestId('level-ring')).toHaveTextContent('1')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Rookie')
    expect(screen.getByText(/XP to Beginner/)).toBeInTheDocument()
  })

  it('draws the week it is handed under the figures', () => {
    render(<DashboardHeader week={<div data-testid="week-slot" />} />)
    expect(within(screen.getByTestId('progress-card')).getByTestId('week-slot')).toBeInTheDocument()
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

  it('reports only derived figures', () => {
    render(<DashboardHeader />)
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

describe('DashboardHeader — labels that cannot contradict', () => {
  it('names no tier above the title, where it collided with the level names', () => {
    useStatsStore.setState({ lifetimeStats: { ...STATS, totalSessions: 0 } })
    render(<DashboardHeader />)
    // Level 1's tier is "Beginner", and so is level 2's name: "Beginner" over
    // "XP to Beginner" read as a contradiction.
    expect(screen.getByTestId('progress-card')).not.toHaveTextContent(/^Beginner/)
    expect(screen.getAllByText(/Beginner/)).toHaveLength(1)
  })

  it('says what the practice time is', () => {
    useStatsStore.setState({ lifetimeStats: STATS, sessions: [session('speedDrill')] })
    render(<DashboardHeader />)
    const time = screen.getByText('2h 5m')
    expect(time.parentElement).toHaveTextContent('2h 5m trained')
  })
})
