import { requireSupabase, isSupabaseConfigured } from './client'

/** The subscription plans offered at checkout. Price ids live server-side only. */
export type BillingPlan = 'monthly' | 'yearly'

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
