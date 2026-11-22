import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const state = { configured: true }
vi.mock('../supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  get supabase() { return state.configured ? { rpc } : null },
}))

import { fetchFunnel, funnelSteps, FUNNEL_MIGRATION, FUNNEL_STEPS, type Funnel } from './funnel'

const FUNNEL: Funnel = {
  visitors: 700,
  signup_views: 140,
  registrations: 70,
  first_sessions: 35,
  paywall_views: 14,
  checkout_starts: 2,
  paying_customers: 1,
  events_since: '2026-11-21T08:00:00+00:00',
}

const BOUNDS = { from: new Date('2026-11-15T00:00:00Z'), to: new Date('2026-11-22T00:00:00Z') }

beforeEach(() => {
  state.configured = true
  rpc.mockReset()
})

describe('funnelSteps', () => {
  it('puts the seven steps in the order a visitor walks them', () => {
    expect(funnelSteps(FUNNEL).map(s => s.id)).toEqual([
      'visitors', 'signup_views', 'registrations', 'first_sessions', 'paywall_views', 'checkout_starts', 'paying_customers',
    ])
    expect(FUNNEL_STEPS).toHaveLength(7)
  })

  it('gives each step its share of the step before, as a whole percentage', () => {
    expect(funnelSteps(FUNNEL).map(s => s.percentOfPrevious)).toEqual([null, 20, 50, 50, 40, 14, 50])
  })

  it('has no share for the first step, or after a step of zero', () => {
    const steps = funnelSteps({ ...FUNNEL, signup_views: 0, registrations: 5 })
    expect(steps[0].percentOfPrevious).toBeNull()
    expect(steps[1].percentOfPrevious).toBe(0)
    // 5 registrations after 0 sign-up views is not "infinite" and not 0%.
    expect(steps[2].percentOfPrevious).toBeNull()
  })

  it('does not cap a share above 100: registrations count people the step before cannot see', () => {
    expect(funnelSteps({ ...FUNNEL, signup_views: 40, registrations: 70 })[2].percentOfPrevious).toBe(175)
  })

  it('sizes the bars against the largest step, wherever it is', () => {
    expect(funnelSteps(FUNNEL).map(s => s.width)).toEqual([100, 20, 10, 5, 2, 2 / 7, 1 / 7])
    const lopsided = funnelSteps({ ...FUNNEL, visitors: 10, registrations: 40, signup_views: 20, first_sessions: 0, paywall_views: 0, checkout_starts: 0, paying_customers: 0 })
    expect(lopsided.map(s => s.width)).toEqual([25, 50, 100, 0, 0, 0, 0])
  })

  it('draws nothing, rather than dividing by zero, when every step is zero', () => {
    const empty = funnelSteps({ visitors: 0, signup_views: 0, registrations: 0, first_sessions: 0, paywall_views: 0, checkout_starts: 0, paying_customers: 0, events_since: null })
    expect(empty.every(s => s.width === 0 && s.count === 0 && s.percentOfPrevious === null)).toBe(true)
  })

  it('treats a missing or broken number as zero', () => {
    const broken = { ...FUNNEL, paywall_views: null, checkout_starts: -3 } as unknown as Funnel
    const steps = funnelSteps(broken)
    expect(steps[4].count).toBe(0)
    expect(steps[5].count).toBe(0)
  })
})

describe('fetchFunnel', () => {
  it('asks analytics_funnel for the range, as two instants', async () => {
    rpc.mockResolvedValue({ data: FUNNEL, error: null })
    const r = await fetchFunnel(BOUNDS)
    expect(rpc).toHaveBeenCalledWith('analytics_funnel', {
      p_from: '2026-11-15T00:00:00.000Z',
      p_to: '2026-11-22T00:00:00.000Z',
    })
    expect(r).toEqual({ kind: 'ok', funnel: FUNNEL })
  })

  it('names the missing migration instead of throwing when the function does not exist', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.analytics_funnel' } })
    expect(await fetchFunnel(BOUNDS)).toEqual({ kind: 'missing-migration' })
  })

  it('throws every other error, a refusal included', async () => {
    const refusal = { code: '42501', message: 'forbidden' }
    rpc.mockResolvedValue({ data: null, error: refusal })
    await expect(fetchFunnel(BOUNDS)).rejects.toBe(refusal)
  })

  it('throws on an empty answer rather than showing seven zeros nobody counted', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    await expect(fetchFunnel(BOUNDS)).rejects.toThrow(/empty/)
  })

  it('throws without Supabase', async () => {
    state.configured = false
    await expect(fetchFunnel(BOUNDS)).rejects.toThrow(/unavailable/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('points at the migration file that exists', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(join(process.cwd(), 'supabase', 'migrations', FUNNEL_MIGRATION))).toBe(true)
  })
})
