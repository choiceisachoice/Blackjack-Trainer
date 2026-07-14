import { describe, it, expect, beforeEach } from 'vitest'
import { setPendingCheckout, consumePendingCheckout } from './billing'

describe('pending checkout intent', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a remembered plan and clears it on consume', () => {
    setPendingCheckout('yearly')
    expect(consumePendingCheckout()).toBe('yearly')
    // consuming clears it — a second read is empty.
    expect(consumePendingCheckout()).toBeNull()
  })

  it('returns null when nothing is pending', () => {
    expect(consumePendingCheckout()).toBeNull()
  })

  it('ignores a corrupt stored value', () => {
    localStorage.setItem('bjt_pending_checkout', 'nonsense')
    expect(consumePendingCheckout()).toBeNull()
  })
})
