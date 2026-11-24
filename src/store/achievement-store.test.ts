import { describe, it, expect, beforeEach } from 'vitest'
import { useAchievementStore } from './achievement-store'
import { ALL_ACHIEVEMENTS } from '../services/achievements/achievement-list'

/**
 * Holding the unlock toast while a screen (the round summary) names the
 * awards itself. A held award must be neither lost nor announced twice.
 */
describe('useAchievementStore — unlocks shown in place', () => {
  const [a, b] = ALL_ACHIEVEMENTS
  beforeEach(() => {
    useAchievementStore.setState({ newlyUnlocked: [], unlocksInPlace: false })
  })

  it('holds without touching the queue', () => {
    useAchievementStore.setState({ newlyUnlocked: [a, b] })
    useAchievementStore.getState().holdUnlocksInPlace()
    expect(useAchievementStore.getState().unlocksInPlace).toBe(true)
    expect(useAchievementStore.getState().newlyUnlocked).toEqual([a, b])
  })

  it('on release drops exactly what was shown and keeps the rest queued', () => {
    useAchievementStore.setState({ newlyUnlocked: [a, b], unlocksInPlace: true })
    useAchievementStore.getState().releaseUnlocksInPlace([a.id])
    expect(useAchievementStore.getState().unlocksInPlace).toBe(false)
    expect(useAchievementStore.getState().newlyUnlocked).toEqual([b])
  })
})
