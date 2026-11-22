import { describe, it, expect, beforeEach } from 'vitest'
import {
  WEEK_GOAL_XP, WEEK_STREAK_XP, WEEK_STREAK_MILESTONES,
  weekKey, streakKey, isRewardKey, mergeClaimedRewards,
  getClaimedRewards, setClaimedRewards, markRewardClaimed,
  weekGoalMet, streakEndingAt, currentWeekStreak, pendingWeeklyAwards, latestPaidWeek,
  type WeeklyAward,
} from './weekly-rewards'
import { shiftDayKey, weekStartKey, parseDayKey } from './date-utils'

/** Monday 16 Nov 2026. Every week below is counted from it. */
const MON = '2026-11-16'
const week = (n: number) => shiftDayKey(MON, n * 7)

/** A session at a local time of a day key — local, because weeks are. */
function at(day: string, hour = 12, minute = 0): { timestamp: string } {
  const d = parseDayKey(day)
  d.setHours(hour, minute, 0, 0)
  return { timestamp: d.toISOString() }
}

/** Sessions on the first `days` days of the week starting at `monday`. */
const trained = (monday: string, days: number) =>
  Array.from({ length: days }, (_, i) => at(shiftDayKey(monday, i)))

/** Pay everything that is owed, the way the effect does, and return it. */
function settle(input: Omit<Parameters<typeof pendingWeeklyAwards>[0], 'claimed'>, claimed: string[]): WeeklyAward[] {
  const awards = pendingWeeklyAwards({ ...input, claimed })
  claimed.push(...awards.map(a => a.key))
  return awards
}

beforeEach(() => localStorage.clear())

describe('the amounts', () => {
  it('a kept week pays 60, the streak 50 / 100 / 200 / 400 at 2 / 4 / 8 / 12 weeks', () => {
    expect(WEEK_GOAL_XP).toBe(60)
    expect(WEEK_STREAK_MILESTONES).toEqual([2, 4, 8, 12])
    expect(WEEK_STREAK_MILESTONES.map(n => WEEK_STREAK_XP[n])).toEqual([50, 100, 200, 400])
  })
})

describe('weekGoalMet', () => {
  it('is met by as many different days as were planned, and not by fewer', () => {
    expect(weekGoalMet(trained(MON, 3), 3, MON)).toBe(true)
    expect(weekGoalMet(trained(MON, 2), 3, MON)).toBe(false)
    expect(weekGoalMet(trained(MON, 5), 3, MON)).toBe(true)
  })

  it('counts days, not sessions — five sessions on one day are one day', () => {
    const oneDay = Array.from({ length: 5 }, (_, i) => at(MON, 9 + i))
    expect(weekGoalMet(oneDay, 2, MON)).toBe(false)
    expect(weekGoalMet(oneDay, 1, MON)).toBe(true)
  })

  it('runs Monday to Sunday in local time', () => {
    const sunday = shiftDayKey(MON, 6)
    // Late on Sunday still belongs to the week; half an hour later does not.
    expect(weekGoalMet([at(MON, 0, 5), at(sunday, 23, 30)], 2, MON)).toBe(true)
    expect(weekGoalMet([at(MON, 0, 5), at(week(1), 0, 30)], 2, MON)).toBe(false)
    // And the Sunday before is last week's.
    expect(weekGoalMet([at(shiftDayKey(MON, -1), 23, 30), at(MON)], 2, MON)).toBe(false)
    expect(weekStartKey(parseDayKey(sunday))).toBe(MON)
  })

  it('an empty week is never met, whatever the plan says', () => {
    expect(weekGoalMet([], 0, MON)).toBe(false)
    expect(weekGoalMet([], 1, MON)).toBe(false)
  })
})

