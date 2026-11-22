import { dayKey, parseDayKey, shiftDayKey, weekStartKey } from './date-utils'

/**
 * XP for keeping the week the learner planned, and for keeping it up.
 *
 * The plan asks once how many days a week there are to train, and until now
 * nothing came of keeping that promise except a green line. A week kept pays
 * a small award; weeks kept in a row pay a larger one at four milestones.
 *
 * Three rules, the same three every award here follows:
 *
 *  - **Paid for what the app can measure.** A week is kept when the recorded
 *    sessions fall on at least as many different local days of that
 *    Monday-to-Sunday week as the learner planned. Nothing is self-reported.
 *  - **Paid once.** What was paid is a set of keys (`week:<monday>`,
 *    `weekstreak:<startMonday>:<n>`) that only ever grows. It is kept in
 *    `localStorage` and travels in `profiles.settings.claimed_rewards`, merged
 *    as a union — exactly as the paid curriculum stages do, and for the reason
 *    written down there: a sign-out wipes the device, the sessions come back
 *    from the cloud, and without the set every week would be paid again.
 *  - **No way back into the past.** Only the week in progress and the week
 *    that just ended are ever looked at, against the plan as it stands at
 *    that moment. Lowering the planned days does not reach further back than
 *    that, and a streak is counted from the paid weeks, not recomputed from
 *    history against whatever the plan says today. "This week" is whatever
 *    the device's clock says, so the clock is not trusted on its own: a week
 *    that lies before one already paid is never paid (see
 *    {@link latestPaidWeek}).
 */

const CLAIMED_KEY = 'bjt_claimed_rewards'

/** What a kept week pays. */
export const WEEK_GOAL_XP = 60

/** Weeks kept in a row, and what reaching each pays — once per streak. */
export const WEEK_STREAK_XP: Readonly<Record<number, number>> = { 2: 50, 4: 100, 8: 200, 12: 400 }

/** The milestones in ascending order. */
export const WEEK_STREAK_MILESTONES: readonly number[] = Object.keys(WEEK_STREAK_XP).map(Number).sort((a, b) => a - b)

const WEEK_RE = /^week:(\d{4}-\d{2}-\d{2})$/
const STREAK_RE = /^weekstreak:(\d{4}-\d{2}-\d{2}):(\d{1,2})$/

/** The key under which a kept week is recorded as paid. */
export function weekKey(monday: string): string {
  return `week:${monday}`
}

/** The key under which a streak milestone is recorded as paid. */
export function streakKey(startMonday: string, weeks: number): string {
  return `weekstreak:${startMonday}:${weeks}`
}

/** Whether a value is a reward key this module wrote. Anything else is dropped on read. */
export function isRewardKey(v: unknown): v is string {
  if (typeof v !== 'string') return false
  if (WEEK_RE.test(v)) return true
  const m = STREAK_RE.exec(v)
  return m !== null && Number(m[2]) in WEEK_STREAK_XP
}

/**
 * Two sets of paid rewards as one. A union: a reward paid on either side is
 * paid, and the set never shrinks.
 */
export function mergeClaimedRewards(a: readonly unknown[], b: readonly unknown[]): string[] {
  return Array.from(new Set([...a, ...b].filter(isRewardKey))).sort()
}

/** The rewards already paid on this device. */
export function getClaimedRewards(): string[] {
  try {
    const raw = localStorage.getItem(CLAIMED_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? mergeClaimedRewards(parsed, []) : []
  } catch {
    return []
  }
}

/**
 * Replace the paid set — used by the sign-in merge.
 *
 * @param keys - The full set of rewards considered paid
 */
export function setClaimedRewards(keys: readonly string[]): void {
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify(mergeClaimedRewards(keys, [])))
  } catch {
    /* storage unavailable — the worst case is the award repeating next session */
  }
}

/** Record a reward as paid. Idempotent. */
export function markRewardClaimed(key: string): void {
  setClaimedRewards([...getClaimedRewards(), key])
}

/**
 * Whether the sessions keep a week: at least `daysPerWeek` different local
 * days with a session, Monday to Sunday.
 *
 * @param sessions - Recorded sessions
 * @param daysPerWeek - Training days planned for a week
 * @param monday - Day key of the week's Monday
 */
export function weekGoalMet(
  sessions: readonly { timestamp: string }[],
  daysPerWeek: number,
  monday: string,
): boolean {
  const sunday = shiftDayKey(monday, 6)
  const days = new Set<string>()
  for (const s of sessions) {
    const key = dayKey(s.timestamp)
    if (key >= monday && key <= sunday) days.add(key)
  }
  return days.size >= Math.max(1, daysPerWeek)
}

/** A run of paid weeks. */
export interface WeekStreak {
  /** Monday of the first week of the run, or null when there is none. */
  start: string | null
  /** How many weeks in a row. */
  weeks: number
}

/**
 * The run of paid weeks that ends with the given week.
 *
 * @param claimed - The paid set
 * @param lastMonday - Monday of the week the run has to end with
 */
