import { useEffect, useState } from 'react'

/** How long a fully typed phrase rests before it starts deleting (ms). */
const HOLD_FULL = 1600
/** Pause after a phrase is cleared, before the next one begins (ms). */
const HOLD_EMPTY = 320
/** Deletion runs at this fraction of the typing speed. */
const DELETE_FACTOR = 0.4

/**
 * Humanized per-character delay: gentle random variance around the base so
 * typing feels organic instead of metronome-mechanical, with a longer beat
 * after spaces and sentence punctuation.
 */
function humanDelay(base: number, prevChar: string): number {
  let d = base * (0.72 + Math.random() * 0.56) // ±~28%
  if (prevChar === ' ') d += base * 0.5
  else if (prevChar === '.' || prevChar === ',' || prevChar === '—') d += base * 1.2
  return d
}

/** Read the user's reduced-motion preference, guarded for non-browser/test envs. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** What {@link useTypewriter} reports on each render. */
export interface TypewriterState {
  /** The text to render right now — a prefix of the phrase being typed. */
  display: string
  /** True while the caret is idle (phrase fully typed or fully cleared) — blink it. */
  resting: boolean
  /** True when reduced motion is preferred; `display` is then the static fallback. */
  reduced: boolean
}

/**
 * Types a set of phrases out character by character, holds, deletes, and moves
 * on to the next — looping with a humanized rhythm.
 *
 * Honours `prefers-reduced-motion` by skipping the animation entirely and
 * reporting the first phrase as a static string, so callers can render a stable
 * line without branching on the media query themselves.
 *
 * @param phrases Phrases to cycle through. The first doubles as the reduced-motion fallback.
 * @param speed Base per-character typing delay in milliseconds.
 */
export function useTypewriter(phrases: readonly string[], speed = 60): TypewriterState {
  const fallback = phrases[0] ?? ''
  const [display, setDisplay] = useState('')
  const [resting, setResting] = useState(true)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReduced(true)
      setDisplay(fallback)
      return
    }

    let idx = 0
    let char = 0
    let deleting = false
    let timer: ReturnType<typeof setTimeout>

    const tick = () => {
      const full = phrases[idx] ?? ''

      if (!deleting) {
        char++
        setDisplay(full.slice(0, char))
        setResting(false)
        if (char >= full.length) {
          setResting(true) // caret blinks softly while resting
          deleting = true
          timer = setTimeout(tick, HOLD_FULL)
          return
        }
        timer = setTimeout(tick, humanDelay(speed, full[char - 1] ?? ''))
      } else {
        char--
        setDisplay(full.slice(0, char))
        setResting(false)
        if (char <= 0) {
          setResting(true)
          deleting = false
          idx = (idx + 1) % phrases.length
          timer = setTimeout(tick, HOLD_EMPTY)
          return
        }
        timer = setTimeout(tick, speed * DELETE_FACTOR * (0.8 + Math.random() * 0.4))
      }
    }

    setDisplay('')
    timer = setTimeout(tick, HOLD_EMPTY)
    return () => clearTimeout(timer)
  }, [phrases, speed, fallback])

  return { display, resting, reduced }
}
