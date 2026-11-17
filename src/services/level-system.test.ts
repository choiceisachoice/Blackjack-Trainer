import { describe, it, expect, beforeEach } from 'vitest'
import { LevelSystem, LEVELS } from './level-system'
import i18next from 'i18next'

describe('LEVELS definition', () => {
  it('has 25 levels', () => {
    expect(LEVELS).toHaveLength(25)
  })

  it('all levels have unique level numbers', () => {
    const numbers = LEVELS.map(l => l.level)
    expect(new Set(numbers).size).toBe(25)
  })

  it('all levels have unique titles', () => {
    // Resolved through the messages: the titles are keys now, and a key that
    // resolves to nothing would still be unique while showing the same blank
    // to every player.
    const titles = LEVELS.map(l => i18next.t(l.titleKey))
    expect(new Set(titles).size).toBe(25)
    for (const l of LEVELS) {
      expect(i18next.t(l.titleKey), `level ${l.level}`).not.toBe(l.titleKey)
    }
  })

  it('keys each level’s name to its own number', () => {
    // A regex rewrite once numbered these sequentially and skipped the one
    // title written with double quotes, which silently shifted every level
    // from 9 upwards onto the previous level’s name.
    for (const l of LEVELS) {
      expect(l.titleKey, `level ${l.level}`).toBe(`levels.l${l.level}`)
    }
  })

  it('xpRequired is strictly increasing', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].xpRequired).toBeGreaterThan(LEVELS[i - 1].xpRequired)
    }
  })

  it('level 1 starts at 0 XP', () => {
    expect(LEVELS[0].level).toBe(1)
    expect(LEVELS[0].xpRequired).toBe(0)
  })

  it('tops out at level 25, and the top is reachable', () => {
    expect(LEVELS[24].level).toBe(25)
    // Deliberately a ceiling, not an equality: the curve gets rebalanced, and a
    // test that pins the exact number breaks on every pass without saying
    // anything about the rule. What matters is that the top stays in reach —
    // it used to sit at a million XP, which is 8+ years of daily training.
    expect(LEVELS[24].xpRequired).toBeLessThanOrEqual(250_000)
  })

  it('never asks for less as the levels go up', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].xpRequired).toBeGreaterThan(LEVELS[i - 1].xpRequired)
    }
  })

  it('beginner tier is levels 1-5', () => {
    const beginners = LEVELS.filter(l => l.tier === 'beginner')
    expect(beginners.map(l => l.level)).toEqual([1, 2, 3, 4, 5])
  })

  it('mid tier is levels 6-10', () => {
    const mids = LEVELS.filter(l => l.tier === 'mid')
    expect(mids.map(l => l.level)).toEqual([6, 7, 8, 9, 10])
  })

  it('advanced tier is levels 11-17', () => {
    const advanced = LEVELS.filter(l => l.tier === 'advanced')
    expect(advanced.map(l => l.level)).toEqual([11, 12, 13, 14, 15, 16, 17])
  })

  it('elite tier is levels 18-25', () => {
    const elites = LEVELS.filter(l => l.tier === 'elite')
    expect(elites.map(l => l.level)).toEqual([18, 19, 20, 21, 22, 23, 24, 25])
  })

  it('all levels have non-empty color and glowColor', () => {
    for (const level of LEVELS) {
      expect(level.color).toBeTruthy()
      expect(level.glowColor).toBeTruthy()
    }
  })
})

