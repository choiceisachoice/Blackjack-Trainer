import { useTypewriter } from '../../hooks/use-typewriter'
import { MANIFESTO_PHRASES } from './manifesto-phrases'
import { Reveal } from './Reveal'

/**
 * The landing's manifesto beat: a rotating, typed one-liner on a quiet stage,
 * placed between the "how it works" walkthrough and the pricing ask — the
 * emotional lift right before the visitor is asked for money.
 *
 * Deliberately its own section rather than the hero headline: the hero has to
 * be instantly scannable and already carries the WebGL animation, and two
 * competing attention magnets means neither wins.
 */
export function ManifestoSection() {
  const { display, resting, reduced } = useTypewriter(MANIFESTO_PHRASES, 55)
  const stable = MANIFESTO_PHRASES[0] ?? ''

  return (
    <section className="relative border-y border-white/8 py-24 overflow-hidden
      bg-[radial-gradient(58%_70%_at_50%_50%,rgba(212,168,71,.07),transparent_72%)]">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <Reveal>
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">
            Why counters win
          </div>
          {/* min-height reserves both possible line counts so the section never
              jumps as the phrase types and deletes. */}
          <h2
            aria-label={stable}
            className="mt-6 min-h-[2.4em] flex items-center justify-center
              text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1] text-balance"
          >
            <span aria-hidden="true">
              <span className="text-gold-gradient">{reduced ? stable : display}</span>
              {!reduced && (
                <span className={`tw-caret${resting ? '' : ' tw-caret--solid'}`} aria-hidden="true" />
              )}
            </span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8 max-w-[46em] mx-auto flex flex-col gap-4 text-content/60 leading-relaxed">
            <p>
              Counting isn’t a secret system, and it isn’t a trick the casinos haven’t noticed.
              It’s a small, measurable edge — a percent or two — that shows up only over hundreds
              of hands, and only if you play it perfectly.
            </p>
            <p>
              That means holding the count while the table talks, keeping basic strategy exact when
              you’re tired, and sizing your bets to what the shoe is actually telling you. None of
              that is knowledge you can read once. It’s a reflex, and reflexes are trained.
            </p>
            <p className="text-content/80">
              That’s the whole point of this trainer.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
