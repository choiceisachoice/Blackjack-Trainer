import { requireSupabase, isSupabaseConfigured } from './client'
import type { PlanId } from '../pro-features'

/**
 * What one plan costs, as Stripe states it.
 *
 * `amount` is in the currency's smallest unit — Stripe's own `unit_amount`,
 * carried through unrounded and unconverted. Every conversion is a chance to be
 * wrong about a number a customer is charged, so the only one happens at the
 * point of display, in `formatMoney`.
 */
export interface PlanPrice {
  id: PlanId
  amount: number
  /** ISO 4217, lower case, as Stripe returns it. */
  currency: string
  interval: string
}

/**
 * Ask the server what the plans cost.
 *
 * Not "fetch the prices we know about" — the client has no prices to know. The
 * price ids are server-side (they are also what checkout bills against), and
 * this is the only way the page learns a number it is allowed to show.
 *
 * Throws rather than returning a fallback. There is no honest fallback for a
 * price: an amount we cannot confirm is exactly the thing that put CHF 8.90 on
 * the page while the card was charged 7.90.
 */
export async function fetchPlanPrices(): Promise<PlanPrice[]> {
  if (!isSupabaseConfigured) throw new Error('Prices are unavailable in this environment.')

  const { data, error } = await requireSupabase().functions.invoke('get-plan-prices', {
    body: {},
  })
  if (error) throw error

  const plans = (data as { plans?: PlanPrice[] } | null)?.plans
  if (!Array.isArray(plans) || plans.length === 0) throw new Error('No prices returned.')
  return plans
}
