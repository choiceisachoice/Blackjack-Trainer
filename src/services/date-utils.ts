/**
 * Day and week bucketing, in the user's **local** timezone.
 *
 * Session timestamps are stored as UTC ISO strings — that is correct for
 * storage. But "today", "this week", "day streak" and the practice heatmap are
 * *user-facing* calendar concepts: a player in Sydney means their own Tuesday,
 * not UTC's. Bucketing on UTC would roll their day over mid-morning and reset
 * a streak they are in the middle of.
 *
 * Everything that buckets by day or week must go through these helpers, so the
 * app can never again filter sessions on one calendar and credit progress on
 * another. Day keys are `YYYY-MM-DD` and sort lexicographically.
 */

const MS_PER_DAY = 86_400_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The local calendar day of a Date / ISO string / epoch ms, as `YYYY-MM-DD`. */
export function dayKey(value: Date | string | number = new Date()): string {
  const d = value instanceof Date ? value : new Date(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today's local day key. */
export function todayKey(): string {
  return dayKey()
}

/**
 * Parse a day key back into a local Date anchored at **noon**. Noon (rather
 * than midnight) keeps day arithmetic correct across DST transitions, where a
 * local midnight may not exist or may occur twice.
 */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

/** Shift a day key by `days` (may be negative). */
export function shiftDayKey(key: string, days: number): string {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + days)
  return dayKey(d)
}

/** Today's local day key, offset by `days` (negative = in the past). */
export function dayKeyOffset(days: number): string {
  return shiftDayKey(todayKey(), days)
}

/** Whole days from day key `from` to day key `to` (positive if `to` is later). */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / MS_PER_DAY)
}

/**
 * The local **Monday** of the week containing `value`, as a day key.
 * ISO weeks: Monday starts the week, Sunday ends it.
 */
export function weekStartKey(value: Date | string | number = new Date()): string {
  const d = value instanceof Date ? new Date(value) : new Date(value)
  const weekday = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() + (weekday === 0 ? -6 : 1 - weekday))
  return dayKey(d)
}
