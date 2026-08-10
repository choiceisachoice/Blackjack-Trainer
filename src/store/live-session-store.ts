import { create } from 'zustand'
import type { AppMode } from './app-store'

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
 * Four places change the mode today: the wordmark, the nav items, the training
 * plan and the summary screen. Guarding each one means the fifth is unguarded
 * the day someone adds it, and that fifth one is the bug. Everything asks
 * `requestMode` instead, and the check is impossible to route around.
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
