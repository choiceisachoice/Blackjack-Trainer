import { create } from 'zustand'
import type { Achievement } from '../services/achievements/achievement-types'
import type { TrainingSessionResult, LifetimeStats } from '../services/stats-types'
import type { SimulationResult } from '../engine/simulation/types'
import { achievementEngine } from '../services/achievements/achievement-engine'
import { ALL_ACHIEVEMENTS } from '../services/achievements/achievement-list'
import { pushNewUnlocks, clearCloudAchievements } from '../services/supabase/achievements-sync'
import { pushProfileScalars } from '../services/supabase/profiles-sync'
import { useLevelStore } from './level-store'

/** State shape for the achievement store. */
export interface AchievementStoreState {
  /** IDs of all unlocked achievements. */
  unlockedIds: string[]
  /** Queue of newly unlocked achievements waiting to be shown as toasts. */
  newlyUnlocked: Achievement[]
  /** Total number of unlocked achievements. */
  totalUnlocked: number
}

/** Actions for the achievement store. */
export interface AchievementStoreActions {
  /**
   * Check for newly unlocked achievements after a training session.
   * Any new achievements are added to the toast queue.
   */
  checkAchievements(
    session: TrainingSessionResult,
    stats: LifetimeStats,
    dayStreak: number,
    allSessions: TrainingSessionResult[],
  ): void

  /**
   * Check for simulation-related achievements after a bankroll simulation.
   */
  checkSimulationAchievements(result: SimulationResult): void

  /**
   * Check for bankroll-tracker achievements after a session is added/edited/deleted.
   */
  checkBankrollTrackerAchievements(): void

  /** Remove the first achievement from the toast queue. */
  dismissNewAchievement(): void

  /** Reload achievement state from the engine. */
  loadAchievements(): void

  /** Reset all achievements (clears everything). */
  resetAchievements(): void
}

export type AchievementStore = AchievementStoreState & AchievementStoreActions

/**
 * Zustand store for achievement tracking and toast notifications.
 *
 * Wraps the AchievementEngine and provides reactive state for the UI.
 */
export const useAchievementStore = create<AchievementStore>((set) => ({
  unlockedIds: achievementEngine.getUnlocked().map(u => u.achievementId),
  newlyUnlocked: [],
  totalUnlocked: achievementEngine.getUnlockedCount(),

  checkAchievements(session, stats, dayStreak, allSessions) {
    const newAchievements = achievementEngine.checkAfterSession(
      session, stats, dayStreak, allSessions,
    )
    if (newAchievements.length > 0) {
      set(state => ({
        unlockedIds: achievementEngine.getUnlocked().map(u => u.achievementId),
        newlyUnlocked: [...state.newlyUnlocked, ...newAchievements],
        totalUnlocked: achievementEngine.getUnlockedCount(),
      }))
      useLevelStore.getState().addAchievementsXP(newAchievements.map(a => a.tier))
      pushNewUnlocks(newAchievements)
    }
  },

  checkSimulationAchievements(result) {
    const newAchievements = achievementEngine.checkAfterSimulation(result)
    if (newAchievements.length > 0) {
      set(state => ({
        unlockedIds: achievementEngine.getUnlocked().map(u => u.achievementId),
        newlyUnlocked: [...state.newlyUnlocked, ...newAchievements],
        totalUnlocked: achievementEngine.getUnlockedCount(),
      }))
      useLevelStore.getState().addAchievementsXP(newAchievements.map(a => a.tier))
      pushNewUnlocks(newAchievements)
    }
    // A simulation always bumps the sim counters, even with no new unlock.
    pushProfileScalars()
  },

  checkBankrollTrackerAchievements() {
    const newAchievements = achievementEngine.checkAfterBankrollUpdate()
    if (newAchievements.length > 0) {
      set(state => ({
        unlockedIds: achievementEngine.getUnlocked().map(u => u.achievementId),
        newlyUnlocked: [...state.newlyUnlocked, ...newAchievements],
        totalUnlocked: achievementEngine.getUnlockedCount(),
      }))
      useLevelStore.getState().addAchievementsXP(newAchievements.map(a => a.tier))
      pushNewUnlocks(newAchievements)
    }
  },

  dismissNewAchievement() {
    set(state => ({
      newlyUnlocked: state.newlyUnlocked.slice(1),
    }))
  },

  loadAchievements() {
    set({
      unlockedIds: achievementEngine.getUnlocked().map(u => u.achievementId),
      totalUnlocked: achievementEngine.getUnlockedCount(),
    })
  },

  resetAchievements() {
    achievementEngine.resetAll()
    set({
      unlockedIds: [],
      newlyUnlocked: [],
      totalUnlocked: 0,
    })
    // Best-effort clear of the cloud copy so a later sign-in doesn't re-hydrate them.
    void clearCloudAchievements().catch(e => console.error('cloud achievement reset failed', e))
  },
}))

/** Get all achievement definitions. */
export { ALL_ACHIEVEMENTS }
