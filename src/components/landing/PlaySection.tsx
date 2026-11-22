import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Reveal } from './Reveal'
import { TrialIntro } from '../trial/TrialIntro'
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
 * section puts the round `/try` offers directly under the hero, with a
 * heading and a sentence in the prerendered HTML that say so in words.
 *
 * ## How it stays out of the first paint
 *
 * What is prerendered — and what the landing's own chunk contains — is the
 * heading, the sentence and `TrialIntro`, the same card `/try` opens on. The
 * round's code arrives later (`trial-round-loader.ts`). The stage reserves the
 * height of a hand, and the intro and the round's screens share one wrapper
 * and one card width, so the first hand appears where the intro stood and
 * nothing below moves. There is no loading state to flash: until the code is
 * there the intro simply stays, its button marked busy.
 *
 * ## Who sees it
 *
 * Not a signed-in visitor — the landing leaves the section out for them (see
 * `LandingPage`), which is this page's form of `/try`'s redirect. The other
 * two isolation rules travel inside `TrialRound`.
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

  const playing = started && Round !== null

  return (
    <section id={PLAY_SECTION_ID} data-testid="play-section" className="max-w-6xl mx-auto px-6 py-16 md:py-20">
      {/* Side by side on a wide screen: the words on the left, each column
          centring its content in the height of a hand. The columns start at
          the top (`items-start`), so when the summary makes the stage taller
          the heading stays where it was instead of sliding down beside it.
          In one column the stage's content starts at the top, right under the
          sentence — centred in the reserved height it stood 70px away from
          the words it belongs to. Between a phone and two columns the words
          are centred over the card, which is centred itself. */}
      <div className="grid gap-8 lg:gap-12 lg:grid-cols-2 lg:items-start">
        <Reveal className="lg:min-h-[25rem] lg:flex lg:items-center">
          <div className="max-w-[34em] sm:max-lg:mx-auto sm:max-lg:text-center">
            <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('landing.play.eyebrow')}</div>
            <h2 id="play-title" className="mt-3 text-3xl md:text-[2.375rem] font-extrabold tracking-tight leading-tight text-balance">
              <Trans i18nKey="landing.play.title" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />
            </h2>
            <p className="mt-3.5 text-content/60 text-base">{t('landing.play.sub')}</p>
          </div>
        </Reveal>
        {/* The stage. Its height is a hand's (question and feedback are the
            tallest screens before the summary), reserved from the prerendered
            HTML on, so the round swaps in without moving the page; a phone
            held sideways lays a hand out wider and lower. On a phone it runs to the
            screen's edges: the round brings its own side padding, and inside
            the section's as well the card would be 280px wide at 360.
            The scroll margins are the sticky header above and the cookie bar
            below, so "into view" means clear of both. */}
        <div
          ref={stage}
          tabIndex={-1}
          role="group"
          aria-labelledby="play-title"
          data-testid="play-stage"
          data-playing={playing || undefined}
          className="lg:flex lg:flex-col min-h-[25rem] short:min-h-[16.5rem] -mx-6 sm:mx-0 scroll-mt-[78px] short:scroll-mt-[66px]"
          style={{ scrollMarginBottom: 'calc(var(--cookie-bar, 0px) + 12px)' }}
        >
          {playing
            ? <Round autoStart homeLink={false} />
            : <TrialIntro onStart={() => start('nearest')} busy={started} />}
        </div>
      </div>
    </section>
  )
}
