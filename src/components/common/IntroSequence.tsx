import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Rank, Suit } from '../../engine/shoe/types'
import { TeachingCard } from '../learn/TeachingVisuals'
import {
  BRIEF,
  BRIEF_MIN_VISIBLE_MS,
  CARD_AT,
  CHECK_MS,
  COMPLETE_HOLD_MS,
  COMPLETE_MS,
  EXIT_MS,
  EYEBROW,
  EYEBROW_AT,
  FILL_FROM,
  FILL_MS,
  MAX_HOLD_MS,
  MIN_VISIBLE_MS,
  READOUT_AT,
  REDUCED_VISIBLE_MS,
  RISE_MS,
  STATUS,
  STATUS_DONE,
  TRACK_AT,
  WORDMARK_AT,
  WORDMARK_LIGHT,
  WORDMARK_STRONG,
  percentAt,
  progressAt,
} from './intro-sequence'

/**
 * Where the app draws its first line: the landing page's sticky header and the
 * trainer's NavBar are both 62px tall with a `border-white/8` under them.
 */
const HEADER_Y = 62

/** The app's own `border-white/8`. */
const HAIRLINE = 'rgba(255, 255, 255, 0.08)'

/**
 * The track's width when there is no wordmark to take a measure from.
 *
 * Viewport units, not a percentage, and that is the whole point. The stage is a
 * grid cell with `place-items-center`, so it is shrink-to-fit: a percentage
 * width resolves against a parent that has no definite width of its own and
 * collapses to the intrinsic width of whatever else is in the column. With the
 * wordmark present that was invisible — the measured pixel value won. Without
 * it, the track quietly took 58% of the status line: about 113px, with the
 * rider card travelling that and stopping.
 *
 * The ceiling matches the wordmark's own width at desktop sizes, so the
 * abbreviated track reads as the same object as the full one rather than a
 * different, wider bar.
 */
const TRACK_W_FALLBACK = 'min(72vw, 620px)'

/**
 * The motion language, in two curves.
 *
 * `ARRIVE` has a long tail: things come in quickly and settle slowly, which is
 * what reads as weight. `LEAVE` accelerates away. Nothing else on this screen
 * invents a curve of its own — a consistent motion language is mostly a matter
 * of not doing that.
 */
const ARRIVE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const LEAVE = 'cubic-bezier(0.7, 0, 0.84, 0)'

/** The slot, and the card riding through it. */
const TRACK_H = 22
const CARD_W = 24
const CARD_H = 34

/**
 * The card on the bar.
 *
 * An ace of spades, and rendered by the app's own `TeachingCard` rather than by
 * a rounded rectangle invented here. Two reasons: it is a real card with a rank
 * and a pip instead of a white block that has to be explained, and it is the
 * same card the rest of the product draws — the loading screen and the trainer
 * speak one visual language rather than two that happen to be near each other.
 *
 * The ace because in blackjack it is the card everything turns on: it is what
 * makes a blackjack, and the only card worth two different values.
 */
const RIDER = { rank: Rank.Ace, suit: Suit.Spades }

/**
 * The welcome loading screen.
 *
 * A greeting, the name, and a slot with a card being pushed through it. The
 * track is the width of the wordmark and is visible and empty before anything
 * fills it. The fill runs at one constant tempo, stops at 89% while the app is
 * still loading, completes when it is ready, and then the track widens and rises
 * to become the app's header border.
 *
 * ## How it is driven
 *
 * One `requestAnimationFrame` loop writes the fill's `scaleX`, the card's
 * `translateX` and the readout's text straight to the DOM. **React re-renders
 * exactly twice for the whole sequence** — once to leave, once when finished.
 * Driving the bar from state would mean a render per frame or a stepped bar;
 * driving it from a CSS transition alone could not express the hold. Three
 * property writes per frame cost nothing and keep the bar, the card and the
 * number exactly in step, because all three come from one function of one clock.
 *
 * The entrances are CSS: every piece of type sits in an `overflow: hidden` mask
 * and moves on `transform` alone, so it rises into view from behind its own edge
 * and leaves the same way. Opacity is never animated on type.
 */
