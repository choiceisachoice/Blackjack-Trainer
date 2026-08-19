/**
 * Which Stripe world this deployment belongs to, and whether an event is from it.
 *
 * Verifying a webhook signature proves the event came from Stripe. It does not
 * prove it came from *this* Stripe — test mode and live mode are separate
 * worlds with separate keys, and a signature is valid within whichever one
 * issued it. The production database still carries entitlement rows written in
 * July 2026 by sandbox events, which granted real Pro from a test card.
 *
 * The mode is inferred from the secret key already doing the work rather than
 * configured as its own value, so there is nothing extra to set and nothing
 * that can fall out of step with the key.
 */

/** Whether a secret key belongs to Stripe's live world. */
export function expectsLiveMode(secretKey: string | null | undefined): boolean {
  // `rk_` as well as `sk_`: a restricted key is a perfectly ordinary thing to
  // run a webhook on, and matching only `sk_live_` would read one as test mode
  // and drop every real event — silently, because the caller answers 2xx, so
  // Stripe would report a wall of successful deliveries while nothing was ever
  // written. A safety check able to switch off the payment path is worse than
  // no check at all.
  //
  // Anchored at the start so a key that merely contains "live" further along
  // cannot be mistaken for one.
  return /^(sk|rk)_live_/.test(secretKey ?? '')
}

/** Whether an event's `livemode` matches the world this deployment serves. */
export function acceptsEvent(eventLivemode: boolean, secretKey: string | null | undefined): boolean {
  return eventLivemode === expectsLiveMode(secretKey)
}
