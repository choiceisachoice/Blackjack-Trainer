import { create } from 'zustand'
import type { Achievement } from '../services/achievements/achievement-types'
import type { TrainingSessionResult, LifetimeStats } from '../services/stats-types'
import { achievementEngine } from '../services/achievements/achievement-engine'
import { ALL_ACHIEVEMENTS } from '../services/achievements/achievement-list'
import { pushNewUnlocks, clearCloudAchievements } from '../services/supabase/achievements-sync'
import { useLevelStore } from './level-store'

/** State shape for the achievement store. */
export interface AchievementStoreState {
  /** IDs of all unlocked achievements. */
  unlockedIds: string[]
  /** Queue of newly unlocked achievements waiting to be shown as toasts. */
  newlyUnlocked: Achievement[]
  /** Total number of unlocked achievements. */
  totalUnlocked: number
  /**
   * A screen is showing the awards a round unlocked, by name, so the toast
   * holds back. The round summary is the moment that earned them; a toast
   * over its right panel for four seconds said the same thing twice and hid
   * the misses. Held entries stay in the queue until the screen releases
   * them (`releaseUnlocksInPlace`), which drops the ones it showed — so a
   * held award is neither lost nor announced again later.
   */
  unlocksInPlace: boolean
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
   * Check for bankroll-tracker achievements after a session is added/edited/deleted.
   */
  checkBankrollTrackerAchievements(): void

  /** Remove the first achievement from the toast queue. */
  dismissNewAchievement(): void

  /** A screen shows the coming unlocks itself: hold the toast. Call before the round is recorded. */
  holdUnlocksInPlace(): void

  /**
   * The screen is gone: let the toast speak again. `shown` are the ids the
   * screen showed; they leave the queue, anything else in it is still announced.
   */
  releaseUnlocksInPlace(shown: readonly string[]): void

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
  unlocksInPlace: false,

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

  holdUnlocksInPlace() {
    set({ unlocksInPlace: true })
  },

  releaseUnlocksInPlace(shown) {
    set(state => ({
      unlocksInPlace: false,
      newlyUnlocked: state.newlyUnlocked.filter(a => !shown.includes(a.id)),
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
