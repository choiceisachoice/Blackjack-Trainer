import { create } from 'zustand'
import type { TrainingSessionResult } from '../services/stats-types'
import type { WeeklyChallengeDefinition, WeeklyChallengeState } from '../services/challenges/challenge-types'
import { weeklyChallengeEngine } from '../services/challenges/weekly-challenge'
import type { LearnerContext } from '../services/challenges/challenge-selection'
import { soundEngine } from '../services/sound-engine'
import { useLevelStore } from './level-store'

/** State shape for the weekly challenge store. */
export interface WeeklyChallengeStoreState {
  /** This week's challenge definition. */
  challenge: WeeklyChallengeDefinition
  /** Current progress state for this week. */
  state: WeeklyChallengeState
  /** Current completion streak (consecutive weeks). */
  streak: number
  /** Total weekly challenges completed all-time. */
  totalCompleted: number
  /** Total XP earned from weekly challenges. */
  totalXP: number
  /** True if the challenge was just completed (for celebration UI). */
  justCompleted: boolean
}

/** Actions for the weekly challenge store. */
export interface WeeklyChallengeStoreActions {
  /** Update progress after a session. Plays sound on completion. */
  updateProgress(session: TrainingSessionResult, weekSessions: TrainingSessionResult[]): void
  /** Refresh all state from the engine (e.g. at week boundary). */
  refresh(): void
  /**
   * Point the engine at the learner's current stage and tier. Every mode-bound
   * weekly challenge needs the Pro-gated Casino Session, so without this a free
   * account could draw a week it had no way to finish.
   */
  syncLearner(context: LearnerContext): void
  /** Clear the justCompleted flag. */
  dismissCompletion(): void
  /** Reset all weekly challenge data. */
  resetAll(): void
}

export type WeeklyChallengeStore = WeeklyChallengeStoreState & WeeklyChallengeStoreActions

/**
 * Zustand store for the Weekly Challenge system.
 *
 * Wraps the WeeklyChallengeEngine and provides reactive state for the UI.
 */
export const useWeeklyChallengeStore = create<WeeklyChallengeStore>((set) => ({
  challenge: weeklyChallengeEngine.getThisWeekChallenge(),
  state: weeklyChallengeEngine.getState(),
  streak: weeklyChallengeEngine.getStreak(),
  totalCompleted: weeklyChallengeEngine.getTotalCompleted(),
  totalXP: weeklyChallengeEngine.getTotalXP(),
  justCompleted: false,

  updateProgress(session, weekSessions) {
    const justCompleted = weeklyChallengeEngine.updateProgress(session, weekSessions)

    if (justCompleted) {
      soundEngine.sessionComplete()
      const challenge = weeklyChallengeEngine.getThisWeekChallenge()
      useLevelStore.getState().addChallengeXP(challenge.xpReward)
    }

    set({
      state: weeklyChallengeEngine.getState(),
      streak: weeklyChallengeEngine.getStreak(),
      totalCompleted: weeklyChallengeEngine.getTotalCompleted(),
      totalXP: weeklyChallengeEngine.getTotalXP(),
      justCompleted,
    })
  },

  syncLearner(context) {
    weeklyChallengeEngine.setLearnerContext(context)
    set({
      challenge: weeklyChallengeEngine.getThisWeekChallenge(),
      state: weeklyChallengeEngine.getState(),
    })
  },

  refresh() {
    set({
      challenge: weeklyChallengeEngine.getThisWeekChallenge(),
      state: weeklyChallengeEngine.getState(),
      streak: weeklyChallengeEngine.getStreak(),
      totalCompleted: weeklyChallengeEngine.getTotalCompleted(),
      totalXP: weeklyChallengeEngine.getTotalXP(),
    })
  },

  dismissCompletion() {
    set({ justCompleted: false })
  },

  resetAll() {
    weeklyChallengeEngine.resetAll()
    set({
      state: weeklyChallengeEngine.getState(),
      streak: weeklyChallengeEngine.getStreak(),
      totalCompleted: weeklyChallengeEngine.getTotalCompleted(),
      totalXP: weeklyChallengeEngine.getTotalXP(),
      justCompleted: false,
    })
  },
}))
