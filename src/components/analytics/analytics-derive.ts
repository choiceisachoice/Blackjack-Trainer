import type {
  TrainingMode,
  TrainingSessionResult,
} from '../../services/stats-types'
import { dayKey, shiftDayKey } from '../../services/date-utils'

/** Selectable time window for the dashboard. */
export type TimeRange = '7d' | '30d' | '90d' | 'all'

/** Number of days each range spans (`all` = effectively unbounded). */
export const RANGE_DAYS: Record<TimeRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: Number.POSITIVE_INFINITY,
}

/** Ordered ranges for the header toggle. */
export const RANGE_ORDER: TimeRange[] = ['7d', '30d', '90d', 'all']

/** Human label for a range chip. */
export const RANGE_LABEL: Record<TimeRange, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  all: 'All',
}

const MS_PER_DAY = 86_400_000

/** Display metadata per training mode (label + accent color for dots/bars). */
export const MODE_DISPLAY: Record<TrainingMode, { labelKey: string; color: string }> = {
  speedDrill: { labelKey: 'modes.speedDrill', color: 'var(--color-gold)' },
  deviationFlashCards: { labelKey: 'modes.deviationFlashCards', color: 'var(--color-gold-bright)' },
  betSpread: { labelKey: 'modes.betSpread', color: 'var(--color-chip-blue)' },
  deckEstimation: { labelKey: 'modes.deckEstimation', color: 'var(--color-warning)' },
  casinoSession: { labelKey: 'modes.casinoSession', color: 'var(--color-felt)' },
  // Legacy modes — retained so historical sessions still render.
  tableCounting: { labelKey: 'modes.tableCounting', color: 'var(--color-success)' },
  deviationAtTable: { labelKey: 'modes.deviationTable', color: 'var(--color-gold)' },
}

/** Format seconds into a compact human duration (e.g. "2h 5m", "40m", "< 1m"). */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return '< 1m'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

/** Split seconds into whole hours and minutes for a two-part KPI display. */
export function splitHoursMinutes(seconds: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
  }
}

