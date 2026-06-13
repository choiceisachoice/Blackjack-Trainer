import { useState, useEffect, useRef, useCallback } from 'react'

export interface TrailerState {
  currentTime: number      // 0-150 seconds
  isPlaying: boolean
  isPaused: boolean
  isComplete: boolean
  currentScene: number     // 1-10
  progress: number         // 0-100%
}

/** Scene boundaries in seconds. */
export const SCENE_TIMESTAMPS = {
  1:  { start: 0,   end: 10  },  // Hook
  2:  { start: 10,  end: 20  },  // Problem
  3:  { start: 20,  end: 30  },  // App Reveal
  4:  { start: 30,  end: 50  },  // Speed Drill
  5:  { start: 50,  end: 75  },  // Casino Session
  6:  { start: 75,  end: 95  },  // Level + Achievements
  7:  { start: 95,  end: 110 },  // Challenges
  8:  { start: 110, end: 125 },  // Analytics + Tracker
  9:  { start: 125, end: 135 },  // BS Chart
  10: { start: 135, end: 150 },  // CTA
} as const

export const TOTAL_DURATION = 150

/** Returns the scene number (1-10) for a given time in seconds. */
export function getCurrentScene(time: number): number {
  for (const [scene, { start, end }] of Object.entries(SCENE_TIMESTAMPS)) {
    if (time >= start && time < end) return Number(scene)
  }
  return 10
}

/**
 * Hook that drives the 150-second onboarding trailer timer.
 * Provides play/pause/stop/skip controls and audio sync.
 */
export function useTrailerTimer() {
  const [state, setState] = useState<TrailerState>({
    currentTime: 0,
    isPlaying: false,
    isPaused: false,
    isComplete: false,
    currentScene: 1,
    progress: 0,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startTimeRef = useRef<number>(0)
  const elapsedRef = useRef<number>(0)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setState(prev => ({ ...prev, isPlaying: false }))
  }, [])

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (audioRef.current) audioRef.current.pause()
    elapsedRef.current = state.currentTime
    setState(prev => ({ ...prev, isPlaying: false, isPaused: true }))
  }, [state.currentTime])

  const play = useCallback(() => {
    // Initialize audio
    if (!audioRef.current) {
      audioRef.current = new Audio('/sounds/onboarding-music.mp3')
      audioRef.current.volume = 0.7
    }

    audioRef.current.play().catch(console.warn)
    startTimeRef.current = Date.now()

    intervalRef.current = setInterval(() => {
      const elapsed = elapsedRef.current +
        (Date.now() - startTimeRef.current) / 1000

      if (elapsed >= TOTAL_DURATION) {
        stop()
        setState({
          currentTime: TOTAL_DURATION,
          isPlaying: false,
          isPaused: false,
          isComplete: true,
          progress: 100,
          currentScene: 10,
        })
        return
      }

      setState({
        currentTime: elapsed,
        isPlaying: true,
        isPaused: false,
        isComplete: false,
        currentScene: getCurrentScene(elapsed),
        progress: (elapsed / TOTAL_DURATION) * 100,
      })
    }, 50) // 20fps updates

    setState(prev => ({
      ...prev,
      isPlaying: true,
      isPaused: false,
    }))
  }, [stop])

  const skip = useCallback(() => {
    stop()
    setState({
      currentTime: TOTAL_DURATION,
      isPlaying: false,
      isPaused: false,
      isComplete: true,
      currentScene: 10,
      progress: 100,
    })
  }, [stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return { state, play, pause, stop, skip }
}
