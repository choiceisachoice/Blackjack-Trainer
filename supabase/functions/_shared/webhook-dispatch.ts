/**
 * What the Stripe webhook does once the signature and the mode have been
 * accepted: claim the event so a retry cannot repeat it, route it to the right
 * handler, and put the claim back if the work failed.
 *
 * Separated from `stripe-webhook/index.ts` so it can be tested. The routing is
 * where a payment either reaches a profile row or quietly does not, and the
 * claim/release pair has a history: the ledger row used to be written up front
 * and left there, which turned Stripe's at-least-once delivery into
 * at-most-once — a handler that threw returned 500, Stripe retried, the retry
 * hit the unique key, answered "Already processed", and the event was gone.
 * That fix was correct and had no test, which is how such a thing comes back.
 *
 * Everything it touches arrives as a function, so a test needs no Stripe, no
 * database and no Deno.
 */

/** The slice of a Stripe event this needs. */
export interface WebhookEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/** What happened when the ledger row was claimed. */
export type LedgerClaim = 'claimed' | 'duplicate' | 'error'

export interface WebhookDeps {
  /** Insert the ledger row. `duplicate` means this delivery was already handled. */
  claim(event: { id: string; type: string }): Promise<LedgerClaim>
  /** Remove the ledger row again. `false` if that itself failed. */
  release(eventId: string): Promise<boolean>
  syncSubscription(subscriptionId: string): Promise<void>
  markPastDue(customerId: string): Promise<void>
  warn(message: string): void
  error(message: string, cause?: unknown): void
}

/** The HTTP answer Stripe should get. */
export interface DispatchResult {
  status: number
  body: string
}

/** Read a string field off an event payload, or undefined if it is not one. */
function str(object: Record<string, unknown>, key: string): string | undefined {
  const v = object[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export async function dispatchEvent(
  event: WebhookEvent,
  deps: WebhookDeps,
): Promise<DispatchResult> {
  const claimed = await deps.claim({ id: event.id, type: event.type })

  // Already handled. Answering 2xx stops Stripe redelivering it.
  if (claimed === 'duplicate') return { status: 200, body: 'Already processed' }

  // No working ledger means no idempotency. Handling the event anyway would
  // risk doing the same work again on the retry, which on a payment path is
  // worse than making Stripe wait.
  if (claimed === 'error') return { status: 500, body: 'Ledger error' }

  try {
    const object = event.data.object

    switch (event.type) {
      case 'checkout.session.completed': {
        // Guarded: a session without a subscription is not ours to sync, and
        // passing `undefined` to Stripe would throw and start a retry loop the
        // event can never leave.
        const subscription = str(object, 'subscription')
        if (subscription) await deps.syncSubscription(subscription)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const id = str(object, 'id')
        if (id) await deps.syncSubscription(id)
        break
      }

      case 'invoice.payment_failed': {
        // Only when the invoice belongs to a subscription. A failed one-off
        // invoice says nothing about anyone's subscription, and downgrading on
        // it would take Pro from someone who is still paying for it.
        const customer = str(object, 'customer')
        if (str(object, 'subscription') && customer) await deps.markPastDue(customer)
        break
      }

      default:
        // Acknowledged, so Stripe stops retrying something nobody handles.
        break
    }
  } catch (e) {
    // Release the claim so Stripe's retry can actually do the work.
    const released = await deps.release(event.id)
    if (!released) {
      // Handler failed *and* cleanup failed: the event is now stuck behind its
      // own ledger row and every retry will be swallowed as a duplicate. The
      // one case that needs a person, so it has to be findable in the log
      // rather than inferred weeks later from an entitlement that never
      // arrived.
      deps.error(
        `STUCK EVENT ${event.id} (${event.type}): handler failed AND the ledger claim ` +
        `could not be released. Stripe's retry will be swallowed as a duplicate. ` +
        `Delete this row by hand and replay the event.`,
      )
    }
    deps.error(`handler for ${event.type} (${event.id}) failed`, e)
    return { status: 500, body: 'Handler error' }
  }

  return { status: 200, body: 'ok' }
}
