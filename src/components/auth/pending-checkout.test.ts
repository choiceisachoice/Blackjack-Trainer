import { describe, it, expect, beforeEach } from 'vitest'
import { setPendingCheckout, consumePendingCheckout } from '../../services/supabase/billing'
import { peekPendingCheckout } from './pending-checkout'

beforeEach(() => { localStorage.clear() })

describe('peekPendingCheckout', () => {
  it('reads what setPendingCheckout wrote, without taking it away', () => {
    expect(peekPendingCheckout()).toBeNull()
    setPendingCheckout('yearly')
    expect(peekPendingCheckout()).toBe('yearly')
    // Still there for the resume after sign-in.
    expect(consumePendingCheckout()).toBe('yearly')
    expect(peekPendingCheckout()).toBeNull()
  })
})
