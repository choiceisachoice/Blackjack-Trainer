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
 * What happened when checkout was requested.
 *
 * `already-subscribed` is not an error and not a success — the server refused
 * to sell a second subscription to someone who already pays for one. The caller
 * has to do something with that (send them to their account, refresh a stale
 * entitlement), which is why it comes back as a value rather than a throw.
 */
export type CheckoutOutcome = 'redirecting' | 'already-subscribed'

/**
 * Start Stripe Checkout for the given plan and redirect the browser to it.
 * The Edge Function chooses the actual price from a server-side allowlist — the
 * client never sends a price or an amount, and it refuses outright if this
 * customer already has a billable subscription at Stripe.
 *
 * Returns `redirecting` right before the browser leaves, so in practice that
 * value is rarely observed.
 */
export async function startCheckout(plan: BillingPlan): Promise<CheckoutOutcome> {
  if (!isSupabaseConfigured) throw new Error('Billing is unavailable in this environment.')
  const { data, error } = await requireSupabase().functions.invoke('create-checkout-session', {
    body: { plan },
  })
  if (error) throw error
  const result = data as { url?: string; alreadySubscribed?: boolean } | null
  if (result?.alreadySubscribed) return 'already-subscribed'
  const url = result?.url
  if (!url) throw new Error('Could not start checkout.')
  window.location.href = url
  return 'redirecting'
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
