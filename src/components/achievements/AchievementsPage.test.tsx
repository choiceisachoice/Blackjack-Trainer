import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AchievementsPage } from './AchievementsPage'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'

// Mock the achievement engine
vi.mock('../../services/achievements/achievement-engine', () => ({
  achievementEngine: {
    getUnlocked: vi.fn(() => []),
    getUnlockedCount: vi.fn(() => 0),
    getProgress: vi.fn(() => 0),
    getSimCount: vi.fn(() => 0),
    getBestSimEdge: vi.fn(() => 0),
    isUnlocked: vi.fn(() => false),
    checkAfterSession: vi.fn(() => []),
    checkAfterSimulation: vi.fn(() => []),
    resetAll: vi.fn(),
  },
}))

describe('AchievementsPage', () => {
  beforeEach(() => {
    localStorage.clear()

    // Reset achievement store
    useAchievementStore.setState({
      unlockedIds: [],
      newlyUnlocked: [],
      totalUnlocked: 0,
    })

    // Reset stats store
    useStatsStore.setState({
      sessions: [],
      lifetimeStats: null,
      isLoading: false,
    })
  })

  it('renders every achievement as a medal', () => {
    render(<AchievementsPage />)

    for (const achievement of ALL_ACHIEVEMENTS) {
      expect(
        screen.getByTestId(`achievement-card-${achievement.id}`)
      ).toBeInTheDocument()
    }
  })

  it('gives every medal a containing block for its screen-reader label', () => {
    // Regression guard, not styling. The label inside each medal is
    // `position: absolute` (Tailwind's sr-only). Without a positioned ancestor
    // it resolves against <html>, and its static offset far down a long list
    // inflates the document scroll height — the page then scrolled ~1500px past
    // its own content into black, beside the app shell's real scrollbar.
    // jsdom computes no layout, so assert the containing block instead.
    render(<AchievementsPage />)

    for (const achievement of ALL_ACHIEVEMENTS.slice(0, 5)) {
      const medal = screen.getByTestId(`achievement-card-${achievement.id}`)
      expect(
        medal.className,
        `medal "${achievement.id}" must establish a containing block`,
      ).toContain('relative')
      expect(medal.querySelector('.sr-only')).not.toBeNull()
    }
  })

  it('shows unlocked count in header', () => {
    render(<AchievementsPage />)

    expect(screen.getByTestId('unlock-count')).toHaveTextContent(`0/${ALL_ACHIEVEMENTS.length} unlocked`)
  })

  it('shows correct count when achievements unlocked', () => {
    useAchievementStore.setState({
      unlockedIds: ['first_hand', 'sharp_eye'],
      totalUnlocked: 2,
    })

    render(<AchievementsPage />)

    expect(screen.getByTestId('unlock-count')).toHaveTextContent(`2/${ALL_ACHIEVEMENTS.length} unlocked`)
  })

  it('renders the rank hero with the current level title', () => {
    render(<AchievementsPage />)
    // Fresh localStorage → level 1 Rookie
    expect(screen.getByTestId('rank-title')).toHaveTextContent('Rookie')
  })

  it('unlocked achievements show date', async () => {
    const { achievementEngine } = await import('../../services/achievements/achievement-engine')
    const mockDate = new Date('2026-02-15T10:00:00Z').getTime()
    vi.mocked(achievementEngine.getUnlocked).mockReturnValue([
      { achievementId: 'first_hand', unlockedAt: mockDate },
    ])

    useAchievementStore.setState({
      unlockedIds: ['first_hand'],
      totalUnlocked: 1,
    })

    render(<AchievementsPage />)

    expect(screen.getByTestId('unlocked-date-first_hand')).toHaveTextContent(/Feb 15, 2026/)
  })

  it('locked achievements expose their progress', () => {
    render(<AchievementsPage />)

    // "first_hand" is locked by default, should expose a progress value
    expect(screen.getByTestId('progress-first_hand')).toBeInTheDocument()
  })

  it('filter buttons work', () => {
    useAchievementStore.setState({
      unlockedIds: ['first_hand'],
      totalUnlocked: 1,
    })

    render(<AchievementsPage />)

    // Click "Unlocked" filter
    fireEvent.click(screen.getByTestId('filter-unlocked'))

    // Only first_hand should be visible
    expect(screen.getByTestId('achievement-card-first_hand')).toBeInTheDocument()
    expect(screen.queryByTestId('achievement-card-sharp_eye')).not.toBeInTheDocument()

    // Click "Locked" filter
    fireEvent.click(screen.getByTestId('filter-locked'))

    // first_hand should not be visible, others should be
    expect(screen.queryByTestId('achievement-card-first_hand')).not.toBeInTheDocument()
    expect(screen.getByTestId('achievement-card-sharp_eye')).toBeInTheDocument()

    // Click "All" to reset
    fireEvent.click(screen.getByTestId('filter-all'))
    expect(screen.getByTestId('achievement-card-first_hand')).toBeInTheDocument()
    expect(screen.getByTestId('achievement-card-sharp_eye')).toBeInTheDocument()
  })
})
