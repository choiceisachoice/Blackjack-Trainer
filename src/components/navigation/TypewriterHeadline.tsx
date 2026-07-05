import { useEffect, useState } from 'react'

/**
 * Rotating headline phrases for the home hero.
 *
 * Index 0 is the brand title. It is used as the heading's accessible name
 * (for screen readers and SEO) so the animation never exposes a half-typed
 * string to assistive tech.
 */
export const HEADLINE_PHRASES: readonly string[] = [
  'Blackjack Card Counting Trainer',
  'Turn the odds in your favor.',
  'Count the cards. Beat the house.',
  'Where discipline beats luck.',
  'Master the Hi-Lo. Own the shoe.',
  'Play the count, not the hunch.',
  'See the true count. Seize the moment.',
  'The house always wins — until you count.',
  'Bet big when the deck runs hot.',
  'From beginner to advantage player.',
  'Read the shoe like a pro.',
  'Your edge is a skill, not a secret.',
  'Sharpen your instincts, one hand at a time.',
  'Think in true counts.',
  'Patience pays — every single shoe.',
  'When the count climbs, raise your bet.',
  'Small edge, played to perfection.',
  'Basic strategy first. Deviations next.',
  'Advantage is earned, hand by hand.',
  'Train today. Table-ready tomorrow.',
]

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

interface TypewriterHeadlineProps {
  /** Phrases to cycle through. Defaults to {@link HEADLINE_PHRASES}. */
  phrases?: readonly string[]
  /** Base per-character typing delay in milliseconds. */
  speed?: number
  /** Extra classes appended to the heading. */
  className?: string
}

/**
 * Animated hero headline that types out and cycles through a set of phrases
 * with a humanized rhythm and a caret that stays steady while typing and
 * blinks softly at rest. Respects `prefers-reduced-motion` by rendering the
 * brand title statically.
 */
export function TypewriterHeadline({
  phrases = HEADLINE_PHRASES,
  speed = 60,
  className = '',
}: TypewriterHeadlineProps) {
  const brand = phrases[0] ?? ''
  const [display, setDisplay] = useState('')
  const [resting, setResting] = useState(true)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReduced(true)
      setDisplay(brand)
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
  }, [phrases, speed, brand])

  return (
    <h1
      aria-label={brand}
      className={`flex items-center justify-center text-center min-h-[2.2em]
        text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] max-w-3xl ${className}`}
    >
      <span aria-hidden="true">
        <span className="text-gold-gradient">{reduced ? brand : display}</span>
        {!reduced && (
          <span className={`tw-caret${resting ? '' : ' tw-caret--solid'}`} aria-hidden="true" />
        )}
      </span>
    </h1>
  )
}
