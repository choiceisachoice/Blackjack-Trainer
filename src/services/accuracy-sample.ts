import type { TrainingMode } from './stats-types'

/**
 * How many answers a drill session needs before its accuracy says anything.
 *
 * A session is saved from three answers up, so that walking away early still
 * counts as practice. But three answers are not a result: three correct
 * flashcards read as 100%, and on 13 Nov 2026 that was enough to unlock six
 * accuracy awards (475 XP, level 4) for an account that had not seen a single
 * deviation, and three such sessions closed a curriculum stage. The casino
 * side has had minimum samples from the start; the drills never grew one.
 *
 * The Speed Drill is the exception, and stays at the save minimum: one
 * "answer" there is a whole run of 10 to 52 cards counted and totalled, so
 * three of them is already more work than ten flashcards.
 *
 * Practice still counts below the bar — time, questions, the weekly pace. It
 * is only *accuracy as an achievement* that needs the sample.
 */
const MIN_ANSWERS: Partial<Record<TrainingMode, number>> = {
  speedDrill: 3,
}
const DEFAULT_MIN_ANSWERS = 10

/**
 * The sample a mode needs before its accuracy counts as demonstrated.
 *
 * @param mode - The training mode
 */
export function minAnswersFor(mode: TrainingMode): number {
  return MIN_ANSWERS[mode] ?? DEFAULT_MIN_ANSWERS
}

/**
 * Whether a session is large enough for its accuracy to count — towards a
 * best, an award or a curriculum stage.
 *
 * Casino sessions always pass here: their accuracy awards are guarded by
 * their own minimums (count checks, deviation situations, graded hands) in
 * the achievement engine, on figures this function does not see.
 *
 * @param session - Anything with a mode and a number of answers
 */
export function provesAccuracy(session: { mode: TrainingMode; totalQuestions: number }): boolean {
  if (session.mode === 'casinoSession') return true
  return session.totalQuestions >= minAnswersFor(session.mode)
}
