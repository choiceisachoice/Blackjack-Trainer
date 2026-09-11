import { describe, it, expect } from 'vitest'
import {
  ACHIEVEMENT_AVATAR_SOURCES,
  AVATAR_CATALOG,
  AVATAR_IDS,
  BASE_AVATAR_IDS,
  LEVEL_AVATAR_LEVELS,
  achievementAvatarTier,
  countUnlocked,
  isAvatarId,
  isAvatarUnlocked,
  resolveAvatar,
} from './avatar-catalog'
import { ALL_ACHIEVEMENTS, getAchievementById } from './achievements/achievement-list'
import { LEVELS } from './level-system'

describe('the catalogue', () => {
  it('is the twelve base pictures plus thirty-nine to earn', () => {
    expect(BASE_AVATAR_IDS).toHaveLength(12)
    expect(LEVEL_AVATAR_LEVELS).toHaveLength(24)
    expect(ACHIEVEMENT_AVATAR_SOURCES).toHaveLength(15)
    expect(AVATAR_CATALOG).toHaveLength(51)
    expect(new Set(AVATAR_IDS).size).toBe(51)
  })

  it('hands out one picture per level-up, and no more levels than exist', () => {
    expect(LEVEL_AVATAR_LEVELS[0]).toBe(2)
    expect(LEVEL_AVATAR_LEVELS[LEVEL_AVATAR_LEVELS.length - 1]).toBe(LEVELS.length)
  })

  it('ties every achievement picture to a real award of the top two tiers', () => {
    // A picture for an award that does not exist can never be earned; a
    // picture for a bronze award is a participation ribbon.
    for (const src of ACHIEVEMENT_AVATAR_SOURCES) {
      const a = getAchievementById(src)
      expect(a, src).toBeDefined()
      expect(['gold', 'diamond'], src).toContain(a?.tier)
    }
  })

  it('covers every diamond award a person can reach', () => {
    // `level_25` is left out on purpose — the level family already pays it.
    const diamonds = ALL_ACHIEVEMENTS.filter(a => a.tier === 'diamond' && a.id !== 'level_25').map(a => a.id)
    for (const id of diamonds) expect(ACHIEVEMENT_AVATAR_SOURCES, id).toContain(id)
  })

  it('knows which stored strings are pictures', () => {
    expect(isAvatarId('spade')).toBe(true)
    expect(isAvatarId('level-7')).toBe(true)
    expect(isAvatarId('ach-legendary')).toBe(true)
    expect(isAvatarId('level-99')).toBe(false)
    expect(isAvatarId('https://evil/x.png')).toBe(false)
  })

  it('colours an achievement picture by its award tier', () => {
    expect(achievementAvatarTier('legendary')).toBe('diamond')
    expect(achievementAvatarTier('hundred_hours')).toBe('gold')
  })
})

describe('unlocking', () => {
  const fresh = { level: 1, unlockedAchievementIds: [] }
  const veteran = { level: 14, unlockedAchievementIds: ['legendary'] }

  it('gives everyone the base set from the first minute', () => {
    for (const id of BASE_AVATAR_IDS) expect(isAvatarUnlocked(id, fresh)).toBe(true)
  })

  it('opens a level picture at that level and keeps it after', () => {
    expect(isAvatarUnlocked('level-2', fresh)).toBe(false)
    expect(isAvatarUnlocked('level-14', veteran)).toBe(true)
    expect(isAvatarUnlocked('level-3', veteran)).toBe(true)
    expect(isAvatarUnlocked('level-15', veteran)).toBe(false)
  })

  it('opens an achievement picture with its award', () => {
    expect(isAvatarUnlocked('ach-legendary', veteran)).toBe(true)
    expect(isAvatarUnlocked('ach-casino_pro', veteran)).toBe(false)
  })

  it('refuses to show a stored picture that was not earned', () => {
    // The metadata is client-writable. Whatever it says, the picture is
    // drawn only if the stores say it was earned.
    expect(resolveAvatar('level-25', fresh)).toBeNull()
    expect(resolveAvatar('level-25', { level: 25, unlockedAchievementIds: [] })).toBe('level-25')
    expect(resolveAvatar('heart', fresh)).toBe('heart')
    expect(resolveAvatar(null, fresh)).toBeNull()
  })

  it('counts what has been unlocked', () => {
    expect(countUnlocked(fresh)).toBe(12)
    expect(countUnlocked(veteran)).toBe(12 + 13 + 1)
  })
})
