import { useRef, useEffect, useCallback } from 'react'
import { useStatsStore } from '../store/stats-store'
import { useAppStore } from '../store/app-store'
import type { TrainingMode, SessionDetails } from '../services/stats-types'

/** Minimum questions required to save a session. */
const MIN_QUESTIONS = 3

interface SessionStats {
  totalQuestions: number
  correctAnswers: number
  bestStreak: number
}

/**
 * Shared hook for saving training session stats on unmount.
 *
 * Uses refs to avoid stale closures. On unmount, if totalQuestions >= 3,
 * records the session via useStatsStore.
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

  // Keep buildDetails ref current (in an effect — refs aren't written in render).
  useEffect(() => { buildDetailsRef.current = buildDetails })

  // Persist the session once. Idempotent: whichever of unmount / pagehide fires
  // first wins, so a session is neither lost on tab-close nor double-recorded.
  const save = useCallback(() => {
    const stats = statsRef.current
    if (savedRef.current || stats.totalQuestions < MIN_QUESTIONS) return
    savedRef.current = true

    useStatsStore.getState().recordSession({
      mode,
      startTime: startTimeRef.current,
      totalQuestions: stats.totalQuestions,
      correctAnswers: stats.correctAnswers,
      bestStreak: stats.bestStreak,
      details: buildDetailsRef.current(),
      countingSystem: useAppStore.getState().selectedSystem,
    })
  }, [mode])

  useEffect(() => {
    // Reset start time when the hook mounts
    startTimeRef.current = Date.now()

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
      save() // save on in-app navigation (mode switch)
    }
  }, [save])

  return { statsRef, startTimeRef }
}
