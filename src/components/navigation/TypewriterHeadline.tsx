import { useTypewriter } from '../../hooks/use-typewriter'

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
  const { display, resting, reduced } = useTypewriter(phrases, speed)

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