describe('LevelSystem', () => {
  let system: LevelSystem

  beforeEach(() => {
    localStorage.clear()
    system = new LevelSystem()
  })

  // ── getLevel ──────────────────────────────────────────

  describe('getLevel', () => {
    it('starts at level 1 Rookie with 0 XP', () => {
      const level = system.getLevel()
      expect(level.level).toBe(1)
      expect(i18next.t(level.titleKey)).toBe('Rookie')
    })

    it('reaches level 2 Beginner at 50 XP', () => {
      system.addXP(50)
      expect(system.getLevel().level).toBe(2)
      expect(i18next.t(system.getLevel().titleKey)).toBe('Beginner')
    })

    it('reaches level 5 at 1000 XP', () => {
      system.addXP(1000)
      expect(system.getLevel().level).toBe(5)
      expect(i18next.t(system.getLevel().titleKey)).toBe('Lucky Starter')
    })

    it('reaches level 10 at its own threshold', () => {
      system.addXP(LEVELS[9].xpRequired)
      expect(system.getLevel().level).toBe(10)
      expect(i18next.t(system.getLevel().titleKey)).toBe('Table Pro')
    })

    it('reaches level 25 Grandmaster at its own threshold', () => {
      system.addXP(LEVELS[24].xpRequired)
      expect(system.getLevel().level).toBe(25)
      expect(i18next.t(system.getLevel().titleKey)).toBe('Grandmaster of Blackjack')
    })

    it('returns correct level for exact threshold', () => {
      system.addXP(500) // Exact level 4 threshold
      expect(system.getLevel().level).toBe(4)
    })

    it('returns correct level for XP between thresholds', () => {
      system.addXP(300) // Between 200 (lvl3) and 500 (lvl4)
      expect(system.getLevel().level).toBe(3)
    })
  })

  // ── getProgressToNext ─────────────────────────────────

  describe('getProgressToNext', () => {
    it('shows 0% progress at level start', () => {
      const progress = system.getProgressToNext()
      expect(progress.current).toBe(0)
      expect(progress.required).toBe(50)
      expect(progress.percent).toBe(0)
    })

    it('shows correct percentage mid-level', () => {
      system.addXP(25) // 25/50 = 50%
      const progress = system.getProgressToNext()
      expect(progress.current).toBe(25)
      expect(progress.required).toBe(50)
      expect(progress.percent).toBe(50)
    })

    it('shows 100% at max level', () => {
      system.addXP(1_000_000)
      const progress = system.getProgressToNext()
      expect(progress.percent).toBe(100)
    })

    it('resets progress after leveling up', () => {
      system.addXP(55) // Level 2 starts at 50, so 5 XP into level 2
      const progress = system.getProgressToNext()
      expect(progress.current).toBe(5) // 55 - 50
      expect(progress.required).toBe(150) // 200 - 50
    })
  })

  // ── addXP ─────────────────────────────────────────────

  describe('addXP', () => {
    it('returns leveledUp true when crossing threshold', () => {
      const result = system.addXP(50) // 0 → 50 = level 2
      expect(result.leveledUp).toBe(true)
      expect(result.newLevel?.level).toBe(2)
      expect(result.oldLevel?.level).toBe(1)
    })

    it('returns leveledUp false within same level', () => {
      const result = system.addXP(25) // stays level 1
      expect(result.leveledUp).toBe(false)
      expect(result.newLevel).toBeUndefined()
    })

    it('handles multiple level jumps at once', () => {
      const result = system.addXP(1000) // 0 → 1000 = level 5
      expect(result.leveledUp).toBe(true)
      expect(result.newLevel?.level).toBe(5)
      expect(result.oldLevel?.level).toBe(1)
    })

    it('accumulates XP across multiple addXP calls', () => {
      system.addXP(30)
      system.addXP(30)
      expect(system.getTotalXP()).toBe(60)
      expect(system.getLevel().level).toBe(2)
    })
  })

  // ── Persistence ───────────────────────────────────────

  describe('persistence', () => {
    it('persists totalXP in localStorage', () => {
      system.addXP(100)
      const system2 = new LevelSystem()
      expect(system2.getTotalXP()).toBe(100)
    })

    it('handles missing localStorage key', () => {
      localStorage.removeItem('bjt_level_xp')
      const system2 = new LevelSystem()
      expect(system2.getTotalXP()).toBe(0)
    })

    it('handles corrupted localStorage', () => {
      localStorage.setItem('bjt_level_xp', 'not-a-number')
      const system2 = new LevelSystem()
      expect(system2.getTotalXP()).toBe(0)
    })

    it('resetAll clears everything', () => {
      system.addXP(500)
      system.resetAll()
      expect(system.getTotalXP()).toBe(0)
      expect(system.getLevel().level).toBe(1)
      expect(localStorage.getItem('bjt_level_xp')).toBeNull()
    })
  })

  describe('setTotalXP (cloud hydration)', () => {
    it('overwrites XP and persists it', () => {
      // Derived from the table, not pinned to a number. This test used to say
      // "68,000 is level 15" — true under the old curve, and after the Aug 2026
      // rebalance 68,000 is level 19. What it means to assert is that hydration
      // replaces the total and the level follows from it.
      const target = LEVELS[14].xpRequired
      system.addXP(100)
      system.setTotalXP(target)
      expect(system.getTotalXP()).toBe(target)
      expect(system.getLevel().level).toBe(15)
      expect(new LevelSystem().getTotalXP()).toBe(target)
    })

    it('floors and clamps to a non-negative integer', () => {
      system.setTotalXP(-50)
      expect(system.getTotalXP()).toBe(0)
      system.setTotalXP(123.9)
      expect(system.getTotalXP()).toBe(123)
    })
  })
})
