/**
 * The trial round without an account: how many hands it has, and which
 * account may take over the round a visitor played before 23 Nov 2026.
 *
 * ## What changed
 *
 * The round used to be ten flashcards, recorded like any session on the
 * device and uploaded to the account created afterwards. Since 23 Nov 2026 it
 * is ten hands at the casino table (`components/trial/TrialRound.tsx`), and
 * that table records nothing — no session, nothing stamped. What remains here
 * is the half that cannot go yet: devices that played the old round still
 * hold it, stamped, and the sign-in merge must keep handing it only to the
 * right account. The stamping (`markGuestRound`) and the "is it kept here"
 * question (`guestRoundIsKept`) had no caller left and are gone.
 *
 * ## The rule, for the rounds already on devices
 *
 * The old round stamped the moment it began. At sign-in, ownerless data that
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
 * A leaf module (it imports nothing), so the sign-in merge and the pages can
 * both use it.
 */

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

/** Forget the stamp — the data it described now has an owner, or is gone. */
export function clearGuestRound(): void {
  try {
    localStorage.removeItem(GUEST_SINCE_KEY)
  } catch { /* ignore */ }
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
