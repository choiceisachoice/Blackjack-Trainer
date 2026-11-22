import { describe, it, expect } from 'vitest'
import { medalProgress } from './medal-progress'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import type { Achievement, AchievementRequirementType } from '../../services/achievements/achievement-types'

const award = (type: AchievementRequirementType, value: number): Achievement =>
  ({ ...ALL_ACHIEVEMENTS[0], requirement: { type, value } })

describe('medalProgress', () => {
  it('passes the engine’s percentage through for an award that can be measured', () => {
    expect(medalProgress(award('streak', 14), 14.3)).toBe(14.3)
    expect(medalProgress(award('total_hands', 5000), 0)).toBe(0)
    expect(medalProgress(award('accuracy', 95), 88)).toBe(88)
  })

  it('keeps it between 0 and 100', () => {
    expect(medalProgress(award('sessions', 100), 140)).toBe(100)
    expect(medalProgress(award('sessions', 100), -3)).toBe(0)
  })

  it('has nothing to show for an award that is done or not done', () => {
    const binary: AchievementRequirementType[] = [
      'perfect', 'speed', 'speed_drill_perfect', 'unique_systems', 'casino_blackjack', 'casino_split_aces',
      'tracker_first_win', 'tracker_session_hours', 'tracker_single_session_profit', 'tracker_comeback', 'night_session',
    ]
    for (const type of binary) expect(medalProgress(award(type, 5), 60)).toBeNull()
  })

  it('has nothing to show for "one of something" — a single step is not a distance', () => {
    expect(medalProgress(award('sessions', 1), 0)).toBeNull()
    expect(medalProgress(award('tracker_sessions', 1), 0)).toBeNull()
  })

  it('has nothing to show for a value that is not a number', () => {
    expect(medalProgress(award('sessions', 100), Number.NaN)).toBeNull()
  })

  it('leaves most of the catalogue with a ring and some without', () => {
    const measurable = ALL_ACHIEVEMENTS.filter(a => medalProgress(a, 50) !== null).length
    expect(measurable).toBeGreaterThan(0)
    expect(measurable).toBeLessThan(ALL_ACHIEVEMENTS.length)
  })
})
