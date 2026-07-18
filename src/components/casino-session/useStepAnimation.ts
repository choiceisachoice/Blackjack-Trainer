import { useRef, useCallback, useEffect } from 'react'
import { useAppStore, DEALING_SPEED_MULTIPLIER } from '../../store/app-store'

export interface AnimStep {
  execute: () => void
  delayMs: number
}

/**
 * Pure setTimeout-based animation sequencer. Immune to React re-render interference.
 *
 * Usage:
 *   const anim = useStepAnimation()
 *   anim.run([
 *     { execute: () => setFoo(1), delayMs: 400 },
 *     { execute: () => setFoo(2), delayMs: 400 },
 *   ], () => console.log('done'))
 */
export function useStepAnimation() {
  const stepsRef = useRef<AnimStep[]>([])
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animatingRef = useRef(false)
  const onCompleteRef = useRef<(() => void) | null>(null)

  // Live dealing-speed multiplier (slow/normal/fast) — kept in a ref so the
  // running sequencer always uses the latest value without restarting.
  const dealingSpeed = useAppStore(s => s.dealingSpeed)
  const speedMultiplierRef = useRef(DEALING_SPEED_MULTIPLIER[dealingSpeed])
  useEffect(() => {
    speedMultiplierRef.current = DEALING_SPEED_MULTIPLIER[dealingSpeed]
  }, [dealingSpeed])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const executeNext = useCallback(() => {
    const steps = stepsRef.current
    const idx = indexRef.current

    if (idx >= steps.length) {
      animatingRef.current = false
      const cb = onCompleteRef.current
      onCompleteRef.current = null
      cb?.()
      return
    }

    const step = steps[idx]
    indexRef.current = idx + 1
    step.execute()

    if (step.delayMs <= 0) {
      // Self-recursion for zero-delay steps. Flagged because the callback names
      // the const it is being assigned to, but by the time it can run, the
      // binding holds this very (memoised, [] deps) function — the recursion
      // resolves correctly on every render.
      // eslint-disable-next-line react-hooks/immutability -- deliberate self-recursion
      executeNext()
    } else {
      timerRef.current = setTimeout(executeNext, step.delayMs * speedMultiplierRef.current)
    }
  }, [])

  const run = useCallback((steps: AnimStep[], onComplete?: () => void) => {
    clearTimer()
    stepsRef.current = steps
    indexRef.current = 0
    animatingRef.current = true
    onCompleteRef.current = onComplete ?? null
    executeNext()
  }, [clearTimer, executeNext])

  const clear = useCallback(() => {
    clearTimer()
    stepsRef.current = []
    indexRef.current = 0
    animatingRef.current = false
    onCompleteRef.current = null
  }, [clearTimer])

  const isAnimating = useCallback(() => animatingRef.current, [])

  useEffect(() => {
    return () => { clearTimer() }
  }, [clearTimer])

  return { run, clear, isAnimating }
}
