import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Reveal } from './Reveal'
import { TrialIntro } from '../trial/TrialIntro'
import { soundEngine } from '../../services/sound-engine'
import { loadedTrialRound, preloadTrialRound, type TrialRoundComponent } from './trial-round-loader'

/** The anchor the hero's second button points at. */
export const PLAY_SECTION_ID = 'play'

/** What the landing can ask of its play section. */
export interface PlaySectionHandle {
  /** Bring the section on screen and deal the first hand — the hero's "try a round". */
  start: () => void
}

/**
 * The landing's play section: the trial round, on the page a visitor lands on.
 *
 * ## Why this exists
 *
 * The pages that rank for "blackjack trainer" are trainers: a visitor can
 * play on the page itself. Ours described one and kept it a click away. This
 * section puts the round `/try` offers directly under the hero — since
 * 23 Nov 2026 ten hands at the casino table, not ten flashcards — with a
 * heading and a sentence in the prerendered HTML that say so in words.
 *
 * ## How it stays out of the first paint
 *
 * What is prerendered — and what the landing's own chunk contains — is the
 * heading, the sentence and `TrialIntro`: the empty felt and the button that
 * deals. The felt is `CasinoTable`, which the chunk carries anyway for the
 * feature tiles; the game that plays on it (the loop, the engine, the
 * verdicts) arrives later (`trial-round-loader.ts`). The intro and the round
 * share one frame of one height (`TrialStage`), so the first hand is dealt
 * onto the felt the intro showed and nothing below moves. There is no
 * loading state to flash: until the code is there the intro simply stays,
 * its button marked busy.
 *
 * ## Who sees it
 *
 * Not a signed-in visitor — the landing leaves the section out for them (see
 * `LandingPage`), which is this page's form of `/try`'s redirect. Nothing
 * else needs guarding: the round records nothing (`TrialRound`).
 */
export function PlaySection({ ref }: { ref?: Ref<PlaySectionHandle> }) {
  const { t } = useTranslation()
  const [Round, setRound] = useState<TrialRoundComponent | null>(loadedTrialRound)
  const [started, setStarted] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    void preloadTrialRound().then(component => {
      if (component) setRound(() => component)
      // No code, no round: give the button back instead of a card that waits for ever.
      else setStarted(false)
    })
  }, [])

  // The section sits right under the hero, so "near the screen" has to be
  // narrow or it would be true on arrival and the fetch would ride along with
  // the landing after all.
  useEffect(() => {
    const el = stage.current
    if (!el || loadedTrialRound() || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { observer.disconnect(); load() }
    }, { rootMargin: '120px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [load])

  /**
   * @param block - 'start' puts the stage under the header (the hero's
   *   button: the visitor is somewhere else on the page); 'nearest' only
   *   moves when part of it is covered (the section's own button).
   */
  const start = useCallback((block: ScrollLogicalPosition) => {
    // The click that asks for the first hand is the one the table's sounds
    // may start from (see `soundEngine.prime`); the deal itself runs later.
    soundEngine.prime()
    setStarted(true)
    load()
    const el = stage.current
    if (!el) return
    if (typeof el.scrollIntoView === 'function') {
      const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block })
    }
    // The hand is what the next key press belongs to. Without this, focus
    // stays on a button a screen further up (or on one that is about to go).
    el.focus({ preventScroll: true })
  }, [load])

  useImperativeHandle(ref, () => ({ start: () => start('start') }), [start])

  // A new round after the summary: the table again, whole — the summary is
  // taller on a phone, and the visitor read it to its foot. Not for the
  // first round: `start` has already scrolled, and a second scroll would cut
  // that one short.
  const rounds = useRef(0)
  const reveal = useCallback(() => {
    if (rounds.current++ === 0) return
    const el = stage.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'nearest' })
  }, [])

  const playing = started && Round !== null

  return (
    <section id={PLAY_SECTION_ID} data-testid="play-section" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
      {/* The words above the table, not beside it. Beside it the felt had
          half the section: a six-seat table at 520px is a 40px card, a
          widget. Full width it is a table — and its height is held to the
          screen (`TrialStage`), so it does not swallow the page either. */}
      <Reveal>
        <div className="max-w-[40em]">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('landing.play.eyebrow')}</div>
          <h2 id="play-title" className="mt-3 text-3xl md:text-[2.375rem] font-extrabold tracking-tight leading-tight text-balance">
            <Trans i18nKey="landing.play.title" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />
          </h2>
          <p className="mt-3.5 text-content/60 text-base">{t('landing.play.sub')}</p>
        </div>
      </Reveal>
      {/* The stage. Its height is reserved from the prerendered HTML on, so
          the round swaps in without moving the page. On a phone it runs to
          the screen's edges, as the felt does in the app. The scroll margins
          are the sticky header above (62px, and 8px of air — the stage's own
          height counts from the same `--stage-top`) and the cookie bar below,
          so "into view" means clear of both. */}
      <div
        ref={stage}
        tabIndex={-1}
        role="group"
        aria-labelledby="play-title"
        data-testid="play-stage"
        data-playing={playing || undefined}
        className="mt-8 md:mt-10 -mx-6 sm:mx-0 scroll-mt-[70px] outline-none"
        style={{ scrollMarginBottom: 'calc(var(--cookie-bar, 0px) + 12px)', ['--stage-top' as string]: '70px' }}
      >
        {playing
          ? <Round autoStart onStart={reveal} />
          : <TrialIntro onStart={() => start('nearest')} busy={started} />}
      </div>
    </section>
  )
}
