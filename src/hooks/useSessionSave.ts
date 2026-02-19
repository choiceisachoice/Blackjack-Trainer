import { useRef, useEffect } from 'react'
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
  const startTimeRef = useRef<number>(Date.now())
  const buildDetailsRef = useRef(buildDetails)

  // Keep buildDetails ref current
  buildDetailsRef.current = buildDetails

  useEffect(() => {
    // Reset start time when the hook mounts
    startTimeRef.current = Date.now()

    return () => {
      const stats = statsRef.current
      if (stats.totalQuestions < MIN_QUESTIONS) return

      const countingSystem = useAppStore.getState().selectedSystem

      // Fire-and-forget: save on unmount
      useStatsStore.getState().recordSession({
        mode,
        startTime: startTimeRef.current,
        totalQuestions: stats.totalQuestions,
        correctAnswers: stats.correctAnswers,
        bestStreak: stats.bestStreak,
        details: buildDetailsRef.current(),
        countingSystem,
      })
    }
    // mode is stable for the lifetime of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return { statsRef, startTimeRef }
}
