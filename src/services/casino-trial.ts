/**
 * The free trial of the casino table: ten hands, once per account.
 *
 * ── What it is for ──
 * The table is the thing Pro sells, and a free account never saw it — only a
 * lock and a comparison list. Ten hands at the real table let someone find
 * out what they would be paying for, and meet the paywall with a result of
 * their own.
 *
 * ── What is counted, and when ──
 * Hands, not visits: a hand counts the moment it is settled (the same moment
 * it is written to the saved table). Ten in total, across every sitting.
 *
 * ── Where the count lives ──
 * Here, under a `bjt_` key, so the sign-out wipe takes it like everything else
 * of the account — and in `profiles.settings.casino_trial_hands`, where
 * `profiles-sync` carries it and merges by MAX. The count only ever grows, so
 * a wiped device, a second device or a tab that has fallen behind can lower
 * nothing. The local copy is absent until the first merge of an account on a
 * device has landed; "absent" means *unknown*, not zero, and nothing is
 * offered while it is unknown — otherwise the second after a sign-in on a new
 * device would offer all ten hands again.
 *
 * ── What this is not ──
 * It is a counter the client keeps. Somebody who wants more hands can have
 * them: block or edit the profile write (a user may update their own
 * `settings`, and no trigger guards this key the way one guards XP), clear
 * the key and stay offline, reload a hand away before it is settled — or
 * simply sign up again with another address. That is acceptable for a
 * trial: what it hands out is play at a practice table, and the person doing
 * it is using the product. It would not be acceptable for Pro, and Pro does
 * not work this way — the entitlement is written by the Stripe webhook alone.
 */

/** Hands an account may play at the table without Pro. */
export const TRIAL_HANDS = 10

/** localStorage key of the hands used. Under `bjt_`: wiped on sign-out. */
export const TRIAL_KEY = 'bjt_casino_trial'

const listeners = new Set<() => void>()

/**
 * Be told when the count on this device changes — a hand was settled, a merge
 * with the cloud landed.
 *
 * @returns The function that stops the notifications
 */
export function onTrialChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** A stored or received value as a count of trial hands: whole, 0 to the limit. */
export function toTrialHands(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(TRIAL_HANDS, Math.floor(value)))
}

/**
 * The trial hands used, as this device knows it — or null when it does not:
 * no merge with the account has landed here yet.
 */
export function readTrialHandsUsed(): number | null {
  try {
    const raw = localStorage.getItem(TRIAL_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { used?: unknown } | null
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.used !== 'number') return null
    return toTrialHands(parsed.used)
  } catch {
    return null
  }
}

/** The trial hands used; zero where nothing is known. For the sync, which merges by max. */
export function trialHandsUsed(): number {
  return readTrialHandsUsed() ?? 0
}

/** How many trial hands are left after `used`. */
export function trialHandsLeft(used: number): number {
  return TRIAL_HANDS - toTrialHands(used)
}

/**
 * Record that at least `used` trial hands have been played.
 *
 * Never lowers the count: whatever the device already holds stays if it is
 * greater. Always writes, also a zero — the written key is what says the
 * count is known on this device.
 *
 * @param used - Trial hands played, from the cloud or from a merge
 */
export function setTrialHandsUsed(used: number): void {
  const next = Math.max(trialHandsUsed(), toTrialHands(used))
  try {
    localStorage.setItem(TRIAL_KEY, JSON.stringify({ used: next }))
  } catch {
    /* no storage: the count lives in the cloud alone, and is unknown here */
  }
  listeners.forEach(listener => listener())
}

/**
 * One trial hand was settled.
 *
 * @returns The hands used after it
 */
export function countTrialHand(): number {
  setTrialHandsUsed(trialHandsUsed() + 1)
  return trialHandsUsed()
}
