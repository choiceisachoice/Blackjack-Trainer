import type { Achievement, AchievementRequirementType } from '../../services/achievements/achievement-types'

/**
 * Requirements that are done or not done, with nothing in between.
 *
 * The engine answers 0 for these until the moment it answers 100 — a perfect
 * session, a blackjack at the table, a session after midnight. That zero is
 * not a measurement, and drawn as an empty ring it would read as "you have
 * made no progress" on an award nobody can make progress on.
 */
const ALL_OR_NOTHING: ReadonlySet<AchievementRequirementType> = new Set<AchievementRequirementType>([
  'perfect',
  'speed',
  'speed_drill_perfect',
  'unique_systems',
  'casino_blackjack',
  'casino_split_aces',
  'tracker_first_win',
  'tracker_session_hours',
  'tracker_single_session_profit',
  'tracker_comeback',
  'night_session',
])

/**
 * How far along a locked award is, for the ring on its medal — or null when
 * there is nothing to measure.
 *
 * Null for the all-or-nothing requirements above and for anything that asks
 * for one of something ("your first session"): one step from 0 to 100 is not
 * a distance. Everything else returns the engine's own percentage, clamped.
 *
 * @param achievement - The award
 * @param percent - The engine's progress for it (0–100)
 */
export function medalProgress(achievement: Achievement, percent: number): number | null {
  const req = achievement.requirement
  if (ALL_OR_NOTHING.has(req.type)) return null
  if (req.value <= 1) return null
  if (!Number.isFinite(percent)) return null
  return Math.max(0, Math.min(100, percent))
}