describe('pendingWeeklyAwards — the kept week', () => {
  const today = shiftDayKey(MON, 3) // Thursday

  it('pays 60 XP once the planned days are in', () => {
    const awards = pendingWeeklyAwards({ sessions: trained(MON, 3), daysPerWeek: 3, today, claimed: [] })
    expect(awards).toEqual([{ key: weekKey(MON), kind: 'week', xp: 60, monday: MON }])
  })

  it('pays nothing for a week that is short of the plan', () => {
    expect(pendingWeeklyAwards({ sessions: trained(MON, 2), daysPerWeek: 3, today, claimed: [] })).toEqual([])
  })

  it('pays a week once, however often it is asked', () => {
    const claimed: string[] = []
    const input = { sessions: trained(MON, 3), daysPerWeek: 3, today }
    expect(settle(input, claimed)).toHaveLength(1)
    expect(settle(input, claimed)).toEqual([])
    // More sessions in the same week change nothing.
    expect(settle({ ...input, sessions: trained(MON, 6) }, claimed)).toEqual([])
  })

  it('still pays last week on Monday morning, when the last session was on Sunday', () => {
    const awards = pendingWeeklyAwards({ sessions: trained(week(-1), 3), daysPerWeek: 3, today: MON, claimed: [] })
    expect(awards.map(a => a.key)).toEqual([weekKey(week(-1))])
  })

  it('never looks further back than the week that just ended', () => {
    const sessions = [...trained(week(-3), 7), ...trained(week(-2), 7)]
    expect(pendingWeeklyAwards({ sessions, daysPerWeek: 1, today, claimed: [] })).toEqual([])
  })
})

/**
 * "This week" is whatever the device says it is. Set back, the clock used to
 * make "last week" a week long past — and every week once kept but never paid
 * became payable, one clock change at a time.
 */
describe('pendingWeeklyAwards — a clock that is set back', () => {
  it('knows the newest paid week', () => {
    expect(latestPaidWeek([])).toBeNull()
    expect(latestPaidWeek([weekKey(week(-4)), weekKey(week(-1)), streakKey(week(-9), 2), weekKey(week(-2))])).toBe(week(-1))
    // A streak key is not a week.
    expect(latestPaidWeek([streakKey(MON, 2)])).toBeNull()
  })

  it('pays no week that lies before one already paid', () => {
    // Six weeks trained on one day each, under a plan of three days: kept by
    // nobody's count, paid never. Then the plan is lowered to one day.
    const sessions = [-6, -5, -4, -3, -2, -1, 0].flatMap(n => trained(week(n), n === 0 ? 3 : 1))
    const claimed: string[] = []
    expect(settle({ sessions, daysPerWeek: 3, today: shiftDayKey(MON, 3) }, claimed).map(a => a.key)).toEqual([weekKey(MON)])

    // The clock goes back, week by week. Nothing more is owed.
    for (const n of [-1, -2, -3, -4, -5, -6]) {
      const awards = settle({ sessions, daysPerWeek: 1, today: shiftDayKey(week(n), 3) }, claimed)
      expect(awards, `clock set to week ${n}`).toEqual([])
    }
    expect(claimed).toEqual([weekKey(MON)])
  })

  it('pays no week in a gap between two paid weeks either', () => {
    const sessions = [...trained(week(-3), 1), ...trained(week(-2), 1)]
    const claimed = [weekKey(week(-6)), weekKey(MON)]
    expect(pendingWeeklyAwards({ sessions, daysPerWeek: 1, today: shiftDayKey(week(-2), 3), claimed })).toEqual([])
  })

  it('still pays last week and this week when nothing later is paid', () => {
    const sessions = [...trained(week(-1), 3), ...trained(MON, 3)]
    const claimed = [weekKey(week(-2))]
    const keys = pendingWeeklyAwards({ sessions, daysPerWeek: 3, today: shiftDayKey(MON, 3), claimed }).filter(a => a.kind === 'week').map(a => a.key)
    expect(keys).toEqual([weekKey(week(-1)), weekKey(MON)])
  })

  it('with nothing paid yet, looks at the current and the previous week only', () => {
    const sessions = [...trained(week(-2), 7), ...trained(week(-1), 3)]
    const keys = pendingWeeklyAwards({ sessions, daysPerWeek: 3, today: shiftDayKey(MON, 3), claimed: [] }).map(a => a.key)
    expect(keys).toEqual([weekKey(week(-1))])
  })

  it('does not stop a streak milestone of the weeks being paid now', () => {
    const sessions = [...trained(week(-1), 3), ...trained(MON, 3)]
    const awards = pendingWeeklyAwards({ sessions, daysPerWeek: 3, today: shiftDayKey(MON, 3), claimed: [] })
    expect(awards.map(a => a.key)).toEqual([weekKey(week(-1)), weekKey(MON), streakKey(week(-1), 2)])
  })
})

