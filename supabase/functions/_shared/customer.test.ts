import { describe, it, expect } from 'vitest'
import { BILLABLE_STATUSES, firstBillable, newestCustomer } from './customer'

/**
 * Deciding whether this person is already being billed, and by which customer.
 *
 * The guard against selling a second subscription used to consult only the
 * customer id stored on the profile — so when that id was missing it never ran
 * at all, a fresh Stripe customer was created, and the same person was sold a
 * second subscription. These two functions are the parts of the replacement
 * that carry a rule rather than an API call.
 */

const sub = (status: string, id = `sub_${status}`) => ({ id, status })

describe('firstBillable', () => {
  it('finds an active subscription', () => {
    expect(firstBillable([sub('active')])?.id).toBe('sub_active')
  })

  it('counts a trial as billable', () => {
    // A trial becomes a charge without anyone doing anything. Selling a second
    // subscription during one is still selling a second subscription.
    expect(firstBillable([sub('trialing')])?.id).toBe('sub_trialing')
  })

  it('counts a past-due subscription as billable', () => {
    // A grace window on a subscription that still exists, not an invitation to
    // sell another one. Stripe is still trying to collect on it.
    expect(firstBillable([sub('past_due')])?.id).toBe('sub_past_due')
  })

  it('does not count an abandoned checkout', () => {
    // `incomplete` is what an unfinished payment leaves behind for about a day.
    // Treating it as "already subscribed" would lock someone out of retrying a
    // payment they never completed — the opposite failure, and just as bad.
    expect(firstBillable([sub('incomplete')])).toBeUndefined()
    expect(firstBillable([sub('incomplete_expired')])).toBeUndefined()
  })

  it('does not count a subscription that has ended', () => {
    expect(firstBillable([sub('canceled')])).toBeUndefined()
    expect(firstBillable([sub('unpaid')])).toBeUndefined()
  })

  it('finds the billable one among several dead ones', () => {
    // The realistic shape of a returning customer's history.
    const found = firstBillable([sub('canceled'), sub('incomplete'), sub('active')])
    expect(found?.id).toBe('sub_active')
  })

  it('returns nothing for a customer with no subscriptions', () => {
    expect(firstBillable([])).toBeUndefined()
  })

  it('agrees with the statuses that grant Pro', () => {
    // The client unlocks Pro for exactly these three (`entitlement-store.ts`).
    // If the two lists drifted apart, one side would grant access while the
    // other sold another subscription for it.
    expect([...BILLABLE_STATUSES].sort()).toEqual(['active', 'past_due', 'trialing'])
  })
})

describe('newestCustomer', () => {
  it('returns nothing when the email matches no customer', () => {
    // The ordinary case for a new buyer: nothing to adopt, create one.
    expect(newestCustomer([])).toBeUndefined()
  })

  it('returns the only match', () => {
    expect(newestCustomer([{ id: 'cus_1', created: 100 }])?.id).toBe('cus_1')
  })

  it('prefers the most recently created when an email has several', () => {
    // Several customers on one email is already a mess — but picking one of
    // them beats making it worse by adding another.
    const picked = newestCustomer([
      { id: 'cus_old', created: 100 },
      { id: 'cus_new', created: 300 },
      { id: 'cus_mid', created: 200 },
    ])
    expect(picked?.id).toBe('cus_new')
  })

  it('does not depend on the order Stripe returned them in', () => {
    const ascending = newestCustomer([{ id: 'a', created: 1 }, { id: 'b', created: 2 }])
    const descending = newestCustomer([{ id: 'b', created: 2 }, { id: 'a', created: 1 }])
    expect(ascending?.id).toBe('b')
    expect(descending?.id).toBe('b')
  })

  it('leaves the caller’s array untouched', () => {
    // It sorts to find the newest; doing that in place would reorder a list the
    // caller is about to iterate for the billable check.
    const list = [{ id: 'a', created: 1 }, { id: 'b', created: 2 }]
    newestCustomer(list)
    expect(list.map(c => c.id)).toEqual(['a', 'b'])
  })
})
