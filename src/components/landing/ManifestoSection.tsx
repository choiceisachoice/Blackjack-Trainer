import { useTranslation } from 'react-i18next'
import { useTypewriter } from '../../hooks/use-typewriter'
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
  const { t } = useTranslation()
  /*
    Read from the active translation, not from a module constant. The sizer
    below reserves the box using the LONGEST phrase, and phrase lengths differ
    per language — a German set measured against English boxes would resize the
    heading mid-word, which is exactly the layout shift the sizer exists to
    prevent.
  */
  const phrases = t('landing.manifesto.phrases', { returnObjects: true }) as string[]
  const { display, resting, reduced } = useTypewriter(phrases, 55)
  const stable = phrases[0] ?? ''
  /** Longest phrase — reserves the heading box so typing never resizes it. */
  const longest = phrases.reduce((a, b) => (b.length > a.length ? b : a), '')

  return (
    <section className="relative border-y border-white/8 py-24 overflow-hidden
      bg-[radial-gradient(58%_70%_at_50%_50%,rgba(212,168,71,.07),transparent_72%)]">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <Reveal>
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">
            {t('landing.manifesto.eyebrow')}
          </div>
          <h2
            aria-label={stable}
            className="relative mt-6 text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.1]"
          >
            {/* Invisible sizer. A fixed min-height can't work here: the phrases
                differ in length, so on a narrow screen one wraps to three lines
                where the next needs two, and every keystroke resizes the heading
                and shifts the whole page below it (measured CLS 0.27 on mobile).
                Rendering the longest phrase invisibly reserves the tallest box at
                every breakpoint; the animated line is overlaid on top and can
                never affect layout. No text-balance — it would let the sizer and
                the overlay wrap differently. */}
            <span aria-hidden="true" className="invisible">{longest}</span>
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
              <span className="text-gold-gradient">{reduced ? stable : display}</span>
              {!reduced && <span className={`tw-caret${resting ? '' : ' tw-caret--solid'}`} />}
            </span>
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8 max-w-[46em] mx-auto flex flex-col gap-4 text-content/60 leading-relaxed">
            <p>
              {t('landing.manifesto.p1')}
            </p>
            <p>
              {t('landing.manifesto.p2')}
            </p>
            <p className="text-content/80">
              {t('landing.manifesto.p3')}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