export function streakEndingAt(claimed: ReadonlySet<string>, lastMonday: string): WeekStreak {
  if (!claimed.has(weekKey(lastMonday))) return { start: null, weeks: 0 }
  let start = lastMonday
  let weeks = 1
  while (claimed.has(weekKey(shiftDayKey(start, -7)))) {
    start = shiftDayKey(start, -7)
    weeks++
  }
  return { start, weeks }
}

/**
 * The streak to show today.
 *
 * A week in progress does not break a streak: until Sunday is over the run
 * that ended last week still stands, and it grows the moment this week is
 * kept. `currentWeekMet` is passed in rather than read from the paid set so
 * the number is right in the same render that shows the week as kept — the
 * payment itself lands an effect later.
 *
 * @param claimed - The paid rewards
 * @param today - Today's day key
 * @param currentWeekMet - Whether this week's goal is met right now
 */
export function currentWeekStreak(claimed: readonly string[], today: string, currentWeekMet: boolean): number {
  const set = new Set(claimed)
  const thisMonday = weekStartKey(parseDayKey(today))
  if (currentWeekMet) set.add(weekKey(thisMonday))
  if (set.has(weekKey(thisMonday))) return streakEndingAt(set, thisMonday).weeks
  return streakEndingAt(set, shiftDayKey(thisMonday, -7)).weeks
}

/**
 * Monday of the newest week that has been paid, or null when none has.
 *
 * The floor under {@link pendingWeeklyAwards}. Which two weeks are judged
 * follows the device's clock; set back a year, "last week" and "this week"
 * are two weeks of last year, and every week once kept but never paid (kept
 * under a smaller plan, say) became payable one clock change at a time. Time
 * only runs one way for a payment: nothing before the newest paid week is
 * paid any more.
 *
 * @param claimed - The paid rewards
 */
export function latestPaidWeek(claimed: readonly string[]): string | null {
  let latest: string | null = null
  for (const key of claimed) {
    const monday = WEEK_RE.exec(key)?.[1]
    if (monday && (latest === null || monday > latest)) latest = monday
  }
  return latest
}

/** One reward that just became payable. */
export interface WeeklyAward {
  /** The key to record once it is paid. */
  key: string
  kind: 'week' | 'streak'
  xp: number
  /** Monday of the kept week, or of the streak's first week. */
  monday: string
  /** For a streak milestone: how many weeks it marks. */
  weeks?: number
}

/**
 * Rewards that are earned and not yet paid, in the order to pay them.
 *
 * Pure: it reports what is owed and changes nothing. The caller pays and then
 * calls {@link markRewardClaimed}, as for stages.
 *
 * Only two weeks are ever judged — last week and this one — and both against
 * `daysPerWeek` as it is now. Neither is paid if it lies before a week that
 * has been paid already: the clock that says which week it is can be set back. Streak milestones are read off the paid weeks
 * (including the ones this call is about to pay), so a week that was not kept
 * ends the run and the next kept week starts a new one with its own keys.
 *
 * @param input.sessions - Recorded sessions
 * @param input.daysPerWeek - Training days planned for a week, as of now
 * @param input.today - Today's day key
 * @param input.claimed - The paid rewards
 */
export function pendingWeeklyAwards(input: {
  sessions: readonly { timestamp: string }[]
  daysPerWeek: number
  today: string
  claimed: readonly string[]
}): WeeklyAward[] {
  const { sessions, daysPerWeek, today } = input
  const paid = new Set(input.claimed.filter(isRewardKey))
  const thisMonday = weekStartKey(parseDayKey(today))
  const awards: WeeklyAward[] = []
  // Read before anything is added below: last week being paid in this call
  // must not shut out… nothing, as it happens (this week is later), but the
  // floor is what was paid before this call, not during it.
  const floor = latestPaidWeek(input.claimed)

  for (const monday of [shiftDayKey(thisMonday, -7), thisMonday]) {
    if (floor !== null && monday < floor) continue
    if (!paid.has(weekKey(monday)) && weekGoalMet(sessions, daysPerWeek, monday)) {
      awards.push({ key: weekKey(monday), kind: 'week', xp: WEEK_GOAL_XP, monday })
      paid.add(weekKey(monday))
    }
    const streak = streakEndingAt(paid, monday)
    if (!streak.start) continue
    // The Mondays of this run. A milestone already paid under any of them is
    // paid: two devices that each saw part of the run (and so a different
    // first week) must not both collect it once their sets are merged.
    const run = new Set(Array.from({ length: streak.weeks }, (_, i) => shiftDayKey(streak.start!, i * 7)))
    for (const n of WEEK_STREAK_MILESTONES) {
      if (streak.weeks < n) break
      const already = [...paid].some(k => {
        const m = STREAK_RE.exec(k)
        return m !== null && Number(m[2]) === n && run.has(m[1])
      })
      if (already) continue
      const key = streakKey(streak.start, n)
      awards.push({ key, kind: 'streak', xp: WEEK_STREAK_XP[n], monday: streak.start, weeks: n })
      paid.add(key)
    }
  }
  return awards
}
