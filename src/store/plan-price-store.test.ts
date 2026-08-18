import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchPlanPrices = vi.fn<() => Promise<unknown>>()

vi.mock('../services/supabase/plan-prices', () => ({
  fetchPlanPrices: () => fetchPlanPrices(),
}))

import { usePlanPriceStore, selectPlan } from './plan-price-store'

/**
 * Where the paywall's numbers come from.
 *
 * They used to be literals in `pro-features.ts`, kept in step with Stripe by a
 * comment. On 10 August 2026 they went out of step: the prices were re-cut for
 * Swiss VAT and the page advertised CHF 8.90 while the configured price charged
 * 7.90. This store is the replacement, so the properties that matter here are
 * the ones that failure had — one answer, and no invented figure when the real
 * one is unavailable.
 */

const PRICES = [
  { id: 'monthly' as const, amount: 890, currency: 'chf', interval: 'month' },
  { id: 'yearly' as const, amount: 6900, currency: 'chf', interval: 'year' },
]

const reset = () => usePlanPriceStore.setState({ status: 'idle', plans: [] })

beforeEach(() => {
  fetchPlanPrices.mockReset()
  reset()
})

afterEach(() => vi.restoreAllMocks())

describe('loading the plan prices', () => {
  it('serves what the server said, unrounded and in minor units', async () => {
    fetchPlanPrices.mockResolvedValue(PRICES)

    await usePlanPriceStore.getState().load()

    const s = usePlanPriceStore.getState()
    expect(s.status).toBe('ready')
    expect(selectPlan(s, 'monthly')?.amount).toBe(890)
    expect(selectPlan(s, 'yearly')?.amount).toBe(6900)
  })

  it('makes one request even when several components ask at once', async () => {
    // The landing page's pricing card and the paywall can both be mounted in
    // one session, and each calls `load` without knowing about the other. Two
    // fetches could straddle a price change and show a visitor two different
    // figures for the same plan on the same visit.
    fetchPlanPrices.mockResolvedValue(PRICES)

    await Promise.all([
      usePlanPriceStore.getState().load(),
      usePlanPriceStore.getState().load(),
      usePlanPriceStore.getState().load(),
    ])

    expect(fetchPlanPrices).toHaveBeenCalledTimes(1)
  })

  it('does not re-fetch once it has an answer', async () => {
    fetchPlanPrices.mockResolvedValue(PRICES)
    await usePlanPriceStore.getState().load()
    await usePlanPriceStore.getState().load()
    expect(fetchPlanPrices).toHaveBeenCalledTimes(1)
  })
})

describe('when the prices cannot be fetched', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))

  it('reports the failure and holds no prices at all', async () => {
    // The important half is the second one. A fallback amount here would be a
    // number nothing verified, rendered with the same confidence as a real
    // price — which is precisely how a page comes to advertise 8.90 while the
    // card is charged 7.90. No price is honest; a guessed price is not.
    fetchPlanPrices.mockRejectedValue(new Error('503'))

    await usePlanPriceStore.getState().load()

    const s = usePlanPriceStore.getState()
    expect(s.status).toBe('error')
    expect(s.plans).toEqual([])
    expect(selectPlan(s, 'monthly')).toBeUndefined()
  })

  it('stops retrying on its own, so a failing backend is not hammered by renders', async () => {
    fetchPlanPrices.mockRejectedValue(new Error('503'))
    await usePlanPriceStore.getState().load()
    await usePlanPriceStore.getState().load()
    expect(fetchPlanPrices).toHaveBeenCalledTimes(1)
  })

  it('tries again when something explicitly asks it to', async () => {
    fetchPlanPrices.mockRejectedValueOnce(new Error('503'))
    await usePlanPriceStore.getState().load()
    expect(usePlanPriceStore.getState().status).toBe('error')

    fetchPlanPrices.mockResolvedValue(PRICES)
    await usePlanPriceStore.getState().reload()

    expect(usePlanPriceStore.getState().status).toBe('ready')
    expect(selectPlan(usePlanPriceStore.getState(), 'monthly')?.amount).toBe(890)
  })
})