describe('pendingWeeklyAwards — a change of plan', () => {
  const today = shiftDayKey(MON, 3)
  // Two days in each of the last five weeks, against a plan of five.
  const history = [-4, -3, -2, -1, 0].flatMap(n => trained(week(n), 2))

  it('lowering the planned days pays this week and last, and nothing older', () => {
    expect(pendingWeeklyAwards({ sessions: history, daysPerWeek: 5, today, claimed: [] })).toEqual([])
    const after = pendingWeeklyAwards({ sessions: history, daysPerWeek: 2, today, claimed: [] })
    expect(after.filter(a => a.kind === 'week').map(a => a.monday)).toEqual([week(-1), MON])
    // Two weeks, so the first milestone and no other: the three older weeks
    // were not kept against the plan in force at the time, and stay unpaid.
    expect(after.filter(a => a.kind === 'streak').map(a => a.weeks)).toEqual([2])
  })

  it('raising the planned days takes nothing back', () => {
    const claimed: string[] = []
    settle({ sessions: trained(MON, 2), daysPerWeek: 2, today }, claimed)
    expect(claimed).toEqual([weekKey(MON)])
    expect(settle({ sessions: trained(MON, 2), daysPerWeek: 7, today }, claimed)).toEqual([])
    expect(claimed).toEqual([weekKey(MON)])
    expect(currentWeekStreak(claimed, today, false)).toBe(1)
  })
})

describe('the week streak', () => {
  /** Train `days` days in each of the weeks `from`..`to`, settling every Sunday. */
  function run(from: number, to: number, claimed: string[], days = 3, plan = 3): WeeklyAward[] {
    const paid: WeeklyAward[] = []
    const sessions: { timestamp: string }[] = []
    for (let n = from; n <= to; n++) {
      sessions.push(...trained(week(n), days))
      paid.push(...settle({ sessions, daysPerWeek: plan, today: shiftDayKey(week(n), 6) }, claimed))
    }
    return paid
  }

  it('pays each milestone once: 50 at two weeks, 100 at four, 200 at eight, 400 at twelve', () => {
    const claimed: string[] = []
    const paid = run(0, 12, claimed)
    const streaks = paid.filter(a => a.kind === 'streak')
    expect(streaks.map(a => [a.weeks, a.xp])).toEqual([[2, 50], [4, 100], [8, 200], [12, 400]])
    expect(streaks.every(a => a.monday === MON)).toBe(true)
    expect(paid.filter(a => a.kind === 'week')).toHaveLength(13)
    // Thirteen weeks and four milestones — and a thirteenth week adds none.
    expect(paid.reduce((n, a) => n + a.xp, 0)).toBe(13 * 60 + 50 + 100 + 200 + 400)
  })

  it('reaches the milestone in the week that completes it, not before', () => {
    const claimed: string[] = []
    expect(run(0, 0, claimed).map(a => a.kind)).toEqual(['week'])
    expect(run(1, 1, claimed).map(a => a.kind)).toEqual(['week', 'streak'])
    expect(run(2, 2, claimed).map(a => a.kind)).toEqual(['week'])
  })

  it('a missed week ends the streak, and the next kept week starts a new one', () => {
    const claimed: string[] = []
    run(0, 2, claimed)                       // three weeks: milestone 2 paid
    expect(currentWeekStreak(claimed, shiftDayKey(week(2), 6), false)).toBe(3)
    run(3, 3, claimed, 1)                    // one day of three: not kept
    expect(claimed).not.toContain(weekKey(week(3)))
    // The week after the missed one, before it is kept: nothing stands.
    expect(currentWeekStreak(claimed, week(4), false)).toBe(0)

    const again = run(4, 5, claimed)
    const streaks = again.filter(a => a.kind === 'streak')
    // A new streak has its own first week, and earns its own first milestone.
    expect(streaks).toEqual([{ key: streakKey(week(4), 2), kind: 'streak', xp: 50, monday: week(4), weeks: 2 }])
    expect(currentWeekStreak(claimed, shiftDayKey(week(5), 6), false)).toBe(2)
  })

  it('a week in progress does not break a streak, and extends it once it is kept', () => {
    const claimed = [weekKey(week(-2)), weekKey(week(-1))]
    const wednesday = shiftDayKey(MON, 2)
    expect(currentWeekStreak(claimed, wednesday, false)).toBe(2)
    expect(currentWeekStreak(claimed, wednesday, true)).toBe(3)
    expect(currentWeekStreak([...claimed, weekKey(MON)], wednesday, false)).toBe(3)
  })

  it('counts the run that ends at a week, and none without that week', () => {
    const claimed = new Set([weekKey(week(-3)), weekKey(week(-1)), weekKey(MON)])
    expect(streakEndingAt(claimed, MON)).toEqual({ start: week(-1), weeks: 2 })
    expect(streakEndingAt(claimed, week(-2))).toEqual({ start: null, weeks: 0 })
  })

  it('does not pay a milestone twice when two devices saw different halves of a streak', () => {
    // Device A paid weeks 0 and 1 and their milestone. Device B, offline, paid
    // weeks 2 and 3 and took week 2 for the start of a streak.
    const a = [weekKey(week(0)), weekKey(week(1)), streakKey(week(0), 2)]
    const b = [weekKey(week(2)), weekKey(week(3)), streakKey(week(2), 2)]
    const merged = mergeClaimedRewards(a, b)
    const sessions = [0, 1, 2, 3].flatMap(n => trained(week(n), 3))
    const awards = pendingWeeklyAwards({ sessions, daysPerWeek: 3, today: shiftDayKey(week(3), 6), claimed: merged })
    // Four weeks in a row now: the four-week milestone is owed, the two-week
    // one is not owed a third time.
    expect(awards.map(x => [x.kind, x.weeks])).toEqual([['streak', 4]])
  })
})

