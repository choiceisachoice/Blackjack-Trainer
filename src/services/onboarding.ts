import type { TrainingSessionResult } from './stats-types'
import type { AppMode } from '../store/app-store'

/** localStorage flag mirroring `profiles.onboarding_seen`. */
const STORAGE_KEY = 'bjt_onboarding_seen'

/** Sessions the "build the habit" step asks for. */
export const HABIT_SESSIONS = 5

export interface OnboardingStep {
  id: string
  label: string
  hint: string
  /** Where the step's button takes you. */
  mode: AppMode
  done: boolean
  /** Progress toward a counted step, e.g. 2 of 5 sessions. Omitted when binary. */
  progress?: { current: number; target: number }
}

/**
 * Derive the first-run checklist from recorded sessions.
 *
 * Every step is checked against real training history — nothing is stored to
 * say "the user did this", because the sessions already say it. That also means
 * the checklist is correct on a new device the moment the cloud sync lands.
 *
 * All three steps use FREE modes on purpose: a new account should never be sent
 * into the paywall to finish onboarding.
 */
export function deriveOnboardingSteps(
  sessions: readonly TrainingSessionResult[],
): OnboardingStep[] {
  const count = sessions.length
  return [
    {
      id: 'speed-drill',
      label: 'Run your first Speed Drill',
      hint: 'Keep the running count while cards flash by.',
      mode: 'speedDrill',
      done: sessions.some(s => s.mode === 'speedDrill'),
    },
    {
      id: 'flashcards',
      label: 'Drill a few hands in Flashcards',
      hint: 'Learn the correct play for every hand.',
      mode: 'deviationTraining',
      done: sessions.some(s => s.mode === 'deviationFlashCards'),
    },
    {
      id: 'habit',
      label: `Complete ${HABIT_SESSIONS} training sessions`,
      hint: 'Counting is a reflex — it comes from repetition.',
      mode: 'speedDrill',
      done: count >= HABIT_SESSIONS,
      progress: { current: Math.min(count, HABIT_SESSIONS), target: HABIT_SESSIONS },
    },
  ]
}

/** True when every step is done. */
export function isOnboardingComplete(steps: readonly OnboardingStep[]): boolean {
  return steps.every(s => s.done)
}

/**
 * Whether the user has dismissed the checklist.
 *
 * Mirrors `profiles.onboarding_seen`; the two are reconciled on sign-in by a
 * logical OR — once dismissed anywhere, it stays dismissed (the boolean
 * equivalent of the max-merge used for the progress scalars).
 */
export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Persist the dismissal locally. Cloud push is the caller's job. */
export function setOnboardingSeen(seen: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(seen))
  } catch {
    /* storage unavailable — the checklist simply reappears next visit */
  }
}

const WELCOME_KEY = 'bjt_welcome_seen'

/**
 * Whether this account has been through the welcome screen.
 *
 * Kept separate from the placement: someone can retake the placement test any
 * number of times, and being greeted again each time would be absurd. The
 * welcome is a once-per-account moment.
 */
export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === 'true'
  } catch {
    // Storage unavailable — greeting again is a far smaller failure than
    // skipping the only orientation a new account gets.
    return false
  }
}

/** Record that the welcome has been shown. */
export function setWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, 'true')
  } catch {
    /* storage unavailable */
  }
}
