/**
 * Turning a Stripe Price into a figure the paywall is allowed to quote.
 *
 * Every refusal below is a distinct way to bill someone the wrong amount while
 * the page looks entirely normal, and Stripe resolves all of them happily — an
 * archived price still comes back through the API, a one-off price has no
 * interval, and tiered pricing has no single amount at all. If any of those
 * reached the page the failure would be silent, which is the property that made
 * the hard-coded prices this replaced so hard to notice.
 */

/** The part of a Stripe Price this needs. Narrow on purpose, so it can be tested. */
export interface StripePriceLike {
  id: string
  active: boolean
  unit_amount: number | null
  currency: string
  recurring: { interval: string } | null
}

/** One plan's price, as the client receives it. */
export interface PlanPrice {
  id: string
  /** Stripe's `unit_amount`: the currency's smallest unit (890 = CHF 8.90). */
  amount: number
  /** ISO 4217, lower case, as Stripe returns it. */
  currency: string
  interval: string
}

/**
 * Validate and narrow a Stripe Price, or throw explaining which one and why.
 *
 * @param planId the slot this price fills (`monthly`, `yearly`) — carried into
 *   the error so a log names the misconfigured secret, not just the price.
 */
export function toPlanPrice(planId: string, price: StripePriceLike): PlanPrice {
  const where = `price ${price.id} (${planId} plan)`

  if (!price.active) throw new Error(`${where} is archived`)
  // Explicitly against null and not falsy: zero is a legitimate price, and
  // `!price.unit_amount` would reject a free plan as a misconfiguration.
  if (price.unit_amount == null) throw new Error(`${where} has no flat unit_amount`)
  if (!price.recurring) throw new Error(`${where} is not recurring`)

  return {
    id: planId,
    amount: price.unit_amount,
    currency: price.currency,
    // Read from the price, never inferred from `planId`. The slot is our label;
    // what it bills is Stripe's, and the two can disagree after a re-point.
    interval: price.recurring.interval,
  }
}
