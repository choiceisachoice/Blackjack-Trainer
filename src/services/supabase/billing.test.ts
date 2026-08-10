import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// `vi.hoisted`, because the mock factory below is lifted above these lines and
// would otherwise reference the spy before it exists.
const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(name: string, opts?: unknown) => Promise<{ data: unknown; error: unknown }>>(),
}))

vi.mock('./client', () => ({
  isSupabaseConfigured: true,
  requireSupabase: () => ({ functions: { invoke } }),
  supabase: { functions: { invoke } },
}))

import { setPendingCheckout, consumePendingCheckout, startCheckout } from './billing'

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

/**
 * What `startCheckout` does with the Edge Function's answer.
 *
 * The function can now come back with a third thing besides a URL and a
 * failure: a refusal, because this customer already has a subscription Stripe
 * is billing. That has to reach the caller as a value it can act on — swallowed
 * or thrown, the user is left with a button that appeared to do nothing.
 */
describe('starting checkout', () => {
  const realLocation = window.location

  beforeEach(() => {
    invoke.mockReset()
    // jsdom refuses a real navigation, so stand in a plain object and read the
    // href we would have sent the browser to.
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
  })

  it('sends the browser to Stripe when a session was created', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/cs_test_123' }, error: null })

    await expect(startCheckout('yearly')).resolves.toBe('redirecting')
    expect(window.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_123')
  })

  it('reports the refusal instead of navigating when a subscription already exists', async () => {
    invoke.mockResolvedValue({ data: { alreadySubscribed: true, subscriptionId: 'sub_123' }, error: null })

    await expect(startCheckout('yearly')).resolves.toBe('already-subscribed')
    expect(window.location.href).toBe('')
  })

  it('never sends a price or an amount — only the plan name', async () => {
    // The server picks the price from its own allowlist. If the client were the
    // one naming a price, anyone could name a cheaper one.
    invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/x' }, error: null })

    await startCheckout('monthly')

    expect(invoke).toHaveBeenCalledWith('create-checkout-session', { body: { plan: 'monthly' } })
  })

  it('fails loudly when the answer contains neither a url nor a refusal', async () => {
    invoke.mockResolvedValue({ data: {}, error: null })

    await expect(startCheckout('yearly')).rejects.toThrow(/could not start checkout/i)
    expect(window.location.href).toBe('')
  })

  it('propagates a transport failure rather than pretending to redirect', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') })

    await expect(startCheckout('yearly')).rejects.toThrow(/failed to send a request/i)
  })
})
