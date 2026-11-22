import { supabase } from '../supabase/client'
import { FUNNEL_MIGRATION } from './events'

/**
 * The path to purchase: what `analytics_funnel` returns (migration
 * `20261121120000_purchase_funnel.sql`), and the arithmetic the admin page
 * shows beside it.
 *
 * The seven numbers are counted in the database, for one range; their
 * definitions are documented on the SQL function. This module names the
 * shape, puts the steps in order and works out each step's share of the one
 * before it.
 */

export { FUNNEL_MIGRATION }

export interface Funnel {
  /** Distinct visitor ids with a page view in the range. */
  visitors: number
  /** Distinct visitors shown the sign-up form. */
  signup_views: number
  /** Accounts created in the range — everyone, with or without cookies. */
  registrations: number
  /** Accounts whose first training session fell in the range. */
  first_sessions: number
  /** Distinct people shown the upgrade panel. */
  paywall_views: number
  /** Distinct people who started a checkout. */
  checkout_starts: number
  /** Active subscriptions, counted now — not per range. */
  paying_customers: number
  /** ISO instant of the oldest stored step, or null when there is none. */
  events_since: string | null
}

/** The steps, in the order a visitor walks them. */
export const FUNNEL_STEPS = [
  'visitors',
  'signup_views',
  'registrations',
  'first_sessions',
  'paywall_views',
  'checkout_starts',
  'paying_customers',
] as const

export type FunnelStepId = (typeof FUNNEL_STEPS)[number]

export interface FunnelStep {
  id: FunnelStepId
  count: number
  /**
   * This step as a whole percentage of the step before it. Null for the first
   * step and wherever the step before is zero — a share of nothing is not 0%.
   * Can exceed 100: registrations count everyone, the sign-up views before
   * them only visitors who accepted cookies.
   */
  percentOfPrevious: number | null
  /** The bar's length, 0..100, relative to the largest step. */
  width: number
}

/**
 * The seven steps with their shares. Pure.
 *
 * @param funnel - What the server returned
 */
export function funnelSteps(funnel: Funnel): FunnelStep[] {
  const counts = FUNNEL_STEPS.map(id => Math.max(0, Number(funnel[id]) || 0))
  const max = Math.max(1, ...counts)
  return FUNNEL_STEPS.map((id, i) => {
    const count = counts[i]
    const before = i === 0 ? 0 : counts[i - 1]
    return {
      id,
      count,
      percentOfPrevious: i === 0 || before === 0 ? null : Math.round((count / before) * 100),
      width: (count / max) * 100,
    }
  })
}

/**
 * Either the numbers, or the one situation the page words differently from
 * an error: the function does not exist because the migration was not
 * applied.
 */
export type FunnelResult =
  | { kind: 'ok'; funnel: Funnel }
  | { kind: 'missing-migration' }

/**
 * Fetch the funnel for a range.
 *
 * Throws on any other failure, including "not an admin" — the page shows one
 * sentence for all of them.
 *
 * @param bounds - The range: `from` inclusive, `to` exclusive
 */
export async function fetchFunnel(bounds: { from: Date; to: Date }): Promise<FunnelResult> {
  if (!supabase) throw new Error('The funnel is unavailable in this environment.')
  const { data, error } = await supabase.rpc('analytics_funnel', {
    p_from: bounds.from.toISOString(),
    p_to: bounds.to.toISOString(),
  })
  if (error) {
    if (error.code === 'PGRST202') return { kind: 'missing-migration' }
    throw error
  }
  if (!data) throw new Error('The funnel came back empty.')
  return { kind: 'ok', funnel: data as Funnel }
}
