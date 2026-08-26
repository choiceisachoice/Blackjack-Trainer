import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AchievementToast } from './AchievementToast'
import { useAchievementStore } from '../../store/achievement-store'
import { useLevelStore } from '../../store/level-store'
import type { Achievement } from '../../services/achievements/achievement-types'

// Mock sound engine
vi.mock('../../services/sound-engine', () => ({
  soundEngine: {
    streak: vi.fn(),
  },
}))

// Real ids: the toast reads its text from the messages now, so a made-up id
// would render a raw key path instead of a name.
const mockAchievement: Achievement = {
  id: 'first_hand',
  icon: '\uD83C\uDFB0',
  category: 'getting_started',
  requirement: { type: 'sessions', value: 1 },
  tier: 'bronze',
}

const mockAchievement2: Achievement = {
  id: 'sharp_eye',
  icon: '\u2705',
  category: 'mastery',
  requirement: { type: 'accuracy', value: 80 },
  tier: 'bronze',
}

describe('AchievementToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAchievementStore.setState({
      unlockedIds: [],
      newlyUnlocked: [],
      totalUnlocked: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing when no achievements', () => {
    render(<AchievementToast />)
    expect(screen.queryByTestId('achievement-toast')).not.toBeInTheDocument()
  })

  it('shows toast when new achievement unlocked', () => {
    useAchievementStore.setState({
      newlyUnlocked: [mockAchievement],
    })

    render(<AchievementToast />)

    expect(screen.getByTestId('achievement-toast')).toBeInTheDocument()
    expect(screen.getByText('First Hand')).toBeInTheDocument()
    expect(screen.getByText('Achievement Unlocked!')).toBeInTheDocument()
  })

  it('plays streak sound when achievement appears', async () => {
    const { soundEngine } = await import('../../services/sound-engine')

    useAchievementStore.setState({
      newlyUnlocked: [mockAchievement],
    })

    render(<AchievementToast />)

    expect(soundEngine.streak).toHaveBeenCalled()
  })

  it('auto-dismisses after 4 seconds', () => {
    useAchievementStore.setState({
      newlyUnlocked: [mockAchievement],
    })

    render(<AchievementToast />)
    expect(screen.getByTestId('achievement-toast')).toBeInTheDocument()

    // After 4 seconds, it starts dismissing
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    // After exit animation (300ms)
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // The dismiss was called, which removes from queue
    expect(useAchievementStore.getState().newlyUnlocked).toHaveLength(0)
  })

  it('queues multiple achievements', () => {
    useAchievementStore.setState({
      newlyUnlocked: [mockAchievement, mockAchievement2],
    })

    render(<AchievementToast />)

    // First achievement shown
    expect(screen.getByText('First Hand')).toBeInTheDocument()

    // Dismiss first (4s + 300ms animation)
    act(() => {
      vi.advanceTimersByTime(4300)
    })

    // Second should now show
    expect(screen.getByText('Sharp Eye')).toBeInTheDocument()
  })
})

describe('AchievementToast and the level-up popup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAchievementStore.setState({ newlyUnlocked: [] })
    useLevelStore.setState({ showLevelUp: false })
  })
  afterEach(() => {
    vi.useRealTimers()
    useLevelStore.setState({ showLevelUp: false })
  })

  /**
   * The three announcements arrive on the same event: a session ends, pays XP,
   * unlocks an award, and sometimes takes the player up a level. The popup
   * covers the screen at z-[9999], so an achievement toast shown underneath ran
   * its whole four seconds unseen and took its queue entry with it.
   */
  it('stays out of the way while the popup is open, and keeps its queue', () => {
    useLevelStore.setState({ showLevelUp: true })
    useAchievementStore.setState({ newlyUnlocked: [mockAchievement] })

    const { rerender } = render(<AchievementToast />)
    expect(screen.queryByTestId('achievement-toast')).toBeNull()
    expect(useAchievementStore.getState().newlyUnlocked).toHaveLength(1)

    // Closing the popup hands the moment back, with the award still queued.
    useLevelStore.setState({ showLevelUp: false })
    rerender(<AchievementToast />)
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByTestId('achievement-toast')).toBeInTheDocument()
  })
})
