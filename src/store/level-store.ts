import { create } from 'zustand'
import type { TrainingSessionResult } from '../services/stats-types'
import type { LevelDefinition, LevelProgress } from '../services/level-system'
import { levelSystem, calculateSessionXP, XP_REWARDS } from '../services/level-system'
import { soundEngine } from '../services/sound-engine'

/** State shape for the level store. */
export interface LevelStoreState {
  /** Total accumulated XP. */
  totalXP: number
  /** Current level definition. */
  level: LevelDefinition
  /** Progress toward the next level. */
  progress: LevelProgress
  /** Whether to show the level-up popup. */
  showLevelUp: boolean
  /** Data for the level-up popup (old and new level). */
  levelUpData: { oldLevel: LevelDefinition; newLevel: LevelDefinition } | null
}

/** Actions for the level store. */
export interface LevelStoreActions {
  /** Add XP from a completed training session. */
  addSessionXP(session: TrainingSessionResult): void
  /** Add XP from a completed challenge (daily or weekly). */
  addChallengeXP(amount: number): void
  /** Add XP from an unlocked achievement. */
  addAchievementXP(tier: string): void
  /** Dismiss the level-up popup. */
  dismissLevelUp(): void
  /** Refresh all state from the engine. */
  refresh(): void
}

export type LevelStore = LevelStoreState & LevelStoreActions

/** Map achievement tier to XP reward. */
function tierToXP(tier: string): number {
  switch (tier) {
    case 'bronze': return XP_REWARDS.achievementBronze
    case 'silver': return XP_REWARDS.achievementSilver
    case 'gold': return XP_REWARDS.achievementGold
    case 'diamond': return XP_REWARDS.achievementDiamond
    default: return 0
  }
}

/**
 * Zustand store for the Level System.
 *
 * Wraps the LevelSystem engine and provides reactive state for the UI.
 */
export const useLevelStore = create<LevelStore>((set) => ({
  totalXP: levelSystem.getTotalXP(),
  level: levelSystem.getLevel(),
  progress: levelSystem.getProgressToNext(),
  showLevelUp: false,
  levelUpData: null,

  addSessionXP(session) {
    const xp = calculateSessionXP(session)
    const result = levelSystem.addXP(xp)

    if (result.leveledUp && result.oldLevel && result.newLevel) {
      soundEngine.levelUp()
      set({
        totalXP: levelSystem.getTotalXP(),
        level: levelSystem.getLevel(),
        progress: levelSystem.getProgressToNext(),
        showLevelUp: true,
        levelUpData: { oldLevel: result.oldLevel, newLevel: result.newLevel },
      })
    } else {
      set({
        totalXP: levelSystem.getTotalXP(),
        level: levelSystem.getLevel(),
        progress: levelSystem.getProgressToNext(),
      })
    }
  },

  addChallengeXP(amount) {
    const result = levelSystem.addXP(amount)

    if (result.leveledUp && result.oldLevel && result.newLevel) {
      soundEngine.levelUp()
      set({
        totalXP: levelSystem.getTotalXP(),
        level: levelSystem.getLevel(),
        progress: levelSystem.getProgressToNext(),
        showLevelUp: true,
        levelUpData: { oldLevel: result.oldLevel, newLevel: result.newLevel },
      })
    } else {
      set({
        totalXP: levelSystem.getTotalXP(),
        level: levelSystem.getLevel(),
        progress: levelSystem.getProgressToNext(),
      })
    }
  },

  addAchievementXP(tier) {
    const xp = tierToXP(tier)
    if (xp === 0) return

    const result = levelSystem.addXP(xp)

    if (result.leveledUp && result.oldLevel && result.newLevel) {
      soundEngine.levelUp()
      set({
        totalXP: levelSystem.getTotalXP(),
        level: levelSystem.getLevel(),
        progress: levelSystem.getProgressToNext(),
        showLevelUp: true,
        levelUpData: { oldLevel: result.oldLevel, newLevel: result.newLevel },
      })
    } else {
      set({
        totalXP: levelSystem.getTotalXP(),
        level: levelSystem.getLevel(),
        progress: levelSystem.getProgressToNext(),
      })
    }
  },

  dismissLevelUp() {
    set({ showLevelUp: false, levelUpData: null })
  },

  refresh() {
    set({
      totalXP: levelSystem.getTotalXP(),
      level: levelSystem.getLevel(),
      progress: levelSystem.getProgressToNext(),
    })
  },
}))
