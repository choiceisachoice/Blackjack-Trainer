import { create } from 'zustand'
import { fetchPlanPrices, type PlanPrice } from '../services/supabase/plan-prices'
import type { PlanId } from '../services/pro-features'

/**
 * The plan prices, fetched once and shared.
 *
 * Both the landing page's pricing card and the in-app paywall need the same two
 * numbers, and a visitor can see both in one session. One store means one
 * request and — more importantly — one answer: two independent fetches could
 * land either side of a price change and show a customer two different figures
 * for the same plan on the same visit.
 *
 * `error` is a real state and not a reason to substitute something. A page that
 * cannot confirm a price shows no price; see `plan-prices.ts`.
 */
export type PlanPriceStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PlanPriceState {
  status: PlanPriceStatus
  plans: PlanPrice[]
  /**
   * Fetch the prices, at most once per outcome.
   *
   * Safe to call from every component that renders a price — which is the point,
   * since none of them can know whether it is the first. A second call while one
   * is in flight is dropped rather than queued, so mounting the paywall and the
   * pricing card in the same tick makes one request.
   */
  load: () => Promise<void>
  /** Try again after a failure. Called by an explicit retry, not by a render. */
  reload: () => Promise<void>
}

async function run(set: (partial: Partial<PlanPriceState>) => void): Promise<void> {
  set({ status: 'loading' })
  try {
    set({ plans: await fetchPlanPrices(), status: 'ready' })
  } catch (e) {
    console.error('could not load plan prices', e)
    set({ plans: [], status: 'error' })
  }
}

export const usePlanPriceStore = create<PlanPriceState>((set, get) => ({
  status: 'idle',
  plans: [],

  load: async () => {
    const { status } = get()
    if (status !== 'idle') return
    await run(set)
  },

  reload: async () => {
    if (get().status === 'loading') return
    await run(set)
  },
}))

/** One plan's price, or `undefined` while loading or after a failure. */
export function selectPlan(state: PlanPriceState, id: PlanId): PlanPrice | undefined {
  return state.plans.find(p => p.id === id)
}
