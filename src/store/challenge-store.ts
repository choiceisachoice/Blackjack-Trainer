import { create } from 'zustand'
import type { TrainingSessionResult } from '../services/stats-types'
import type { ChallengeDefinition, DailyChallengeState } from '../services/challenges/challenge-types'
import { dailyChallengeEngine } from '../services/challenges/daily-challenge'
import type { LearnerContext } from '../services/challenges/challenge-selection'
import { CHALLENGE_XP } from '../services/challenges/challenge-types'
import { soundEngine } from '../services/sound-engine'
import { useLevelStore } from './level-store'

/** State shape for the challenge store. */
export interface ChallengeStoreState {
  /** Today's challenge definition. */
  challenge: ChallengeDefinition
  /** Current progress state for today. */
  state: DailyChallengeState
  /** Current completion streak (consecutive days). */
  streak: number
  /** Total challenges completed all-time. */
  totalCompleted: number
  /** Total XP earned all-time. */
  totalXP: number
  /** True if the challenge was just completed (for celebration UI). */
  justCompleted: boolean
}

/** Actions for the challenge store. */
export interface ChallengeStoreActions {
  /** Update progress after a session. Plays sound on completion. */
  updateProgress(session: TrainingSessionResult, todaySessions: TrainingSessionResult[]): void
  /** Refresh all state from the engine (e.g. at midnight). */
  refresh(): void
  /**
   * Point the engine at the learner's current stage and tier, so tomorrow's
   * challenge fits what they are training rather than the calendar alone.
   */
  syncLearner(context: LearnerContext): void
  /** Clear the justCompleted flag. */
  dismissCompletion(): void
  /** Reset all challenge data. */
  resetAll(): void
}

export type ChallengeStore = ChallengeStoreState & ChallengeStoreActions

/**
 * Zustand store for the Daily Challenge system.
 *
 * Wraps the DailyChallengeEngine and provides reactive state for the UI.
 */
export const useChallengeStore = create<ChallengeStore>((set) => ({
  challenge: dailyChallengeEngine.getTodayChallenge(),
  state: dailyChallengeEngine.getState(),
  streak: dailyChallengeEngine.getStreak(),
  totalCompleted: dailyChallengeEngine.getTotalCompleted(),
  totalXP: dailyChallengeEngine.getTotalXP(),
  justCompleted: false,

  updateProgress(session, todaySessions) {
    const justCompleted = dailyChallengeEngine.updateProgress(session, todaySessions)

    if (justCompleted) {
      soundEngine.sessionComplete()
      const challenge = dailyChallengeEngine.getTodayChallenge()
      useLevelStore.getState().addChallengeXP(CHALLENGE_XP[challenge.difficulty])
    }

    set({
      state: dailyChallengeEngine.getState(),
      streak: dailyChallengeEngine.getStreak(),
      totalCompleted: dailyChallengeEngine.getTotalCompleted(),
      totalXP: dailyChallengeEngine.getTotalXP(),
      justCompleted,
    })
  },

  syncLearner(context) {
    dailyChallengeEngine.setLearnerContext(context)
    set({
      challenge: dailyChallengeEngine.getTodayChallenge(),
      state: dailyChallengeEngine.getState(),
    })
  },

  refresh() {
    set({
      challenge: dailyChallengeEngine.getTodayChallenge(),
      state: dailyChallengeEngine.getState(),
      streak: dailyChallengeEngine.getStreak(),
      totalCompleted: dailyChallengeEngine.getTotalCompleted(),
      totalXP: dailyChallengeEngine.getTotalXP(),
    })
  },

  dismissCompletion() {
    set({ justCompleted: false })
  },

  resetAll() {
    dailyChallengeEngine.resetAll()
    set({
      state: dailyChallengeEngine.getState(),
      streak: dailyChallengeEngine.getStreak(),
      totalCompleted: dailyChallengeEngine.getTotalCompleted(),
      totalXP: dailyChallengeEngine.getTotalXP(),
      justCompleted: false,
    })
  },
}))
