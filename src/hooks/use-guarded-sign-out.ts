import { useCallback, useRef, useState } from 'react'
import { signOutAndClearLocal } from '../services/supabase/cloud-sync'
import { getPendingSessionIds } from '../services/storage/pending-sessions'
import { LIVE_SESSION_KEY } from '../services/casino-live-session'

/** What a sign-out control needs from `useGuardedSignOut`. */
export interface GuardedSignOut {
  /** A sign-out is in flight, or has gone through. Disable the control. */
  busy: boolean
  /**
   * How many sessions could not be uploaded, while the question "sign out
   * anyway?" is open; `null` when it is not being asked.
   */
  unsavedCount: number | null
  /** Sign out. Opens the question instead if sessions would be lost. */
  signOut: () => Promise<void>
  /** The answer "sign out anyway": the sessions are given up. */
  signOutAnyway: () => Promise<void>
  /** The answer "stay signed in": closes the question, nothing else. */
  stay: () => void
}

function hasSavedTable(): boolean {
  try {
    return localStorage.getItem(LIVE_SESSION_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Make sure the code that cashes out a saved casino table is loaded.
 *
 * That code registers itself as before-sign-out work when its module loads,
 * and its module arrives with the trainer. A sign-out on a page load that
 * never opened the trainer (a reload straight onto the account page) would
 * otherwise wipe a saved table with its finished hands unrecorded. Fetched
 * only when a table is actually saved, so the account page stays small.
 * Never throws: a chunk that cannot be fetched must not block a sign-out.
 */
export async function loadSavedTableSettler(): Promise<void> {
  try {
    if (!hasSavedTable()) return
    await import('../components/casino-session/record-session')
  } catch (e) {
    console.error('the saved table could not be settled before sign-out', e)
  }
}

/**
 * The sign-out every control in the app performs, with the one question it
 * can raise.
 *
 * `signOutAndClearLocal` uploads what is waiting before it wipes the device.
 * When that upload fails it wipes nothing and answers `'unsaved'`; the person
 * is still signed in and is asked, once and calmly, whether to sign out
 * regardless. Three places sign out (the bar, the account page, the dialog
 * that pauses a casino table), and a question each of them had to remember
 * to ask is a question one of them would forget.
 *
 * @param onSignedOut Called once the device is wiped and the session is gone
 */
export function useGuardedSignOut(onSignedOut: () => void): GuardedSignOut {
  const [busy, setBusy] = useState(false)
  const [unsavedCount, setUnsavedCount] = useState<number | null>(null)
  // A ref as well: two clicks in one tick both read the same stale state.
  const inFlight = useRef(false)

  const run = useCallback(async (discardUnsaved: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    // Awaited only when there is a table: without one the sign-out starts in
    // the same tick as the click.
    if (hasSavedTable()) await loadSavedTableSettler()
    const outcome = await signOutAndClearLocal(discardUnsaved ? { discardUnsaved: true } : undefined)
    if (outcome === 'unsaved') {
      inFlight.current = false
      setBusy(false)
      setUnsavedCount(getPendingSessionIds().length)
      return
    }
    // `busy` stays set: the page is on its way out, and a second sign-out of
    // nobody has nothing to do.
    setUnsavedCount(null)
    onSignedOut()
  }, [onSignedOut])

  const signOut = useCallback(() => run(false), [run])
  const signOutAnyway = useCallback(() => run(true), [run])
  const stay = useCallback(() => setUnsavedCount(null), [])

  return { busy, unsavedCount, signOut, signOutAnyway, stay }
}
