/**
 * Whether this person is already being billed, and which Stripe customer is
 * theirs.
 *
 * The refusal to sell a second subscription used to consult only the customer
 * id stored on the profile. When that id was missing the check never ran: a
 * fresh Stripe customer was created and the same person could be sold a second
 * subscription, on a second customer, against the same card.
 *
 * The id goes missing for two reasons — a write that was never checked (fixed),
 * and a profile row recreated after an account was deleted, where the
 * entitlement trigger correctly nulls the column while Stripe still holds the
 * old customer and its live subscription.
 *
 * Pure, so the rules can be tested without Stripe, Deno, or a network.
 */

/**
 * Subscription states that mean "this person is already being billed".
 *
 * The same three the client grants Pro for (`entitlement-store.ts`), and there
 * is a test asserting they stay the same three: if the lists drifted, one side
 * would hand out access while the other sold another subscription for it.
 */
export const BILLABLE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due'])

export interface SubscriptionLike {
  id: string
  status: string
}

export interface CustomerLike {
  id: string
  /** Stripe's creation timestamp, seconds since the epoch. */
  created: number
}

/**
 * The first subscription that is actually costing this person money, if any.
 *
 * `incomplete` is deliberately absent from the billable set: an abandoned
 * checkout leaves one behind for about a day, and treating that as "already
 * subscribed" would lock someone out of retrying a payment they never finished.
 */
export function firstBillable(subs: SubscriptionLike[]): SubscriptionLike | undefined {
  return subs.find(s => BILLABLE_STATUSES.has(s.status))
}

/**
 * The customer to adopt out of everything Stripe has under this email.
 *
 * One email should mean one customer, and usually does. When it does not, the
 * newest is the best available guess — and adopting any of them beats the old
 * behaviour of adding one more to the pile. The caller still checks every
 * candidate for a live subscription before selling, so picking the wrong one
 * here cannot produce a double charge; it can only attach the profile to a
 * customer with less history than another.
 *
 * Copies before sorting: the caller iterates the same array for that check, and
 * silently reordering someone else's list is how a loop starts skipping items.
 */
export function newestCustomer(candidates: CustomerLike[]): CustomerLike | undefined {
  return [...candidates].sort((a, b) => b.created - a.created)[0]
}