export function IntroSequence({
  appReady = true,
  onFinish,
  onLeaving,
  brief = false,
}: {
  /** Whether the app behind this screen has finished loading. */
  appReady?: boolean
  onFinish: () => void
  /**
   * Fired once, the moment the exit begins — `EXIT_MS` before `onFinish`.
   *
   * The two are not the same event and collapsing them is what put a hole in
   * the handover. The app's own entrance takes 380ms; if it may not start until
   * this screen has finished leaving, the curtain pulls back on nothing and the
   * page is black for about seven hundred milliseconds before the hero arrives.
   * This is the cue to start the app coming up *behind* the curtain, so the two
   * cross instead of queueing.
   */
  onLeaving?: () => void
  /**
   * Drop the introduction and show only the progress.
   *
   * For a repeat load inside the same session. See `BRIEF` for why this exists
   * rather than simply playing the full sequence faster.
   */
  brief?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const [leaving, setLeaving] = useState(false)

  /**
   * The timeline in force.
   *
   * Memoised on `brief`, which never changes for a given mount — and that
   * matters more than it looks: this object is a dependency of the frame loop,
   * and a fresh identity each render would restart the clock every time, which
   * is exactly the bug that made the bar stutter and appear to hang.
   */
  const T = useMemo(
    () =>
      brief
        ? { ...BRIEF, MIN_VISIBLE_MS: BRIEF_MIN_VISIBLE_MS, EYEBROW_AT: 0, WORDMARK_AT: 0 }
        : {
            EYEBROW_AT, WORDMARK_AT, TRACK_AT, READOUT_AT, CARD_AT, RISE_MS,
            FILL_FROM, FILL_MS, COMPLETE_MS, COMPLETE_HOLD_MS, EXIT_MS, MIN_VISIBLE_MS,
          },
    [brief],
  )
  /**
   * Reaching 100% is a state, not a frame on the way out.
   *
   * Without it the bar filled and then the screen simply sat there until a timer
   * elsewhere decided to leave — the wait had no content and read as a hang.
   * This is the one extra React render in the whole sequence, and it buys the
   * only thing the screen was missing: a conclusion.
   */
  const [complete, setComplete] = useState(false)
  /**
   * The type does not start moving until its face has arrived.
   *
   * With `font-display: swap` the fallback renders first and the real face
   * swaps in whenever it lands — and if that happens mid-animation, the line
   * re-measures and the rise visibly catches. Waiting costs nothing in practice
   * (the face is preloaded, so this resolves almost immediately) and removes the
   * hitch entirely.
   */
  const [typeReady, setTypeReady] = useState(
    () => typeof document === 'undefined' || !document.fonts,
  )

  useEffect(() => {
    if (typeReady) return
    let alive = true
    document.fonts.ready.then(() => { if (alive) setTypeReady(true) })
    return () => { alive = false }
  }, [typeReady])

  const fillRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const readoutRef = useRef<HTMLSpanElement | null>(null)
  const wordRef = useRef<HTMLHeadingElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)

  const readyRef = useRef(appReady)
  readyRef.current = appReady

  /**
   * The measured width, read by the loop through a ref.
   *
   * It must not be a dependency of the animation effect. It was, and the
   * consequence was invisible in the code and obvious on screen: the layout
   * effect measures the wordmark, sets the width, the animation effect re-runs
   * because its dependency changed — and the clock starts again from zero. The
   * sequence quietly played its opening twice, which is the stutter and the
   * apparent hang. Under StrictMode's double mount it happened twice more.
   */
  const barWRef = useRef(0)

  const [barW, setBarW] = useState(0)
  const [barRise, setBarRise] = useState(0)
  const finished = useRef(false)
  const mountedAt = useRef(0)

  useEffect(() => { mountedAt.current = Date.now() }, [])

  /**
   * The track takes the wordmark's width.
   *
   * Measured rather than guessed, and it is what makes the block read as one
   * object instead of a heading with a rule underneath it. Re-measured on resize
   * because the wordmark is fluid.
   */
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    // Absent in the abbreviated timeline — there is no wordmark to take a
    // measure from, so the track falls back to its own share of the viewport.
    const word = wordRef.current
    const measure = () => {
      if (word) setBarW(word.getBoundingClientRect().width)
      // The card rides the *track*, so its travel is the track's own rendered
      // width — not the wordmark's. They are the same number whenever there is
      // a wordmark, and reading the wrong one is invisible until there isn't:
      // the card would have sat still at zero for the whole of a brief load.
      barWRef.current = track.getBoundingClientRect().width
      setBarRise(track.getBoundingClientRect().top - HEADER_Y)
    }
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    if (word) observer.observe(word)
    return () => observer.disconnect()
  }, [])

  /**
   * The reduced-motion path waits for the app too.
   *
   * The preference is about movement, not about being handed the product before
   * it exists — a fixed timer here would drop someone straight onto a half-built
   * screen.
   */
  useEffect(() => {
    if (!reduced || !appReady) return
    const remaining = Math.max(0, REDUCED_VISIBLE_MS - (Date.now() - mountedAt.current))
    const t = setTimeout(() => setLeaving(true), remaining)
    return () => clearTimeout(t)
  }, [reduced, appReady])

  useEffect(() => {
    if (!reduced) return
    const t = setTimeout(() => setLeaving(true), MAX_HOLD_MS)
    return () => clearTimeout(t)
  }, [reduced])

  // The loop. Three DOM writes a frame, no React renders.
  useEffect(() => {
    if (reduced) return

    let raf = 0
    let start: number | null = null
    let readyAt: number | null = null
    let shown = -1
    let done = false

    const frame = (now: number) => {
      start ??= now
      const elapsed = now - start

      // The valve is folded into the clock: past the ceiling the screen treats
      // the app as ready and completes, rather than holding on a screen that has
      // no controls to escape from.
      if (readyAt === null && (readyRef.current || elapsed >= MAX_HOLD_MS)) readyAt = elapsed

      const progress = progressAt(elapsed, readyAt, T)

      if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`
      if (cardRef.current) cardRef.current.style.transform = `translateX(${progress * barWRef.current}px)`

      // Only touch the text node when the integer actually changes; assigning
      // the same string every frame is work the browser cannot skip for us.
      const pct = percentAt(progress)
      if (pct !== shown && readoutRef.current) {
        readoutRef.current.textContent = String(pct).padStart(2, '0')
        shown = pct
      }

      if (progress >= 1 && !done) {
        done = true
        setComplete(true)
      }
      // Full, and then held: the completed bar is a state worth seeing, not a
      // frame to pass through on the way out.
      if (progress >= 1 && elapsed >= T.MIN_VISIBLE_MS + T.COMPLETE_HOLD_MS) {
        setLeaving(true)
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reduced, T])

  useEffect(() => {
    if (!leaving || finished.current) return
    finished.current = true
    onLeaving?.()
    const done = setTimeout(onFinish, reduced ? 220 : T.EXIT_MS)
    return () => clearTimeout(done)
  }, [leaving, onFinish, onLeaving, reduced, T])

  /**
   * The completion moment belongs to the ceremony.
   *
   * A repeat load has nothing to announce — the bar simply reaches full and the
   * screen leaves. Gating the *swap* on this too, not just the completion layer,
   * is what stops the abbreviated version clearing its own composition away and
   * replacing it with nothing.
   */
  const showCompletion = complete && !brief

  const rise = (at: number) =>
    reduced || leaving || !typeReady ? undefined : `rise ${T.RISE_MS}ms ${ARRIVE} ${at}ms both`
  const exitUp = (ms: number, delay = 0) =>
    leaving
      ? { transform: 'translateY(-118%)', transition: `transform ${ms}ms ${LEAVE} ${delay}ms` }
      : {}

  return (
    <div
      data-testid="intro-sequence"
      className="absolute inset-0 overflow-hidden flex flex-col items-center justify-center px-6"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {/*
        The ground is its own layer rather than a background on the container:
        the line has to stay fully opaque while it travels to the header, and
        anything inside a fading parent fades with it.
      */}
      <div
        className="absolute inset-0"
        style={{
          background: '#070809',
          opacity: leaving ? 0 : 1,
          // Held opaque for the first 180ms of the exit so the composition is
          // seen to leave *before* the ground behind it goes.
          transition: `opacity ${Math.max(80, T.EXIT_MS - 180)}ms ${LEAVE} 180ms`,
        }}
      />

      {/*
        Two layers in one grid cell: the loading composition, and the completion
        that replaces it. Stacking them rather than swapping the markup means the
        two can cross in the middle of the screen without the layout moving under
        either of them — the centre stays the centre.
      */}
      <div className="relative grid place-items-center">
      <div
        className="flex flex-col items-center"
        style={{
          gridArea: '1 / 1',
          transform: showCompletion ? 'translateY(-26px)' : undefined,
          opacity: showCompletion ? 0 : 1,
          transition: showCompletion
            ? `transform 320ms ${LEAVE}, opacity 240ms ${LEAVE}`
            : undefined,
          pointerEvents: showCompletion ? 'none' : undefined,
        }}
      >
        {/*
          The introduction — the only part a returning visitor does not get. What
          stays below is the whole of the loading screen proper: the track, the
          card, the count. Saying "Welcome to BlackjackTrainer.com" to someone on
          their fourth session of the day is not a welcome, it is a toll booth.
        */}
        {!brief && (
          <>
            <Mask>
              <span
                className="block uppercase text-[clamp(0.8rem,1.6vw,1.05rem)]"
                style={{
                  fontWeight: 700,
                  // Wide tracking adds space after the last letter; giving it back
                  // as padding is what keeps a centred line optically centred.
                  letterSpacing: '0.4em',
                  paddingLeft: '0.4em',
                  color: 'rgba(236,233,228,0.46)',
                  animation: rise(T.EYEBROW_AT),
                  ...exitUp(320),
                }}
              >
                {EYEBROW}
              </span>
            </Mask>

            <Mask className="mt-[0.44em]">
              <h1
                ref={wordRef}
                className="block whitespace-nowrap text-[clamp(1.7rem,5.6vw,3.5rem)]"
                style={{
                  fontWeight: 700,
                  letterSpacing: '-0.036em',
                  lineHeight: 0.96,
                  color: 'rgba(236,233,228,0.96)',
                  animation: rise(T.WORDMARK_AT),
                  ...exitUp(380, 40),
                }}
              >
                {WORDMARK_STRONG}
                {/*
                  The suffix drops to the text weight and most of its contrast. A
                  dotcom set at the same weight as the name reads as a URL someone
                  typed; set back like this it reads as a mark someone drew.
                */}
                <span style={{ fontWeight: 400, color: 'rgba(236,233,228,0.3)' }}>
                  {WORDMARK_LIGHT}
                </span>
              </h1>
            </Mask>
          </>
        )}

        {/* The slot. Unfolds empty, then fills. */}
        <div
          className="relative mt-8"
          style={{
            width: barW || TRACK_W_FALLBACK,
            opacity: leaving ? 0 : undefined,
            transition: leaving ? 'opacity 220ms linear' : undefined,
          }}
        >
          <div
            ref={trackRef}
            className="relative overflow-hidden rounded-sm"
            style={{
              height: TRACK_H,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)',
              transformOrigin: 'center',
              animation:
                reduced || leaving ? undefined : `unfold 620ms ${ARRIVE} ${T.TRACK_AT}ms both`,
            }}
          >
            <div
              ref={fillRef}
              className="absolute inset-px origin-left rounded-[1px]"
              style={{
                background: 'rgba(236,233,228,0.92)',
                transform: `scaleX(${reduced ? 1 : 0})`,
                willChange: 'transform',
              }}
            />
          </div>

          {/*
            The card, riding the head of the fill.

            A sibling of the track rather than a child: the track clips its own
            fill, and a card inside it would be clipped with it — flush in the
            slot instead of standing proud of it, which is the difference between
            a card being pushed through and a brighter patch of bar.
          */}
          <div
            ref={cardRef}
            aria-hidden
            className="absolute drop-shadow-[0_3px_7px_rgba(0,0,0,0.55)]"
            style={{
              top: (TRACK_H - CARD_H) / 2,
              left: -CARD_W / 2,
              transform: `translateX(${reduced ? barW : 0}px)`,
              animation:
                reduced || leaving
                  ? undefined
                  : `appear 320ms ${ARRIVE} ${T.CARD_AT}ms both`,
              willChange: 'transform',
            }}
          >
            <TeachingCard card={RIDER} size="xs" />
          </div>
        </div>

        {/* Status and percentage, on the track's own measure. */}
        <div
          className="mt-3 flex items-baseline justify-between"
          style={{
            width: barW || TRACK_W_FALLBACK,
            opacity: leaving ? 0 : undefined,
            transition: leaving ? 'opacity 200ms linear' : undefined,
          }}
        >
          <Mask>
            <span
              className="block text-[0.6875rem] uppercase"
              style={{
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: 'rgba(236,233,228,0.3)',
                animation: rise(T.READOUT_AT),
              }}
              data-testid="intro-phase"
            >
              {STATUS}
            </span>
          </Mask>

          <Mask>
            <span
              className="block text-[0.6875rem]"
              style={{
                fontWeight: 700,
                letterSpacing: '0.18em',
                fontVariantNumeric: 'tabular-nums lining-nums',
                fontFeatureSettings: '"tnum" 1, "lnum" 1',
                color: 'rgba(236,233,228,0.55)',
                animation: rise(T.READOUT_AT),
              }}
            >
              <span ref={readoutRef} data-testid="intro-status">
                {reduced ? '100' : '00'}
              </span>
              <span style={{ color: 'rgba(236,233,228,0.24)' }}>&thinsp;%</span>
            </span>
          </Mask>
        </div>
      </div>

      {/*
        The completion.

        Its own moment in the middle of the screen rather than a word in the
        status row — the difference between a label that reports a state and a
        screen that announces one. Green, not gold: gold is the brand, green is
        the meaning, and a product that says "good" in its accent colour has one
        fewer signal available when something is actually wrong. This is the
        same `--color-success` the analytics use for a strong result.
      */}
      {!brief && (
      <div
        data-testid="intro-complete-layer"
        className="flex flex-col items-center"
        style={{
          gridArea: '1 / 1',
          color: 'var(--color-success)',
          // Three states, and the third one is not optional. The ground fades
          // out 180ms into the handover; a completion layer that only knows
          // "before" and "after" keeps sitting there while it does, so the app
          // is revealed with a full-height green word hanging over it. It has to
          // clear *ahead* of the ground, not with it.
          opacity: leaving ? 0 : showCompletion ? 1 : 0,
          transform: leaving
            ? 'translateY(-64px) scale(0.97)'
            : showCompletion
              ? 'translateY(0) scale(1)'
              : 'translateY(22px) scale(0.94)',
          transition: leaving
            ? `transform 320ms ${LEAVE}, opacity 160ms linear`
            : showCompletion
              ? `transform 420ms ${ARRIVE} 120ms, opacity 300ms linear 120ms`
              : 'none',
          pointerEvents: 'none',
        }}
      >
        <span
          className="grid place-items-center rounded-full"
          style={{
            // Scales with the viewport like the type does. A fixed 78px ring
            // was proportionate to the old 48px word and looked like a status
            // icon next to the new one.
            width: 'clamp(74px, 8.4vw, 118px)',
            height: 'clamp(74px, 8.4vw, 118px)',
            border: '2px solid currentColor',
            // The ring is drawn on, not faded in: it scales from just under
            // full size so it reads as landing rather than as appearing.
            transform: complete ? 'scale(1)' : 'scale(0.82)',
            transition: complete ? `transform 460ms ${ARRIVE} 140ms` : 'none',
          }}
        >
          <svg
            viewBox="0 0 24 24" fill="none" aria-hidden
            style={{ width: '52%', height: '52%' }}
          >
            <path
              d="M4.5 12.4 L9.6 17.6 L19.5 6.8"
              stroke="currentColor" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round"
              style={{
                strokeDasharray: 30,
                strokeDashoffset: complete ? 0 : 30,
                // Starts the moment the layer becomes visible, not after the
                // ring has settled. Drawing the tick on *afterwards* is what
                // made the confirmation feel late — the same complaint as a
                // button that waits for the server before admitting it worked.
                // The mark is there as you look at it; the ring lands around it.
                transition: complete
                  ? `stroke-dashoffset ${CHECK_MS}ms cubic-bezier(0.16, 1, 0.3, 1) 120ms`
                  : 'none',
              }}
            />
          </svg>
        </span>

        <Mask className="mt-[clamp(1.25rem,2.4vw,2.5rem)]">
          <span
            className="block text-[clamp(2.4rem,7vw,5rem)]"
            style={{
              fontWeight: 700,
              letterSpacing: '-0.034em',
              lineHeight: 1,
              transform: complete ? 'translateY(0)' : 'translateY(120%)',
              transition: complete ? `transform 520ms ${ARRIVE} 180ms` : 'none',
            }}
            data-testid="intro-complete"
          >
            {STATUS_DONE}
          </span>
        </Mask>
      </div>
      )}
      </div>

      {/*
        The handover: a copy of the track that widens to the viewport and rises
        to the app's header line, where it *is* that border. Separate from the
        track above only so the composition can clear on its own timing while
        this keeps travelling.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 h-px w-full origin-center"
        style={{
          top: HEADER_Y,
          transform: leaving
            ? 'translateY(0) scaleX(1)'
            : `translateY(${Math.max(0, barRise)}px) scaleX(0.02)`,
          background: HAIRLINE,
          opacity: leaving ? 1 : 0,
          transition: `transform ${EXIT_MS}ms ${ARRIVE}, opacity 220ms linear`,
          willChange: 'transform',
        }}
      />

      <style>{KEYFRAMES}</style>
    </div>
  )
}

/**
 * A mask: type rises into view from behind its own edge, and leaves the same way.
 *
 * Fading text in is the default every interface reaches for and the reason so
 * many of them feel interchangeable. A masked reveal costs one composited
 * property, reads as a composition being uncovered rather than switched on, and
 * gives the screen one motion idea instead of an assortment.
 *
 * The padding is not decoration: `overflow: hidden` on a line of type would
 * otherwise cut the descender off "Blackjack", and the negative margin gives
 * the space back to the layout.
 */
function Mask({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`block overflow-hidden ${className}`}
      style={{ paddingBottom: '0.19em', marginBottom: '-0.19em' }}
    >
      {children}
    </span>
  )
}

const KEYFRAMES = `
@keyframes rise {
  from { transform: translateY(120%) }
  to   { transform: translateY(0) }
}
@keyframes unfold {
  from { transform: scaleY(0.1); opacity: 0 }
  40%  { opacity: 1 }
  to   { transform: scaleY(1); opacity: 1 }
}
@keyframes appear {
  from { opacity: 0 }
  to   { opacity: 1 }
}
`

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether this visitor has asked the system for less motion.
 *
 * Read directly rather than through framer-motion's hook, which resolves the
 * preference once into a module-level cache on first use. That cache is
 * invisible from here and cannot be re-read, so the branch deciding whether
 * someone sensitive to motion sits through a sequence becomes both untestable
 * and unable to notice the preference changing mid-session.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia(REDUCE_QUERY).matches,
  )

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(REDUCE_QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
