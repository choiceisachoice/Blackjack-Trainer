import { useRef, useCallback, useEffect } from 'react'

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
      executeNext()
    } else {
      timerRef.current = setTimeout(executeNext, step.delayMs)
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
