import { useRef, useCallback } from 'react'

interface AnimationStep {
  action: () => void
  delayAfter: number
}

/**
 * Ref-based animation queue that runs independently of React's render cycle.
 *
 * Queue state lives in refs so React batching/re-renders cannot defeat timing.
 * Each step's `action()` runs synchronously (typically a setState call), then
 * `delayAfter` ms elapses via setTimeout before the next step runs.
 * Actions can call `enqueue()` mid-run to append more steps.
 */
export function useAnimationQueue() {
  const queueRef = useRef<AnimationStep[]>([])
  const runningRef = useRef(false)
  const cancelRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runQueue = useCallback(async () => {
    runningRef.current = true
    cancelRef.current = false

    while (queueRef.current.length > 0) {
      if (cancelRef.current) break

      const step = queueRef.current.shift()!
      step.action()

      if (step.delayAfter > 0) {
        await new Promise<void>(resolve => {
          timerRef.current = setTimeout(resolve, step.delayAfter)
        })
      }
    }

    runningRef.current = false
    cancelRef.current = false
  }, [])

  const enqueue = useCallback((action: () => void, delayAfter: number) => {
    queueRef.current.push({ action, delayAfter })
  }, [])

  const start = useCallback(() => {
    if (runningRef.current) return
    void runQueue()
  }, [runQueue])

  const cancel = useCallback(() => {
    cancelRef.current = true
    queueRef.current = []
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    runningRef.current = false
  }, [])

  const isRunning = useCallback(() => runningRef.current, [])

  return { enqueue, start, cancel, isRunning }
}
