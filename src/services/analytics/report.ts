import { supabase } from '../supabase/client'

/**
 * The admin report: what `analytics_report` returns, and the ranges the
 * dashboard asks for.
 *
 * The numbers are computed in the database, in one call, for one range; this
 * module only names the shape and turns a range choice into two instants.
 * The definitions (what counts as a visitor, a session, a paying customer)
 * are documented on the SQL function and nowhere else.
 */

export interface DailyRow {
  /** `YYYY-MM-DD` in the zone the report was asked for. */
  day: string
  visitors: number
  sessions: number
  page_views: number
  registrations: number
}

export interface TopPage {
  pathname: string
  views: number
  visitors: number
}

export interface ReferrerRow {
  /** null is a direct visit. */
  host: string | null
  sessions: number
}

export interface DeviceRow {
  device: 'mobile' | 'tablet' | 'desktop' | null
  sessions: number
}

export interface AnalyticsReport {
  visitors: number
  page_views: number
  sessions: number
  /** null when the range holds no session. */
  avg_session_seconds: number | null
  registrations: number
  /** Counted now, not per range — see the SQL. */
  paying_customers: number
  daily: DailyRow[]
  top_pages: TopPage[]
  referrers: ReferrerRow[]
  devices: DeviceRow[]
}

/** The ranges offered as one click. */
export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30'

/** Either a preset or two calendar days, inclusive, as `YYYY-MM-DD`. */
export type RangeChoice =
  | { kind: 'preset'; preset: RangePreset }
  | { kind: 'custom'; from: string; to: string }

export const RANGE_PRESETS: readonly RangePreset[] = ['today', 'yesterday', 'last7', 'last30']

/** Local midnight of the day `offset` days from `now`. */
function localMidnight(now: Date, offset: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
  return d
}

/** Parse `YYYY-MM-DD` as local midnight, or null when it is not a date. */
function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The two instants a range means, in the admin's own clock.
 *
 * Half-open: `[from, to)`. "Today" is local midnight to now-plus-a-day's
 * midnight, so a view at 23:59 is today. The custom range is inclusive of
 * both days, so `to` is the midnight after the last day.
 *
 * @returns null for a custom range that is not two ordered dates
 */
export function rangeBounds(choice: RangeChoice, now: Date = new Date()): { from: Date; to: Date } | null {
  if (choice.kind === 'preset') {
    switch (choice.preset) {
      case 'today': return { from: localMidnight(now, 0), to: localMidnight(now, 1) }
      case 'yesterday': return { from: localMidnight(now, -1), to: localMidnight(now, 0) }
      case 'last7': return { from: localMidnight(now, -6), to: localMidnight(now, 1) }
      case 'last30': return { from: localMidnight(now, -29), to: localMidnight(now, 1) }
    }
  }
  const from = parseDay(choice.from)
  const last = parseDay(choice.to)
  if (!from || !last || last < from) return null
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  return { from, to }
}

/** The browser's IANA zone, for bucketing days the way the admin sees them. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Fetch the report for a range. Throws on any failure, including "not an
 * admin" — the page shows one sentence for all of them.
 */
export async function fetchAnalyticsReport(bounds: { from: Date; to: Date }): Promise<AnalyticsReport> {
  if (!supabase) throw new Error('Analytics are unavailable in this environment.')
  const { data, error } = await supabase.rpc('analytics_report', {
    p_from: bounds.from.toISOString(),
    p_to: bounds.to.toISOString(),
    p_tz: browserTimeZone(),
  })
  if (error) throw error
  return data as AnalyticsReport
}

/**
 * Seconds as `2m 18s`, `45s`, `1h 03m`. Null becomes an em dash: no session
 * is not zero seconds.
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}
