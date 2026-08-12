import type { AppMode } from '../store/app-store'
import type { TrainingMode } from './stats-types'

/** A resumable destination derived from a past session. */
export interface ResumeTarget {
  /** Where the "continue" action navigates. */
  mode: AppMode
  /** Human label for the button, e.g. "Speed Drill". */
  labelKey: string
}

/**
 * Map a recorded session's {@link TrainingMode} to the screen a user can resume.
 *
 * The two enums are deliberately not the same: `TrainingMode` is a *persisted*
 * contract that still contains retired modes (`tableCounting`, `deviationAtTable`
 * were replaced by Flashcards), while `AppMode` only lists screens that exist
 * today. Old session records therefore outlive their screens.
 *
 * @returns the target, or `null` when the recorded mode no longer has a screen —
 *   callers must fall back to a generic call to action rather than route nowhere.
 */
export function resumeTargetFor(mode: TrainingMode): ResumeTarget | null {
  switch (mode) {
    case 'speedDrill': return { mode: 'speedDrill', labelKey: 'modes.speedDrill' }
    case 'deviationFlashCards': return { mode: 'deviationTraining', labelKey: 'modes.deviationFlashCards' }
    case 'betSpread': return { mode: 'betSpread', labelKey: 'modes.betSpread' }
    case 'deckEstimation': return { mode: 'deckEstimation', labelKey: 'modes.deckEstimation' }
    case 'casinoSession': return { mode: 'casinoSession', labelKey: 'modes.casinoSession' }
    // Retired modes kept for historical session records — no screen to return to.
    case 'tableCounting':
    case 'deviationAtTable':
      return null
  }
}
