import { requireSupabase, isSupabaseConfigured } from './client'

/** The subscription plans offered at checkout. Price ids live server-side only. */
export type BillingPlan = 'monthly' | 'yearly'

/** localStorage key for a logged-out visitor's "Go Pro" intent. */
const PENDING_CHECKOUT_KEY = 'bjt_pending_checkout'

/**
 * Remember that a signed-out visitor wants to buy `plan`, so the purchase can be
 * resumed once they sign in (survives the sign-up email-confirmation round-trip,
 * since it's the same browser).
 */
export function setPendingCheckout(plan: BillingPlan): void {
  try { localStorage.setItem(PENDING_CHECKOUT_KEY, plan) } catch { /* storage unavailable */ }
}

/** Read and clear a pending "Go Pro" intent — returns the plan, or null. */
export function consumePendingCheckout(): BillingPlan | null {
  try {
    const v = localStorage.getItem(PENDING_CHECKOUT_KEY)
    if (v === 'monthly' || v === 'yearly') {
      localStorage.removeItem(PENDING_CHECKOUT_KEY)
      return v
    }
  } catch { /* storage unavailable */ }
  return null
}

/**
 * Start Stripe Checkout for the given plan and redirect the browser to it.
 * The Edge Function chooses the actual price from a server-side allowlist — the
 * client never sends a price or an amount.
 */
export async function startCheckout(plan: BillingPlan): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Billing is unavailable in this environment.')
  const { data, error } = await requireSupabase().functions.invoke('create-checkout-session', {
    body: { plan },
  })
  if (error) throw error
  const url = (data as { url?: string })?.url
  if (!url) throw new Error('Could not start checkout.')
  window.location.href = url
}

/**
 * Open the Stripe Customer Portal so the user can manage or cancel their
 * subscription, then redirect the browser to it.
 */
export async function openBillingPortal(): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Billing is unavailable in this environment.')
  const { data, error } = await requireSupabase().functions.invoke('create-portal-session', {})
  if (error) throw error
  const url = (data as { url?: string })?.url
  if (!url) throw new Error('Could not open the billing portal.')
  window.location.href = url
}