describe('the paid set', () => {
  it('is empty on a new device and survives a round trip', () => {
    expect(getClaimedRewards()).toEqual([])
    markRewardClaimed(weekKey(MON))
    markRewardClaimed(streakKey(MON, 2))
    expect(new Set(getClaimedRewards())).toEqual(new Set([weekKey(MON), streakKey(MON, 2)]))
  })

  it('marking twice is marking once', () => {
    markRewardClaimed(weekKey(MON))
    markRewardClaimed(weekKey(MON))
    expect(getClaimedRewards()).toEqual([weekKey(MON)])
  })

  it('merges as a union and never shrinks', () => {
    const local = [weekKey(MON), weekKey(week(1))]
    const cloud = [weekKey(week(-1)), weekKey(MON), streakKey(week(-1), 2)]
    const merged = mergeClaimedRewards(local, cloud)
    expect(new Set(merged)).toEqual(new Set([...local, ...cloud]))
    expect(merged).toHaveLength(4)
    // The same either way round, and merging again changes nothing.
    expect(mergeClaimedRewards(cloud, local)).toEqual(merged)
    expect(mergeClaimedRewards(merged, local)).toEqual(merged)
    // An empty device takes nothing away from the account.
    expect(mergeClaimedRewards([], cloud)).toHaveLength(cloud.length)
  })

  it('drops anything that is not a reward key', () => {
    expect(isRewardKey(weekKey(MON))).toBe(true)
    expect(isRewardKey(streakKey(MON, 12))).toBe(true)
    expect(isRewardKey(streakKey(MON, 3))).toBe(false) // not a milestone
    expect(isRewardKey('week:yesterday')).toBe(false)
    expect(isRewardKey(42)).toBe(false)
    expect(mergeClaimedRewards(['rules', null, 7, weekKey(MON)], [{}])).toEqual([weekKey(MON)])
  })

  it('reads a broken or foreign value as nothing paid', () => {
    localStorage.setItem('bjt_claimed_rewards', '{not json')
    expect(getClaimedRewards()).toEqual([])
    localStorage.setItem('bjt_claimed_rewards', JSON.stringify({ week: MON }))
    expect(getClaimedRewards()).toEqual([])
    setClaimedRewards(['nonsense', weekKey(MON)])
    expect(getClaimedRewards()).toEqual([weekKey(MON)])
  })

  it('signing out and in again pays nothing twice', () => {
    // The device is wiped; the sessions come back, and so does the set.
    const sessions = [...trained(week(-1), 3), ...trained(MON, 3)]
    const input = { sessions, daysPerWeek: 3, today: shiftDayKey(MON, 4) }
    const claimed: string[] = []
    const first = settle(input, claimed)
    expect(first.reduce((n, a) => n + a.xp, 0)).toBe(60 + 60 + 50)
    setClaimedRewards(claimed)
    const cloud = getClaimedRewards()
    localStorage.clear()
    setClaimedRewards(mergeClaimedRewards(getClaimedRewards(), cloud))
    expect(pendingWeeklyAwards({ ...input, claimed: getClaimedRewards() })).toEqual([])
  })
})