/** Format an ISO timestamp as a short relative label ("Today", "Yesterday", "Mar 4"). */
export function formatWhen(iso: string, now: Date): string {
  const day = dayKey(iso)
  if (day === dayKey(now)) return 'Today'
  if (day === shiftDayKey(dayKey(now), -1)) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Inclusive lower-bound timestamp (ms) for a range, or -Infinity for `all`. */
function rangeStartMs(now: Date, range: TimeRange): number {
  const days = RANGE_DAYS[range]
  if (!Number.isFinite(days)) return Number.NEGATIVE_INFINITY
  return now.getTime() - days * MS_PER_DAY
}

/** Sessions whose timestamp falls within the given range (inclusive of now). */
export function filterByRange(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
): TrainingSessionResult[] {
  const start = rangeStartMs(now, range)
  const end = now.getTime()
  return sessions.filter(s => {
    const t = new Date(s.timestamp).getTime()
    return t >= start && t <= end
  })
}

/** Sessions in the window immediately preceding the range (for deltas). Empty for `all`. */
export function filterPreviousRange(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
): TrainingSessionResult[] {
  const days = RANGE_DAYS[range]
  if (!Number.isFinite(days)) return []
  const curStart = now.getTime() - days * MS_PER_DAY
  const prevStart = curStart - days * MS_PER_DAY
  return sessions.filter(s => {
    const t = new Date(s.timestamp).getTime()
    return t >= prevStart && t < curStart
  })
}

/** Weighted accuracy (0–1) across a set of sessions; 0 when no questions. */
export function accuracyOf(sessions: TrainingSessionResult[]): number {
  let correct = 0
  let total = 0
  for (const s of sessions) {
    correct += s.correctAnswers
    total += s.totalQuestions
  }
  return total > 0 ? correct / total : 0
}

/** Sum a numeric field over sessions. */
function sumBy(sessions: TrainingSessionResult[], f: (s: TrainingSessionResult) => number): number {
  return sessions.reduce((acc, s) => acc + f(s), 0)
}

/**
 * A single KPI tile: current value, optional delta vs. the previous equal
 * window, a formatted display, and a short daily sparkline series.
 */
export interface Kpi {
  key: string
  labelKey: string
  /** Pre-formatted primary value (may contain a unit suffix marker `~`). */
  display: string
  /** Delta vs. previous window; null when not comparable (e.g. `all`). */
  delta: number | null
  /** Pre-formatted delta label (e.g. "3.1%", "8", "3h 20m"). */
  deltaDisplay: string
  /** Sparkline values (one per active day in range, chronological). */
  spark: number[]
}

/** Chronological list of active days (YYYY-MM-DD) within a session set. */
function activeDaysAsc(sessions: TrainingSessionResult[]): string[] {
  return [...new Set(sessions.map(s => dayKey(s.timestamp)))].sort((a, b) =>
    a.localeCompare(b),
  )
}

/** Build a per-active-day series for a metric, chronological. */
function dailySeries(
  sessions: TrainingSessionResult[],
  reduce: (daySessions: TrainingSessionResult[]) => number,
): number[] {
  const byDay = new Map<string, TrainingSessionResult[]>()
  for (const s of sessions) {
    const day = dayKey(s.timestamp)
    const arr = byDay.get(day)
    if (arr) arr.push(s)
    else byDay.set(day, [s])
  }
  return activeDaysAsc(sessions).map(day => reduce(byDay.get(day) ?? []))
}

/**
 * Build the five headline KPIs for the current range: overall accuracy,
 * sessions, current streak, hands trained, and training time. Deltas compare
 * the current window to the immediately-preceding equal window.
 */
export function buildKpis(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  streak: number,
  now: Date,
): Kpi[] {
  const cur = filterByRange(sessions, range, now)
  const prev = filterPreviousRange(sessions, range, now)
  const comparable = Number.isFinite(RANGE_DAYS[range])

  const curAcc = accuracyOf(cur)
  const prevAcc = accuracyOf(prev)
  const accDelta = comparable && prev.length > 0 ? (curAcc - prevAcc) * 100 : null

  const curSessions = cur.length
  const sessionsDelta = comparable ? curSessions - prev.length : null

  const curHands = sumBy(cur, s => s.totalQuestions)
  const handsDelta = comparable ? curHands - sumBy(prev, s => s.totalQuestions) : null

  const curTime = sumBy(cur, s => s.durationSeconds)
  const timeDelta = comparable ? curTime - sumBy(prev, s => s.durationSeconds) : null

  const fmtSigned = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`
  const time = splitHoursMinutes(curTime)

  return [
    {
      key: 'accuracy',
      labelKey: 'analytics.kpi.accuracy',
      display: curSessions > 0 ? `${Math.round(curAcc * 100)}~%` : '—',
      delta: accDelta,
      deltaDisplay: accDelta === null ? '' : `${accDelta >= 0 ? '+' : '−'}${Math.abs(accDelta).toFixed(1)}%`,
      spark: dailySeries(cur, d => Math.round(accuracyOf(d) * 100)),
    },
    {
      key: 'sessions',
      labelKey: 'analytics.kpi.sessions',
      display: `${curSessions}`,
      delta: sessionsDelta,
      deltaDisplay: sessionsDelta === null ? '' : fmtSigned(sessionsDelta),
      spark: dailySeries(cur, d => d.length),
    },
    {
      key: 'streak',
      labelKey: 'analytics.kpi.streak',
      display: streak > 0 ? `${streak}~ days` : '—',
      delta: null,
      deltaDisplay: '',
      spark: dailySeries(cur, d => (d.length > 0 ? 1 : 0)),
    },
    {
      key: 'hands',
      labelKey: 'analytics.kpi.hands',
      display: curHands.toLocaleString('en-US'),
      delta: handsDelta,
      deltaDisplay: handsDelta === null ? '' : fmtSigned(handsDelta),
      spark: dailySeries(cur, d => sumBy(d, s => s.totalQuestions)),
    },
    {
      key: 'time',
      labelKey: 'analytics.kpi.time',
      display: formatTimeDisplay(time),
      delta: timeDelta,
      deltaDisplay: timeDelta === null ? '' : `${timeDelta >= 0 ? '+' : '−'}${formatDuration(Math.abs(timeDelta))}`,
      spark: dailySeries(cur, d => Math.round(sumBy(d, s => s.durationSeconds) / 60)),
    },
  ]
}

/** Format an {hours, minutes} pair for the training-time KPI display. */
function formatTimeDisplay({ hours, minutes }: { hours: number; minutes: number }): string {
  if (hours === 0 && minutes === 0) return '0~m'
  if (hours === 0) return `${minutes}~m`
  return `${hours}~h ${minutes}~m`
}

/** A point on the accuracy trend line. */
export interface TrendPoint {
  day: string
  accuracy: number
}

/**
 * Daily accuracy points for the trend chart over the selected range,
 * chronological and limited to days that had activity.
 */
export function buildTrend(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
): TrendPoint[] {
  const cur = filterByRange(sessions, range, now)
  const byDay = new Map<string, TrainingSessionResult[]>()
  for (const s of cur) {
    const day = dayKey(s.timestamp)
    const arr = byDay.get(day)
    if (arr) arr.push(s)
    else byDay.set(day, [s])
  }
  return activeDaysAsc(cur).map(day => ({
    day,
    accuracy: Math.round(accuracyOf(byDay.get(day) ?? []) * 100),
  }))
}

/** A single heatmap cell: date + normalized intensity level 0–4. */
export interface HeatCell {
  day: string
  level: number
}

/**
 * A calendar heatmap of practice intensity over the last `weeks` weeks,
 * as columns of 7 days. Intensity is bucketed 0–4 by minutes practiced that
 * day, scaled to the busiest day in the window.
 */
export function buildHeatmap(
  sessions: TrainingSessionResult[],
  now: Date,
  weeks = 12,
): { cells: HeatCell[][]; maxMinutes: number } {
  const minutesByDay = new Map<string, number>()
  for (const s of sessions) {
    const day = dayKey(s.timestamp)
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + s.durationSeconds / 60)
  }

  // Rolling grid of `weeks*7` LOCAL days ending today, chunked into 7-day
  // columns. The final cell is always today — no partial columns.
  const totalDays = weeks * 7
  const dayKeys: string[] = []
  const endKey = dayKey(now)
  for (let i = totalDays - 1; i >= 0; i--) dayKeys.push(shiftDayKey(endKey, -i))

  let maxMinutes = 0
  for (const key of dayKeys) {
    maxMinutes = Math.max(maxMinutes, minutesByDay.get(key) ?? 0)
  }

  const level = (mins: number): number => {
    if (mins <= 0 || maxMinutes <= 0) return 0
    const frac = mins / maxMinutes
    if (frac > 0.66) return 4
    if (frac > 0.33) return 3
    if (frac > 0.1) return 2
    return 1
  }

  const columns: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const key = dayKeys[w * 7 + d]
      col.push({ day: key, level: level(minutesByDay.get(key) ?? 0) })
    }
    columns.push(col)
  }
  return { cells: columns, maxMinutes: Math.round(maxMinutes) }
}

/** A mode's accuracy bar. */
export interface ModeAccuracy {
  mode: TrainingMode
  labelKey: string
  color: string
  accuracy: number
  tag: 'best' | 'focus' | null
}

/**
 * Per-mode accuracy over the range, sorted strongest-first. The top mode is
 * tagged `best` and the weakest `focus` (only when ≥2 modes have data).
 */
export function buildModeAccuracy(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
): ModeAccuracy[] {
  const cur = filterByRange(sessions, range, now)
  const byMode = new Map<TrainingMode, TrainingSessionResult[]>()
  for (const s of cur) {
    const arr = byMode.get(s.mode)
    if (arr) arr.push(s)
    else byMode.set(s.mode, [s])
  }

  const rows: ModeAccuracy[] = [...byMode.entries()]
    .map(([mode, list]) => ({
      mode,
      labelKey: MODE_DISPLAY[mode]?.labelKey ?? mode,
      color: MODE_DISPLAY[mode]?.color ?? 'var(--color-gold)',
      accuracy: accuracyOf(list),
      tag: null as ModeAccuracy['tag'],
    }))
    .sort((a, b) => b.accuracy - a.accuracy)

  if (rows.length >= 2) {
    rows[0].tag = 'best'
    rows[rows.length - 1].tag = 'focus'
  }
  return rows
}

/** One axis of the skill radar. */
export interface RadarAxis {
  axis: string
  mode: TrainingMode
  value: number
}

/**
 * Skill radar mapping each training area to the accuracy (0–100) of the mode
 * that trains it, over the selected range. Untrained areas read 0 — honest,
 * not hidden.
 */
export function buildSkillRadar(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
): RadarAxis[] {
  const cur = filterByRange(sessions, range, now)
  const accFor = (modes: TrainingMode[]): number => {
    const list = cur.filter(s => modes.includes(s.mode))
    return Math.round(accuracyOf(list) * 100)
  }
  return [
    { axis: 'Counting', mode: 'speedDrill', value: accFor(['speedDrill']) },
    { axis: 'Deviations', mode: 'deviationFlashCards', value: accFor(['deviationFlashCards', 'deviationAtTable']) },
    { axis: 'Betting', mode: 'betSpread', value: accFor(['betSpread']) },
    { axis: 'Estimation', mode: 'deckEstimation', value: accFor(['deckEstimation']) },
    { axis: 'Table Play', mode: 'casinoSession', value: accFor(['casinoSession']) },
  ]
}

/** A point on the cumulative net-result (edge) chart. */
export interface EdgePoint {
  index: number
  cumulative: number
}

/** Summary + series for the simulated-edge (Casino Session bankroll) block. */
export interface EdgeSummary {
  points: EdgePoint[]
  net: number
  sessions: number
  handsPlayed: number
}

/**
 * Cumulative net profit across Casino Session results in the range — the real
 * simulated bankroll from those sessions. Empty when no casino sessions exist.
 */
export function buildEdge(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
): EdgeSummary {
  const casino = filterByRange(sessions, range, now)
    .filter(s => s.mode === 'casinoSession')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const points: EdgePoint[] = [{ index: 0, cumulative: 0 }]
  let cumulative = 0
  let handsPlayed = 0
  casino.forEach((s, i) => {
    if (s.details.type === 'casinoSession') {
      cumulative += s.details.netProfit
      handsPlayed += s.details.handsPlayed
    }
    points.push({ index: i + 1, cumulative })
  })

  return { points, net: cumulative, sessions: casino.length, handsPlayed }
}

/** Aggregate per-deviation accuracy over range-filtered deviation sessions. */
export function buildWeakestHands(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  now: Date,
  limit = 5,
): { name: string; accuracy: number; attempts: number }[] {
  const cur = filterByRange(sessions, range, now)
  const accum: Record<string, { correct: number; total: number }> = {}
  for (const s of cur) {
    if (s.details.type !== 'deviationFlashCards' && s.details.type !== 'deviationAtTable') continue
    for (const [name, r] of Object.entries(s.details.perDeviation)) {
      if (!accum[name]) accum[name] = { correct: 0, total: 0 }
      accum[name].correct += r.correct
      accum[name].total += r.correct + r.incorrect
    }
  }
  return Object.entries(accum)
    .filter(([, v]) => v.total > 0)
    .map(([name, v]) => ({ name, accuracy: v.correct / v.total, attempts: v.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
}

/** A derived, human-readable "insight" hook for the top strip. */
export interface Insight {
  icon: string
  textKey: string
  /** Values interpolated into the message. */
  values?: Record<string, string | number>
  /** Segments to render bold (matched literally within `text`). */
  highlights: string[]
}

/**
 * Pick the single most salient insight from the range's data. Priority:
 * a clearly weak hand → an improving accuracy trend → an active streak →
 * a neutral prompt when there's not enough data.
 */
export function deriveInsight(
  sessions: TrainingSessionResult[],
  range: TimeRange,
  streak: number,
  now: Date,
): Insight {
  const cur = filterByRange(sessions, range, now)
  if (cur.length === 0) {
    return {
      icon: '🎯',
      textKey: 'analytics.insightEmpty',
      highlights: [],
    }
  }

  const weak = buildWeakestHands(sessions, range, now, 1)[0]
  if (weak && weak.accuracy < 0.6 && weak.attempts >= 3) {
    const miss = Math.round((1 - weak.accuracy) * 100)
    return {
      icon: '🎯',
      textKey: 'analytics.insightMsg.weak',
      values: { name: weak.name, miss },
      highlights: [weak.name, `${miss}%`],
    }
  }

  const prev = filterPreviousRange(sessions, range, now)
  if (prev.length > 0) {
    const delta = (accuracyOf(cur) - accuracyOf(prev)) * 100
    if (delta >= 3) {
      return {
        icon: '📈',
        textKey: 'analytics.insightMsg.up',
        values: { delta: `+${delta.toFixed(1)}%` },
        highlights: [`+${delta.toFixed(1)}%`],
      }
    }
    if (delta <= -3) {
      return {
        icon: '📉',
        textKey: 'analytics.insightMsg.down',
        values: { delta: `${delta.toFixed(1)}%` },
        highlights: [`${delta.toFixed(1)}%`],
      }
    }
  }

  if (streak >= 3) {
    return {
      icon: '🔥',
      textKey: 'analytics.insightMsg.streak',
      values: { streak },
      highlights: [],
    }
  }

  const acc = Math.round(accuracyOf(cur) * 100)
  return {
    icon: '✨',
    textKey: 'analytics.insightMsg.steady',
    values: { acc: `${acc}%`, n: cur.length },
    highlights: [`${acc}%`],
  }
}
