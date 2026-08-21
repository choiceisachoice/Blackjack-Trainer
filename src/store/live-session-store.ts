import { create } from 'zustand'
import { useAppStore, type AppMode } from './app-store'

/**
 * Knows whether a training session is running, and stands between the user and
 * anything that would throw it away.
 *
 * ── Why this exists ──
 * The Casino Session keeps its engine, its shoe, its hands and its clock in
 * refs inside `useGameLoop`. `TrainerApp` renders each mode with
 * `{currentMode === 'casinoSession' && <CasinoSession />}`, so one click on the
 * wordmark unmounted the component and destroyed all of it — no warning, no
 * confirmation, and on returning `initSession()` dealt a fresh shoe. Half an
 * hour of play gone to a misclick, and nothing on screen said it would happen.
 *
 * ── Why the guard lives in a store rather than on the buttons ──
 * Many components call `setMode`. Putting the decision in one place means a new
 * caller cannot forget a rule it never knew about.
 *
 * Worth knowing, because an earlier version of this comment claimed otherwise:
 * **not** every caller routes through `requestLeave`. The NavBar and the TopBar
 * do; `HomeScreen`, `TrainingPlan`, `AnalyticsDashboard`, `DashboardHeader` and
 * `StartHere` call `setMode` directly. That is now harmless rather than lucky —
 * the guard only speaks while the user is standing on the session's own screen
 * (see `requestLeave`), and those components are only ever rendered somewhere
 * else. The Casino Session's own "home" button is on the summary, by which
 * point `endSession` has already run.
 *
 * So the complete set of navigations that can raise the dialog is: the NavBar,
 * clicked while the Casino Session is on screen and playing.
 */

/** What the user is being asked, or null when nothing is pending. */
export interface PendingLeave {
  /** Where they were trying to go. */
  readonly target: AppMode
  /** The mode holding the running session. */
  readonly from: AppMode
}

export interface LiveSessionState {
  /**
   * The mode with a session in flight, or null.
   *
   * Set when a session actually starts — not when the mode is merely opened.
   * Sitting on the configuration screen is not progress, and asking "discard
   * your session?" there would train people to click through the dialog, which
   * is how a confirmation stops protecting anything.
   */
  activeMode: AppMode | null
  /** The navigation waiting on an answer, or null. */
  pending: PendingLeave | null
}

export interface LiveSessionActions {
  /** A session has begun in `mode`. */
  beginSession(mode: AppMode): void
  /** The session finished, was abandoned, or the summary was reached. */
  endSession(): void
  /**
   * Ask to move to `target`.
   *
   * Returns true when the caller may switch immediately. Returns false when a
   * session is in flight — the dialog is then open and the answer arrives later
   * through `confirmLeave` or `cancelLeave`.
   */
  requestLeave(target: AppMode): boolean
  /** The user chose to leave. Returns the target, or null if nothing pending. */
  confirmLeave(): AppMode | null
  /** The user chose to stay. */
  cancelLeave(): void
}

export type LiveSessionStore = LiveSessionState & LiveSessionActions

const EMPTY: LiveSessionState = { activeMode: null, pending: null }

export const useLiveSessionStore = create<LiveSessionStore>((set, get) => ({
  ...EMPTY,

  beginSession(mode) {
    set({ activeMode: mode })
  },

  endSession() {
    // Also clears any pending question: a session that has ended has nothing
    // left to protect, and leaving the dialog up would ask about something that
    // no longer exists.
    set({ ...EMPTY })
  },

  requestLeave(target) {
    const { activeMode } = get()
    // Re-entering the mode you are already in is not leaving it. Without this,
    // clicking the active nav item would ask whether to discard the session the
    // click cannot possibly discard.
    if (!activeMode || target === activeMode) return true

    /*
      Ask only while the user is standing ON the session's screen.

      This is the fix for a dialog that had become noise. The Casino Session
      stays mounted in the background so a player can come back to the same
      hand, which means `activeMode` remains set for as long as that paused
      session exists — often the rest of the visit. The guard used to consult
      only `activeMode`, so *every* navigation anywhere in the app raised the
      question: Speed Drill → Home asked about the Casino Session; Analytics →
      Home asked about it; the Home button in a mode the session has nothing to
      do with asked about it. The user had already left, been asked, and
      answered.

      A confirmation that fires when nothing is at stake is worse than no
      confirmation, because it teaches the reflex to dismiss it — and the one
      moment it genuinely matters is the moment it gets clicked away unread.

      Leaving from anywhere else destroys nothing: `TrainerApp` keeps the
      session mounted while `activeMode` is set, so there is no path from
      another screen that can lose it. The single place a beat of confirmation
      earns its keep is walking away from a hand in progress, with the hand in
      front of you.
    */
    if (useAppStore.getState().currentMode !== activeMode) return true

    set({ pending: { target, from: activeMode } })
    return false
  },

  confirmLeave() {
    const { pending } = get()
    if (!pending) return null
    set({ pending: null })
    return pending.target
  },

  cancelLeave() {
    set({ pending: null })
  },
}))

/** Reactive hook: is a training session in flight? */
export function useHasLiveSession(): boolean {
  return useLiveSessionStore(s => s.activeMode !== null)
}
