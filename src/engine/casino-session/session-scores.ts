import type { CasinoSessionResult } from './types'

/**
 * A session's scores as a player should read them: a category the session
 * gave nothing to grade is `null`, not 100 %, and a session too short to
 * mean anything gets no letter.
 *
 * The engine's flat accuracy fields read 100 for an empty category (see
 * `CasinoSessionResult`), which is how the summary came to show "Counting
 * 100.0 % (RC: 0/0)" and a red "F" after two hands. Those fields stay as they
 * are for the records already stored; this is the view the screen reads.
 */

/**
 * Fewest hands a session must hold before it gets a letter grade.
 *
 * Ten: the free trial's length, and about a dozen graded decisions at the
 * least (more at a counting table, where every bet is graded too). Below it a
 * single decision moves the score by a grade or more, and a letter would
 * claim a verdict the sample cannot carry. The category counts are shown at
 * any length; only the letter and the overall score wait.
 */
export const MIN_GRADED_HANDS = 10

/** A letter grade and the colour it is drawn in. */
export interface Grade {
  letter: string
  color: string
}

/** The scores of one session, 0–100, or null where there was nothing to grade. */
export interface SessionScores {
  /** Bets against the spread; null in basic play (not part of the game) or with no bet. */
  bet: number | null
  /** Play decisions against the chart (index plays included); null without a decision. */
  play: number | null
  /** Count checks, running and true count each half; null in basic play or with none asked. */
  count: number | null
  /** Deviation spots played right; null in basic play or with none met. */
  deviation: number | null
  /** Insurance answered right; null when it was never offered. */
  insurance: number | null
  /** The weighted overall score; null when none of its parts had data. */
  overall: number | null
  /** The letter, or null below {@link MIN_GRADED_HANDS} hands or without an overall score. */
  grade: Grade | null
  /** Hands played. */
  hands: number
}

/**
 * The letter for an overall score — the one table both the engine's stored
 * grade and the summary use.
 *
 * @param score - Overall score, 0–100
 */
export function gradeForScore(score: number): Grade {
  if (score >= 95) return { letter: 'A+', color: '#22c55e' }
  if (score >= 90) return { letter: 'A', color: '#22c55e' }
  if (score >= 85) return { letter: 'B+', color: '#84cc16' }
  if (score >= 80) return { letter: 'B', color: '#eab308' }
  if (score >= 70) return { letter: 'C', color: '#f97316' }
  if (score >= 60) return { letter: 'D', color: '#ef4444' }
  return { letter: 'F', color: '#dc2626' }
}

const share = (correct: number, total: number): number | null => (total > 0 ? (correct / total) * 100 : null)

/**
 * Reads a session result into scores with "no data" said as null.
 *
 * The overall score is the engine's own (the same weights, renormalised over
 * the parts that have data); it is null only when no part had any.
 *
 * @param result - The session result from the engine
 */
export function sessionScores(result: CasinoSessionResult): SessionScores {
  const basic = result.config.playStyle === 'basic'
  const bet = basic ? null : share(result.correctBetDecisions, result.totalBetDecisions)
  const play = share(result.correctPlayDecisions, result.totalPlayDecisions)
  const count = basic ? null : share(result.correctRCChecks + result.correctTCChecks, result.totalCountChecks * 2)
  const deviation = basic ? null : share(result.correctDeviations, result.totalDeviationSituations)
  const insurance = share(result.correctInsuranceDecisions, result.totalInsuranceOffers)
  const overall = [bet, play, count, deviation].some(v => v !== null) ? result.overallScore : null
  const hands = result.hands.length
  return {
    bet,
    play,
    count,
    deviation,
    insurance,
    overall,
    // The engine's own letter (it is `gradeForScore` of the same score), shown only from the minimum on.
    grade: overall !== null && hands >= MIN_GRADED_HANDS ? { letter: result.grade, color: result.gradeColor } : null,
    hands,
  }
}
