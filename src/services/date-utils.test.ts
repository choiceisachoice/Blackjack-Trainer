import { describe, it, expect } from 'vitest'
import {
  dayKey,
  todayKey,
  parseDayKey,
  shiftDayKey,
  dayKeyOffset,
  daysBetweenKeys,
  weekStartKey,
} from './date-utils'

describe('date-utils — local day bucketing', () => {
  it('formats a Date as a local YYYY-MM-DD key', () => {
    // Local constructor → local key, regardless of the machine timezone.
    expect(dayKey(new Date(2026, 6, 10, 9, 30))).toBe('2026-07-10')
    expect(dayKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })

  it('zero-pads month and day', () => {
    expect(dayKey(new Date(2026, 2, 3, 12))).toBe('2026-03-03')
  })

  it('round-trips through parseDayKey on the local calendar', () => {
    for (const key of ['2026-07-10', '2026-01-01', '2026-12-31', '2024-02-29']) {
      expect(dayKey(parseDayKey(key))).toBe(key)
    }
  })

  it('parses at local noon so DST cannot shift the day', () => {
    expect(parseDayKey('2026-03-29').getHours()).toBe(12)
  })

  it('shifts day keys forward and backward across month/year borders', () => {
    expect(shiftDayKey('2026-07-10', 1)).toBe('2026-07-11')
    expect(shiftDayKey('2026-07-31', 1)).toBe('2026-08-01')
    expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDayKey('2024-03-01', -1)).toBe('2024-02-29') // leap year
  })

  it('measures whole days between keys (order-sensitive)', () => {
    expect(daysBetweenKeys('2026-07-10', '2026-07-11')).toBe(1)
    expect(daysBetweenKeys('2026-07-11', '2026-07-10')).toBe(-1)
    expect(daysBetweenKeys('2026-07-10', '2026-07-10')).toBe(0)
    expect(daysBetweenKeys('2026-02-27', '2026-03-01')).toBe(2)
  })

  it('dayKeyOffset and todayKey agree with shiftDayKey', () => {
    expect(dayKeyOffset(0)).toBe(todayKey())
    expect(dayKeyOffset(-1)).toBe(shiftDayKey(todayKey(), -1))
    expect(dayKeyOffset(7)).toBe(shiftDayKey(todayKey(), 7))
  })

  it('weekStartKey returns the local Monday for every weekday', () => {
    // Mon 2026-07-06 … Sun 2026-07-12 all belong to the week starting 2026-07-06.
    const monday = '2026-07-06'
    for (let d = 0; d < 7; d++) {
      const day = new Date(2026, 6, 6 + d, 15)
      expect(weekStartKey(day)).toBe(monday)
    }
    // The next day (Mon 2026-07-13) starts a new week.
    expect(weekStartKey(new Date(2026, 6, 13, 1))).toBe('2026-07-13')
  })

  it('weekStartKey treats Sunday as the end of the Monday-based week', () => {
    // Sunday 2026-07-12 → previous Monday, not the following one.
    expect(weekStartKey(new Date(2026, 6, 12, 23))).toBe('2026-07-06')
  })
})
