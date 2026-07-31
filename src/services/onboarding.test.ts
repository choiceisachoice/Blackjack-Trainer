import { describe, it, expect, beforeEach } from 'vitest'
import {
  deriveOnboardingSteps,
  isOnboardingComplete,
  hasSeenOnboarding,
  setOnboardingSeen,
  HABIT_SESSIONS,
} from './onboarding'
import { isProMode } from './pro-features'
import type { TrainingMode, TrainingSessionResult } from './stats-types'

/** A session fixture; only `mode` matters to the checklist. */
function session(mode: TrainingMode): TrainingSessionResult {
  return {
    id: crypto.randomUUID(),
    mode,
    timestamp: '2026-03-20T10:00:00.000Z',
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
  } as unknown as TrainingSessionResult
}

/** n sessions of the same mode. */
function sessions(mode: TrainingMode, n: number): TrainingSessionResult[] {
  return Array.from({ length: n }, () => session(mode))
}

describe('deriveOnboardingSteps', () => {
  it('starts with nothing done for a brand-new account', () => {
    const steps = deriveOnboardingSteps([])
    expect(steps).toHaveLength(3)
    expect(steps.every(s => !s.done)).toBe(true)
    expect(isOnboardingComplete(steps)).toBe(false)
  })

  it('ticks the Speed Drill step once one has been recorded', () => {
    const steps = deriveOnboardingSteps([session('speedDrill')])
    expect(steps.find(s => s.id === 'speed-drill')?.done).toBe(true)
    expect(steps.find(s => s.id === 'flashcards')?.done).toBe(false)
  })

  it('ticks the Flashcards step from the persisted mode name', () => {
    // The recorded mode is `deviationFlashCards`; the screen is `deviationTraining`.
    const steps = deriveOnboardingSteps([session('deviationFlashCards')])
    expect(steps.find(s => s.id === 'flashcards')?.done).toBe(true)
  })

  it('counts every mode towards the habit step, and reports progress', () => {
    const steps = deriveOnboardingSteps(sessions('speedDrill', 2))
    const habit = steps.find(s => s.id === 'habit')!
    expect(habit.done).toBe(false)
    expect(habit.progress).toEqual({ current: 2, target: HABIT_SESSIONS })
  })

  it('completes the habit step at the target and does not overcount', () => {
    const steps = deriveOnboardingSteps(sessions('speedDrill', HABIT_SESSIONS + 3))
    const habit = steps.find(s => s.id === 'habit')!
    expect(habit.done).toBe(true)
    expect(habit.progress?.current).toBe(HABIT_SESSIONS)
  })

  it('is complete once all three are satisfied', () => {
    const all = [
      ...sessions('speedDrill', HABIT_SESSIONS - 1),
      session('deviationFlashCards'),
    ]
    expect(isOnboardingComplete(deriveOnboardingSteps(all))).toBe(true)
  })

  it('only ever sends a new user into free modes', () => {
    // Onboarding must not dead-end at the paywall.
    for (const step of deriveOnboardingSteps([])) {
      expect(isProMode(step.mode), `step "${step.id}" points at a Pro mode`).toBe(false)
    }
  })
})

describe('onboarding dismissal flag', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to not seen', () => {
    expect(hasSeenOnboarding()).toBe(false)
  })

  it('round-trips through storage', () => {
    setOnboardingSeen(true)
    expect(hasSeenOnboarding()).toBe(true)
    setOnboardingSeen(false)
    expect(hasSeenOnboarding()).toBe(false)
  })
})
