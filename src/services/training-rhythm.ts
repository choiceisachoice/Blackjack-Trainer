import type { TrainingSessionResult } from './stats-types'
import type { StageId, StageProgress } from './curriculum'
import type { Translate } from '../i18n/translate'

/**
 * How long it has been since the learner last trained, and what to say about it.
 *
 * The plan had no sense of time: come back after three weeks and it said exactly
 * what it said yesterday — same stage, same numbers, no acknowledgement. That is
 * the difference between a training plan and a to-do list. A plan notices.
 *
 * Everything here is pure and takes `now` as an argument, so the thresholds can
 * be tested without touching the clock.
 */

/** Below this, training is simply ongoing and nothing needs saying. */
export const CURRENT_DAYS = 3
/** From here the gap is worth naming, but it is not a problem yet. */
export const RUSTY_DAYS = 14

export type Rhythm =
  /** Never trained. Not a gap — there is nothing to come back from. */
  | { kind: 'new' }
  | { kind: 'current'; days: number }
  /** Away long enough to notice, short enough that nothing has faded. */
  | { kind: 'returning'; days: number }
  /**
   * Away long enough that speed will have slipped. `refresh` is a stage that
   * was already cleared and is worth re-running before pressing on — null when
   * nothing has been cleared yet, in which case there is nothing to refresh.
   */
  | { kind: 'rusty'; days: number; refresh: StageId | null }

/** Timestamp of the most recent session, or null if there are none. */
export function lastSessionAt(sessions: readonly TrainingSessionResult[]): string | null {
  let latest: string | null = null
  for (const s of sessions) {
    if (latest === null || s.timestamp > latest) latest = s.timestamp
  }
  return latest
}

/**
 * Whole days between the last session and now.
 *
 * Floored, so "trained this morning" is 0 rather than a fraction, and a clock
 * that is slightly behind the stored timestamp cannot produce a negative gap.
 */
export function daysSinceLastSession(
  sessions: readonly TrainingSessionResult[],
  now: Date,
): number | null {
  const last = lastSessionAt(sessions)
  if (last === null) return null
  const ms = now.getTime() - new Date(last).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/**
 * The most advanced stage that is already done — the one worth warming up on.
 *
 * Deliberately the *last* cleared rather than the first: skill fades from the
 * top down, and the newest thing learned is the least practised.
 */
function lastCleared(progress: readonly StageProgress[]): StageId | null {
  let found: StageId | null = null
  for (const p of progress) {
    if (p.done && p.stage.drill) found = p.stage.id
  }
  return found
}

/** Classify the gap since the last session. */
export function deriveRhythm(
  sessions: readonly TrainingSessionResult[],
  progress: readonly StageProgress[],
  now: Date,
): Rhythm {
  const days = daysSinceLastSession(sessions, now)
  if (days === null) return { kind: 'new' }
  if (days < CURRENT_DAYS) return { kind: 'current', days }
  if (days < RUSTY_DAYS) return { kind: 'returning', days }
  return { kind: 'rusty', days, refresh: lastCleared(progress) }
}

/**
 * How the gap is described to the learner.
 *
 * Written to state a fact, never to scold. "You haven't trained in 21 days" is
 * a reprimand; "your count will have slowed" is information they can act on —
 * and it is true of any timed recall skill without pretending to a precise
 * forgetting curve we have not measured.
 */
export function rhythmMessage(rhythm: Rhythm, t: Translate): string | null {
  switch (rhythm.kind) {
    case 'new':
    case 'current':
      return null
    case 'returning':
      return t('rhythm.returning', { days: rhythm.days })
    case 'rusty':
      return rhythm.refresh
        ? t('rhythm.rustyWithRefresh', { days: rhythm.days })
        : t('rhythm.rustyPlain', { days: rhythm.days })
  }
}
