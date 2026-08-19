import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dispatchEvent, type WebhookDeps, type WebhookEvent } from './webhook-dispatch'

/**
 * What the webhook does once the signature and the Stripe mode have been
 * accepted: claim the event, route it, and put the claim back if the work
 * failed.
 *
 * This is the part with a history. The ledger row used to be written up front
 * and left there, which turned Stripe's at-least-once delivery into
 * at-most-once — a handler that threw returned 500, Stripe retried, the retry
 * hit the unique key, answered "Already processed", and the event was lost for
 * good. The fix was correct and had no test, which is how it would have come
 * back.
 */

const claim = vi.fn<(e: { id: string; type: string }) => Promise<'claimed' | 'duplicate' | 'error'>>()
const release = vi.fn<(id: string) => Promise<boolean>>()
const syncSubscription = vi.fn<(id: string) => Promise<void>>()
const markPastDue = vi.fn<(customerId: string) => Promise<void>>()
const warn = vi.fn<(m: string) => void>()
const error = vi.fn<(m: string, e?: unknown) => void>()

const deps = (): WebhookDeps => ({ claim, release, syncSubscription, markPastDue, warn, error })

const evt = (type: string, object: Record<string, unknown>, id = 'evt_1'): WebhookEvent =>
  ({ id, type, data: { object } })

beforeEach(() => {
  for (const m of [claim, release, syncSubscription, markPastDue, warn, error]) m.mockReset()
  claim.mockResolvedValue('claimed')
  release.mockResolvedValue(true)
  syncSubscription.mockResolvedValue(undefined)
  markPastDue.mockResolvedValue(undefined)
})

describe('claiming the event', () => {
  it('does no work at all for a delivery that was already processed', async () => {
    // Stripe retries on any non-2xx, including its own timeouts. Without this
    // the same payment could be handled twice.
    claim.mockResolvedValue('duplicate')

    const res = await dispatchEvent(evt('customer.subscription.updated', { id: 'sub_1' }), deps())

    expect(res.status).toBe(200)
    expect(syncSubscription).not.toHaveBeenCalled()
  })

  it('refuses to handle anything when the ledger itself is broken', async () => {
    // Without a working ledger there is no idempotency, and handling the event
    // anyway would risk processing it again on the retry.
    claim.mockResolvedValue('error')

    const res = await dispatchEvent(evt('customer.subscription.updated', { id: 'sub_1' }), deps())

    expect(res.status).toBe(500)
    expect(syncSubscription).not.toHaveBeenCalled()
  })
})

describe('routing', () => {
  it('syncs the subscription a completed checkout created', async () => {
    const res = await dispatchEvent(
      evt('checkout.session.completed', { subscription: 'sub_new' }),
      deps(),
    )
    expect(syncSubscription).toHaveBeenCalledWith('sub_new')
    expect(res.status).toBe(200)
  })

  it('ignores a completed checkout that produced no subscription', async () => {
    // A one-off payment through the same account, if there ever is one. There
    // is no subscription to read, and passing `undefined` to Stripe would throw
    // and put the event into a retry loop it can never leave.
    const res = await dispatchEvent(evt('checkout.session.completed', {}), deps())
    expect(syncSubscription).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it.each([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ])('syncs on %s', async type => {
    await dispatchEvent(evt(type, { id: 'sub_7' }), deps())
    expect(syncSubscription).toHaveBeenCalledWith('sub_7')
  })

  it('downgrades on a failed invoice, by customer', async () => {
    await dispatchEvent(
      evt('invoice.payment_failed', { subscription: 'sub_1', customer: 'cus_9' }),
      deps(),
    )
    expect(markPastDue).toHaveBeenCalledWith('cus_9')
  })

  it('ignores a failed invoice that belongs to no subscription', async () => {
    // A one-off invoice failing says nothing about anyone's subscription, and
    // downgrading on it would take Pro away from someone still paying for it.
    await dispatchEvent(evt('invoice.payment_failed', { customer: 'cus_9' }), deps())
    expect(markPastDue).not.toHaveBeenCalled()
  })

  it('acknowledges an event type it does not handle', async () => {
    // Anything else must be answered 2xx or Stripe retries it forever.
    const res = await dispatchEvent(evt('customer.created', { id: 'cus_1' }), deps())
    expect(res.status).toBe(200)
    expect(syncSubscription).not.toHaveBeenCalled()
    expect(markPastDue).not.toHaveBeenCalled()
  })
})

describe('when the handler fails', () => {
  beforeEach(() => {
    // `mockImplementation` and not `mockRejectedValue`: the latter builds the
    // rejected promise when the mock is defined, and Vitest reports it as an
    // unhandled rejection before any test has had the chance to catch it.
    syncSubscription.mockImplementation(async () => {
      throw new Error('database on fire')
    })
  })

  it('puts the claim back so the retry can do the work', async () => {
    // The incident this guards against: leaving the claim in place turned
    // Stripe's at-least-once delivery into at-most-once. The retry answered
    // "Already processed" and the event was lost.
    const res = await dispatchEvent(evt('customer.subscription.updated', { id: 'sub_1' }), deps())

    expect(release).toHaveBeenCalledWith('evt_1')
    expect(res.status).toBe(500) // non-2xx, so Stripe retries
  })

  it('shouts when the claim cannot be put back, because nothing else will', async () => {
    // Handler failed AND cleanup failed: the event is now permanently stuck
    // behind its own ledger row, and the retry will be swallowed as a
    // duplicate. It is the one case that needs a human, so it must be findable
    // in the log rather than inferred from a missing entitlement weeks later.
    release.mockResolvedValue(false)

    const res = await dispatchEvent(evt('customer.subscription.updated', { id: 'sub_1' }), deps())

    expect(res.status).toBe(500)
    expect(error).toHaveBeenCalled()
    expect(error.mock.calls.some(c => /STUCK|evt_1/.test(String(c[0])))).toBe(true)
  })

  it('names the event in the log so a failure can be traced to a delivery', async () => {
    await dispatchEvent(evt('customer.subscription.updated', { id: 'sub_1' }, 'evt_xyz'), deps())
    const logged = [...warn.mock.calls, ...error.mock.calls].map(c => String(c[0])).join(' ')
    expect(logged).toMatch(/evt_xyz|customer\.subscription\.updated/)
  })
})
