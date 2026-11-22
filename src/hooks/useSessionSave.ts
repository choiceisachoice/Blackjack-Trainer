import { useRef, useEffect, useCallback } from 'react'
import { useStatsStore } from '../store/stats-store'
import { useAppStore } from '../store/app-store'
import type { TrainingMode, SessionDetails } from '../services/stats-types'
import { getLocalOwner } from '../services/storage/local-owner'
import { registerBeforeSignOut } from '../services/storage/before-sign-out'

/** Minimum questions required to save a session. */
const MIN_QUESTIONS = 3

interface SessionStats {
  totalQuestions: number
  correctAnswers: number
  bestStreak: number
}

/**
 * Shared hook for saving a training session and paying out its XP.
 *
 * ## Why `finish` exists
 *
 * This used to save on unmount only. That credited the XP correctly and at the
 * worst possible moment: the player finished a drill, watched the summary
 * appear, and nothing happened — the payout landed later, during navigation,
 * in a component being torn down. Achievements and challenges announce
 * themselves as they land, so those felt alive and training felt broken. The
 * mechanism was never the problem; the timing was.
 *
 * Modes now call `finish()` when they reach their summary. The unmount and
 * `pagehide` handlers stay as the safety net for someone who walks away
 * mid-session, and `savedRef` keeps all three paths idempotent — whichever
 * fires first wins, and a session is neither lost nor counted twice.
 *
 * ## Why `begin` exists
 *
 * That guard has to survive until a genuinely new session starts, or `pagehide`
 * followed by unmount would record the same drill twice. But it was only ever
 * re-armed on a bfcache restore, and the summary screens all offer a "play
 * again" that restarts the mode **without unmounting it**. So the second drill
 * of a visit ran, ended, called `finish()`, met a guard that was still closed,
 * and vanished: no session row, no accuracy, no XP, and no error anywhere.
 *
 * Modes call `begin()` from the same function that deals the first card. It
 * re-arms the guard and re-stamps the start time, which was also stale — every
 * round after the first would otherwise have reported a duration measured from
 * the moment the mode was opened.
 *
 * @param mode - Training mode identifier
 * @param buildDetails - Function that returns the mode-specific details object
 */
export function useSessionSave(
  mode: TrainingMode,
  buildDetails: () => SessionDetails
): {
  /** Ref to keep in sync with current stats. */
  statsRef: React.RefObject<SessionStats>
  /** Session start time (ms). */
  startTimeRef: React.RefObject<number>
  /**
   * Record the session now, because it just ended.
   *
   * Call this when the summary appears. Idempotent with the unmount and
   * `pagehide` handlers.
   */
  finish: () => void
  /**
   * Start a new session inside the same mounted mode.
   *
   * Call this wherever a round begins — including a restart from the summary,
   * which is the case that was silently dropping sessions before.
   */
  begin: () => void
} {
  const statsRef = useRef<SessionStats>({
    totalQuestions: 0,
    correctAnswers: 0,
    bestStreak: 0,
  })
  // Set on mount (and reset on remount) by the effect below; the initial value
  // is never used for a save, so it stays a pure constant here.
  const startTimeRef = useRef<number>(0)
  const buildDetailsRef = useRef(buildDetails)
  /** Guards against saving the same session twice (unmount + pagehide). */
  const savedRef = useRef(false)
  /**
   * Whose device data this was when the mode opened. A sign-out wipes the
   * device and only then unmounts the mode; a save at that point would write
   * the session into storage that has no owner and belongs to whoever signs
   * in next. So the sign-out saves first (below), and a save that finds the
   * owner changed does nothing.
   */
  const ownerRef = useRef<string | null>(null)

  // Keep buildDetails ref current (in an effect — refs aren't written in render).
  useEffect(() => { buildDetailsRef.current = buildDetails })

  // Persist the session once. Idempotent: whichever of unmount / pagehide fires
  // first wins, so a session is neither lost on tab-close nor double-recorded.
  const save = useCallback(() => {
    const stats = statsRef.current
    if (savedRef.current || stats.totalQuestions < MIN_QUESTIONS) return
    // `null` at the start is a device nobody owned yet (a first sign-in still
    // settling, or the app without a cloud): that session is kept.
    if (ownerRef.current !== null && getLocalOwner() !== ownerRef.current) return
    savedRef.current = true

    // Deliberately not awaited, and safe to leave that way: `recordSession`
    // applies the session and its rewards synchronously and only then attempts
    // persistence, swallowing a failure rather than rejecting. That ordering is
    // what makes this call site correct — `save` also runs from `pagehide`,
    // where anything scheduled after a suspension point may never run at all.
    void useStatsStore.getState().recordSession({
      mode,
      startTime: startTimeRef.current,
      totalQuestions: stats.totalQuestions,
      correctAnswers: stats.correctAnswers,
      bestStreak: stats.bestStreak,
      details: buildDetailsRef.current(),
      countingSystem: useAppStore.getState().selectedSystem,
    })
    // What was just recorded is spent. The figures stayed in the ref, and the
    // modes only write it when an answer is given — so finishing a session,
    // pressing Start and leaving before the first answer re-armed the guard
    // (`begin`) over the *previous* session's numbers and recorded it a
    // second time: a new timestamp, full XP, one more session towards a stage.
    statsRef.current = { totalQuestions: 0, correctAnswers: 0, bestStreak: 0 }
  }, [mode])

  useEffect(() => {
    // Reset start time when the hook mounts
    startTimeRef.current = Date.now()
    ownerRef.current = getLocalOwner()
    // Signing out mid-drill: record it while the account is still signed in.
    const unregister = registerBeforeSignOut(save)

    // Closing the tab / reloading does NOT run React unmount cleanup, so without
    // this the whole in-progress session (and its XP) would be silently lost.
    const onPageHide = () => save()
    // If the page is restored from the bfcache (mobile app-switch), allow a
    // later, more-complete save.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) savedRef.current = false }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      unregister()
      save() // save on in-app navigation (mode switch)
    }
  }, [save])

  // Re-arm for a fresh round. Both halves matter: the guard, or the round is
  // not recorded at all, and the timestamp, or its duration is measured from
  // whenever the mode was first opened.
  const begin = useCallback(() => {
    savedRef.current = false
    // The clock restarts only for a session that has no answers yet. The Speed
    // Drill calls this for every shoe of one sitting ("try again"), and
    // restamping each time measured the session from its last shoe: a ten
    // minute sitting was recorded as the final twenty seconds.
    if (statsRef.current.totalQuestions === 0) startTimeRef.current = Date.now()
  }, [])

  return { statsRef, startTimeRef, finish: save, begin }
}
