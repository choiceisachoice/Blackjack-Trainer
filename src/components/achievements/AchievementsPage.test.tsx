import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AchievementsPage } from './AchievementsPage'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'
import { ALL_ACHIEVEMENTS, achievementDescription } from '../../services/achievements/achievement-list'
import i18n from '../../i18n'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { medalProgress } from './medal-progress'

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

  it('opens a medal\'s description on a tap, and closes it on the second', () => {
    // The description used to be a hover tooltip: on a touch screen a tap
    // showed nothing, and the invisible 440px box made the page scroll
    // sideways. It is in the document only while it is open.
    render(<AchievementsPage />)
    const medal = screen.getByTestId('achievement-card-first_hand')
    expect(screen.queryByTestId('achievement-popover-first_hand')).toBeNull()
    expect(screen.queryAllByRole('tooltip')).toHaveLength(0)
    expect(medal).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(medal)
    const popover = screen.getByTestId('achievement-popover-first_hand')
    const first = ALL_ACHIEVEMENTS.find(a => a.id === 'first_hand')!
    expect(popover).toHaveTextContent(achievementDescription(first, i18n.t.bind(i18n)))
    expect(medal).toHaveAttribute('aria-expanded', 'true')
    expect(medal.getAttribute('aria-describedby')).toBe(popover.id)
    // Wraps inside the screen instead of running out of it.
    expect(popover.className).toContain('whitespace-normal')
    expect(popover.className).toContain('max-w-[min(80vw,260px)]')
    expect(popover.className).not.toContain('whitespace-nowrap')

    fireEvent.click(medal)
    expect(screen.queryByTestId('achievement-popover-first_hand')).toBeNull()
  })

  it('shows one description at a time, and closes it on Escape or a press elsewhere', () => {
    render(<AchievementsPage />)
    fireEvent.click(screen.getByTestId('achievement-card-first_hand'))
    fireEvent.click(screen.getByTestId('achievement-card-sharp_eye'))
    expect(screen.queryByTestId('achievement-popover-first_hand')).toBeNull()
    expect(screen.getByTestId('achievement-popover-sharp_eye')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryAllByRole('tooltip')).toHaveLength(0)

    fireEvent.click(screen.getByTestId('achievement-card-sharp_eye'))
    fireEvent.pointerDown(document.body)
    expect(screen.queryAllByRole('tooltip')).toHaveLength(0)
  })

  it('still shows the description to a mouse that is only passing over', () => {
    render(<AchievementsPage />)
    const medal = screen.getByTestId('achievement-card-first_hand')
    fireEvent.pointerEnter(medal, { pointerType: 'mouse' })
    expect(screen.getByTestId('achievement-popover-first_hand')).toBeInTheDocument()
    fireEvent.pointerLeave(medal, { pointerType: 'mouse' })
    expect(screen.queryByTestId('achievement-popover-first_hand')).toBeNull()
    // A finger fires the same event and never the leave; it must not count.
    fireEvent.pointerEnter(medal, { pointerType: 'touch' })
    expect(screen.queryByTestId('achievement-popover-first_hand')).toBeNull()
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

  /**
   * The ring on a locked medal (21 Nov 2026). The engine has always known how
   * far along an award is; it was only told to someone who tapped the medal.
   */
  describe('progress on the medal itself', () => {
    const byType = (type: string) => ALL_ACHIEVEMENTS.find(a => a.requirement.type === type && a.requirement.value > 1)!
    const progressAt = (pct: number) =>
      (achievementEngine.getProgress as ReturnType<typeof vi.fn>).mockImplementation(() => pct)

    beforeEach(() => progressAt(0))

    it('draws how far a locked award is', () => {
      progressAt(40)
      render(<AchievementsPage />)
      const ring = screen.getByTestId('medal-ring-week_warrior')
      expect(ring).toHaveAttribute('data-percent', '40')
      expect(ring.querySelector('circle')).toHaveAttribute('stroke-dasharray', '40 100')
      // Drawn for the eye only: the number is read out by the label beside it.
      expect(ring).toHaveAttribute('aria-hidden', 'true')
    })

    it('puts no number on the medal — that stays in the description', () => {
      progressAt(40)
      render(<AchievementsPage />)
      const card = screen.getByTestId('achievement-card-week_warrior')
      const visible = [...card.querySelectorAll('span')].filter(s => !s.className.includes('sr-only'))
      expect(visible.some(s => /\d+\s*%/.test(s.textContent ?? ''))).toBe(false)
      fireEvent.click(card)
      expect(screen.getByTestId('achievement-popover-week_warrior').textContent).toMatch(/40/)
    })

    it('draws nothing where nothing has been done yet', () => {
      render(<AchievementsPage />)
      expect(screen.queryByTestId('medal-ring-week_warrior')).toBeNull()
    })

    it('draws nothing on an award that is done or not done', () => {
      progressAt(40)
      render(<AchievementsPage />)
      const binary = ALL_ACHIEVEMENTS.filter(a => medalProgress(a, 40) === null)
      expect(binary.length).toBeGreaterThan(0)
      for (const a of binary) expect(screen.queryByTestId(`medal-ring-${a.id}`)).toBeNull()
      // "Your first session" is one step, not a distance.
      expect(screen.queryByTestId('medal-ring-first_hand')).toBeNull()
      // Every other locked award has its ring.
      const measurable = ALL_ACHIEVEMENTS.filter(a => medalProgress(a, 40) !== null)
      for (const a of measurable) expect(screen.getByTestId(`medal-ring-${a.id}`)).toBeInTheDocument()
    })

    it('draws nothing on an unlocked medal', () => {
      progressAt(100)
      useAchievementStore.setState({ unlockedIds: ['week_warrior'], totalUnlocked: 1 })
      render(<AchievementsPage />)
      expect(screen.queryByTestId('medal-ring-week_warrior')).toBeNull()
    })

    it('medalProgress: a value where there is one, null where there is not', () => {
      expect(medalProgress(byType('streak'), 42.4)).toBe(42.4)
      expect(medalProgress(byType('sessions'), 250)).toBe(100)
      expect(medalProgress(byType('sessions'), -5)).toBe(0)
      expect(medalProgress(byType('sessions'), Number.NaN)).toBeNull()
      for (const type of ['perfect', 'speed', 'night_session', 'casino_blackjack', 'tracker_first_win']) {
        const a = ALL_ACHIEVEMENTS.find(x => x.requirement.type === type)
        if (a) expect(medalProgress(a, 50)).toBeNull()
      }
      expect(medalProgress(ALL_ACHIEVEMENTS.find(a => a.id === 'first_hand')!, 0)).toBeNull()
    })
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
