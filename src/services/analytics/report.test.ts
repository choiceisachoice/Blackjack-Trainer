import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

import { rangeBounds, formatDuration, fetchAnalyticsReport, RANGE_PRESETS } from './report'

// A Wednesday at 14:30 local time.
const NOW = new Date(2026, 8, 23, 14, 30)

beforeEach(() => rpc.mockReset())

describe('rangeBounds', () => {
  it('today is local midnight to the next midnight', () => {
    const r = rangeBounds({ kind: 'preset', preset: 'today' }, NOW)!
    expect(r.from).toEqual(new Date(2026, 8, 23))
    expect(r.to).toEqual(new Date(2026, 8, 24))
  })

  it('yesterday is the day before, whole', () => {
    const r = rangeBounds({ kind: 'preset', preset: 'yesterday' }, NOW)!
    expect(r.from).toEqual(new Date(2026, 8, 22))
    expect(r.to).toEqual(new Date(2026, 8, 23))
  })

  it('last 7 and last 30 days include today', () => {
    const w = rangeBounds({ kind: 'preset', preset: 'last7' }, NOW)!
    expect(w.from).toEqual(new Date(2026, 8, 17))
    expect(w.to).toEqual(new Date(2026, 8, 24))
    const m = rangeBounds({ kind: 'preset', preset: 'last30' }, NOW)!
    expect(m.from).toEqual(new Date(2026, 7, 25))
    expect(m.to).toEqual(new Date(2026, 8, 24))
  })

  it('a custom range is inclusive of both days', () => {
    const r = rangeBounds({ kind: 'custom', from: '2026-09-01', to: '2026-09-03' }, NOW)!
    expect(r.from).toEqual(new Date(2026, 8, 1))
    expect(r.to).toEqual(new Date(2026, 8, 4))
  })

  it('a single custom day works', () => {
    const r = rangeBounds({ kind: 'custom', from: '2026-09-01', to: '2026-09-01' }, NOW)!
    expect(r.from).toEqual(new Date(2026, 8, 1))
    expect(r.to).toEqual(new Date(2026, 8, 2))
  })

  it('rejects an inverted or malformed custom range', () => {
    expect(rangeBounds({ kind: 'custom', from: '2026-09-03', to: '2026-09-01' }, NOW)).toBeNull()
    expect(rangeBounds({ kind: 'custom', from: 'soon', to: '2026-09-01' }, NOW)).toBeNull()
    expect(rangeBounds({ kind: 'custom', from: '', to: '' }, NOW)).toBeNull()
  })

  it('offers the four presets the spec asks for', () => {
    expect(RANGE_PRESETS).toEqual(['today', 'yesterday', 'last7', 'last30'])
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(138)).toBe('2m 18s')
    expect(formatDuration(3780)).toBe('1h 03m')
  })

  it('shows a dash for no sessions rather than zero', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('fetchAnalyticsReport', () => {
  it('calls analytics_report with ISO bounds and the browser zone', async () => {
    rpc.mockResolvedValue({ data: { visitors: 1 }, error: null })
    const from = new Date(2026, 8, 1)
    const to = new Date(2026, 8, 2)
    const r = await fetchAnalyticsReport({ from, to })
    expect(r).toEqual({ visitors: 1 })
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('analytics_report')
    expect(args.p_from).toBe(from.toISOString())
    expect(args.p_to).toBe(to.toISOString())
    expect(typeof args.p_tz).toBe('string')
  })

  it('throws the server error — including a refusal', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    await expect(fetchAnalyticsReport({ from: new Date(), to: new Date(Date.now() + 1) })).rejects.toEqual({ message: 'forbidden' })
  })
})
