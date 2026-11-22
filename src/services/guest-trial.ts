/**
 * The trial round at `/try`: what a visitor without an account leaves on the
 * device, and which account may take it over.
 *
 * ## Why this exists
 *
 * Until the trial, data with no owner could only come from a build without a
 * cloud. The sign-in merge therefore treats ownerless data as "a guest's,
 * about to become this account's" and uploads it. With a public trial every
 * visitor's device can hold such data — and on a shared computer the next
 * person to sign in is not necessarily the one who played. A round played by
 * one person must not be filed in the history of another.
 *
 * ## The rule
 *
 * The trial stamps the moment it began. At sign-in, ownerless data that
 * carries the stamp is handed over only to an account **created after the
 * round began** — the visitor who played and then signed up. An account older
 * than the round is somebody who existed before it; for them the device is
 * wiped like any other device holding foreign data. Ownerless data without a
 * stamp (a device from before the trial existed) keeps the old rule.
 *
 * It errs towards losing the round: an account that cannot be dated does not
 * get it. A lost trial round costs ten answers; a wrong one in someone's
 * analytics cannot be told from their own.
 *
 * A leaf module (it imports only the owner record), so the sign-in merge and
 * the page can both use it.
 */
import { getLocalOwner } from './storage/local-owner'

/** localStorage key holding when the first trial round on this device began (ms since epoch). */
export const GUEST_SINCE_KEY = 'bjt_guest_since'

/** How many hands the trial round has. */
export const GUEST_ROUND_HANDS = 10

/**
 * How far the device's clock may run ahead of the server's before a genuine
 * sign-up is mistaken for an older account. The stamp is the device's time,
 * the account's creation is the server's.
 */
export const GUEST_CLOCK_SLACK_MS = 5 * 60_000

/** When the first trial round on this device began, or null if none did. */
export function guestRoundSince(): number | null {
  try {
    const raw = localStorage.getItem(GUEST_SINCE_KEY)
    if (raw === null) return null
    const at = Number(raw)
    return Number.isFinite(at) && at > 0 ? at : null
  } catch {
    return null
  }
}

/**
 * Stamp the start of a trial round. The earliest start is kept: a visitor who
 * plays on Monday and again on Friday and then signs up owns both rounds.
 *
 * @param now - The current time (ms since epoch); injectable for tests
 */
export function markGuestRound(now: number = Date.now()): void {
  if (guestRoundSince() !== null) return
  try {
    localStorage.setItem(GUEST_SINCE_KEY, String(now))
  } catch { /* storage unavailable: nothing is recorded either */ }
}

/** Forget the stamp — the data it described now has an owner, or is gone. */
export function clearGuestRound(): void {
  try {
    localStorage.removeItem(GUEST_SINCE_KEY)
  } catch { /* ignore */ }
}

/**
 * Whether a trial round played now will be kept for the account the visitor
 * creates afterwards.
 *
 * Only on a device that belongs to nobody. Where an account's data is still
 * present — a session that expired without a sign-out — the round would be
 * written into that account's local history and uploaded with it, so there it
 * is played and not recorded.
 */
export function guestRoundIsKept(): boolean {
  return getLocalOwner() === null
}

/**
 * Whether the ownerless data on this device may be handed to the account
 * signing in.
 *
 * @param accountCreatedAt - `user.created_at` of the account signing in
 * @returns true when there is no trial data (the old rule applies), or when
 *   the account was created after the trial round began
 */
export function guestDataBelongsTo(accountCreatedAt: string | null | undefined): boolean {
  const since = guestRoundSince()
  if (since === null) return true
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN
  if (!Number.isFinite(created)) return false
  return created >= since - GUEST_CLOCK_SLACK_MS
}
