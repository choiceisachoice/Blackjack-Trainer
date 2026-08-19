import { describe, it, expect } from 'vitest'
import { toPlanPrice } from './plan-price'

/**
 * Turning a Stripe Price into something a paywall may quote.
 *
 * Each rejection below is a distinct way to bill the wrong amount while the
 * page looks perfectly normal, and none of them announces itself: Stripe
 * resolves all of these prices happily.
 */
const USABLE = {
  id: 'price_1',
  active: true,
  unit_amount: 890,
  currency: 'chf',
  recurring: { interval: 'month' },
}

describe('toPlanPrice', () => {
  it('carries the amount through in minor units, unrounded and unconverted', () => {
    // Every conversion is a chance to be wrong about a number someone is
    // charged, so the only one happens at the point of display.
    expect(toPlanPrice('monthly', USABLE)).toEqual({
      id: 'monthly',
      amount: 890,
      currency: 'chf',
      interval: 'month',
    })
  })

  it('takes the interval from the price rather than from the plan name', () => {
    // "yearly" is our label for a slot. What it actually bills is Stripe's
    // business, and the two can disagree after a price is re-pointed.
    const monthlyPriceInTheYearlySlot = { ...USABLE, recurring: { interval: 'month' } }
    expect(toPlanPrice('yearly', monthlyPriceInTheYearlySlot).interval).toBe('month')
  })

  it('refuses an archived price', () => {
    // Archiving is how a superseded price is retired — Stripe has no delete for
    // prices that have been used. It still resolves through the API, so a
    // secret left pointing at one would quietly sell last season's price.
    expect(() => toPlanPrice('monthly', { ...USABLE, active: false })).toThrow(/archived/)
  })

  it('refuses a price with no flat amount', () => {
    // Tiered and metered prices have `unit_amount: null`. There is no single
    // figure to put on a card, and rendering `null` would read as free.
    expect(() => toPlanPrice('monthly', { ...USABLE, unit_amount: null })).toThrow(/unit_amount/)
  })

  it('refuses a one-off price where a subscription is being sold', () => {
    // The page sells a subscription. A non-recurring price charges once and
    // leaves the customer entitled forever, or not at all — depending on
    // whichever of the two systems is asked.
    expect(() => toPlanPrice('monthly', { ...USABLE, recurring: null })).toThrow(/not recurring/)
  })

  it('names the price and the plan in every refusal, so the log identifies the misconfiguration', () => {
    expect(() => toPlanPrice('yearly', { ...USABLE, active: false })).toThrow(/price_1/)
    expect(() => toPlanPrice('yearly', { ...USABLE, active: false })).toThrow(/yearly/)
  })

  it('accepts zero, because a free plan is a configuration and not a mistake', () => {
    // Distinct from `null`. Zero is a decision someone made; null means the
    // price cannot be expressed as one number.
    expect(toPlanPrice('monthly', { ...USABLE, unit_amount: 0 }).amount).toBe(0)
  })
})
