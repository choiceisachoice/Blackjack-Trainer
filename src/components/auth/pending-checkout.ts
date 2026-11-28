import type { BillingPlan } from '../../services/supabase/billing'

/**
 * The key `setPendingCheckout` in `services/supabase/billing.ts` writes.
 * Read here without consuming it — the purchase still has to resume after
 * sign-up, which is `consumePendingCheckout`'s job. The test writes it with
 * `setPendingCheckout` itself, so the two cannot drift apart unnoticed.
 */
const PENDING_CHECKOUT_KEY = 'bjt_pending_checkout'

/**
 * The plan a signed-out visitor chose before arriving at `/login`, if any.
 *
 * @returns `'monthly'`, `'yearly'`, or null when nothing is pending or storage is unavailable
 */
export function peekPendingCheckout(): BillingPlan | null {
  try {
    const v = localStorage.getItem(PENDING_CHECKOUT_KEY)
    return v === 'monthly' || v === 'yearly' ? v : null
  } catch {
    return null
  }
}
