import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowLeft, X } from 'lucide-react'
import { TOUR_STOPS, visibleStops, type TourStop } from './tour-stops'
import { placeCallout, clampToViewport, type Placement, type Rect } from './tour-geometry'
import { setTourSeen } from '../../services/recommendation'

/**
 * Starting guess for the callout's size, used only for the very first
 * placement — before the element exists there is nothing to measure.
 *
 * The height is a guess and always will be, because the text differs per stop.
 * That is exactly why it is not trusted: measured in a browser, a stop with a
 * three-line body rendered 271px against this assumed 190px and hung 69px off
 * the bottom of the window. Everything after the first frame uses the real
 * measurement.
 */
const CALLOUT = { width: 340, height: 190 }

const anchorEl = (anchor: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-testid="${anchor}"]`)

/**
 * A walk around the home screen: an arrow pointing at a thing, and a sentence
 * saying what it is for.
 *
 * ## Why a tour at all
 *
 * The app has a plan, five drills, a live table, theory, analytics and awards.
 * Someone who has answered one question about their blackjack experience knows
 * none of that, and the alternative to showing them is hoping they click
 * around until it makes sense. This is offered, never forced — it starts only
 * from the recommendation card.
 *
 * ## Two rules it follows deliberately
 *
 * **Nothing arrives from transparent.** The callout is visible on its first
 * frame. An entrance animation that starts at `opacity: 0` leaves the screen
 * empty whenever the frame it depends on does not run, and an empty overlay
 * with a dimmed page behind it is a dead end with no way out.
 *
 * **Every loop terminates.** Re-measuring after a step change runs for a bounded
 * `TRACK_MS`, not until the scroll "settles" — a loop whose exit depends on a
 * condition that may never arrive is how a page locks up.
 */
export function GuidedTour({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [stops] = useState<TourStop[]>(() =>
    visibleStops(TOUR_STOPS, a => anchorEl(a) !== null),
  )
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [place, setPlace] = useState<Placement | null>(null)
  /** The callout's real size, once there is one to measure. */
  const [size, setSize] = useState(CALLOUT)
  const calloutRef = useRef<HTMLDivElement>(null)

  const stop = stops[index] ?? null

  const finish = useCallback(() => {
    setTourSeen()
    onClose()
  }, [onClose])

  /** Read the current anchor's position and work out where the callout goes. */
  const measure = useCallback(() => {
    if (!stop) return
    const el = anchorEl(stop.anchor)
    if (!el) return
    const r = el.getBoundingClientRect()
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    // Trimmed to what is on screen: an anchor taller than the window would
    // otherwise spotlight the whole page and point the arrow past the fold.
    const box: Rect = clampToViewport(
      { top: r.top, left: r.left, width: r.width, height: r.height },
      viewport,
    )

    // The callout's own size is measured rather than assumed. Its height
    // depends on how long this stop's text is, so a fixed number is wrong for
    // most stops — and being wrong here means hanging off the bottom edge.
    const box2 = calloutRef.current
    const callout = box2
      ? { width: box2.offsetWidth, height: box2.offsetHeight }
      : CALLOUT

    setRect(box)
    setSize(callout)
    setPlace(placeCallout(box, callout, viewport))
  }, [stop])

  // Bring the anchor into view, then measure it.
  useLayoutEffect(() => {
    if (!stop) return
    const el = anchorEl(stop.anchor)
    if (!el) return

    // Scrolled instantly, not smoothly, and that is the whole trick.
    //
    // A smooth scroll animates over frames, so the position is only correct
    // once it finishes — which means chasing it with requestAnimationFrame and
    // being wrong whenever frames do not run. Measured in a browser that was
    // not compositing: the page never moved, the anchor stayed 2546px below the
    // fold, and the spotlight collapsed to a 12px sliver at the bottom edge
    // pointing at nothing.
    //
    // Jumping instantly makes the measurement true on the first try with no
    // frame dependency at all. The movement between stops still looks smooth,
    // because the spotlight and the callout carry their own CSS transition —
    // animate the highlight, not the thing you have to measure.
    el.scrollIntoView({ block: 'center', behavior: 'auto' })

    // Measured synchronously, and the lint rule below is suppressed on purpose.
    //
    // `react-hooks/set-state-in-effect` is aimed at state *derived* from props,
    // which belongs in render. This is a DOM measurement, which cannot happen
    // during render because the element has to be laid out and scrolled first —
    // and it has to happen before paint, because `rect`/`place` start as null
    // and a null placement renders nothing: a dimmed page with no callout and
    // no visible way out. The cascading render is the cheaper of the two costs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure()
  }, [stop, measure])

  // One correction pass, once the callout exists to be measured.
  //
  // The first placement of any stop necessarily uses the assumed size — on
  // mount there is no element yet, and on a stop change the height is not known
  // until the new text has been laid out. This re-places as soon as the real
  // height disagrees with the one used.
  //
  // It terminates: `measure` writes the measured height into `size`, so the
  // next run finds them equal and stops. The 1px tolerance keeps sub-pixel
  // rounding from ping-ponging forever.
  useLayoutEffect(() => {
    const el = calloutRef.current
    if (!place || !el) return
    if (Math.abs(el.offsetHeight - size.height) > 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      measure()
    }
  }, [place, size.height, measure])

  // Keep up with anything that moves the page under us.
  useEffect(() => {
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, { passive: true, capture: true })
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
    }
  }, [measure])

  // The branch is taken here rather than inside the state updater. React calls
  // updaters twice under StrictMode, so a side effect in one runs twice — and
  // `finish` writes to storage and closes the tour.
  const next = useCallback(() => {
    if (index + 1 < stops.length) setIndex(index + 1)
    else finish()
  }, [index, stops.length, finish])

  const back = useCallback(() => setIndex(i => Math.max(0, i - 1)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, next, back])

  // Nothing on the page to point at — close rather than show an empty overlay.
  useEffect(() => {
    if (stops.length === 0) finish()
  }, [stops.length, finish])

  if (!stop || !rect || !place) return null

  const last = index === stops.length - 1
  // Where the arrow leaves the callout — the edge that faces the target.
  const from = {
    x: place.side === 'left' ? place.left + size.width
      : place.side === 'right' ? place.left
      : place.left + size.width / 2,
    y: place.side === 'top' ? place.top + size.height
      : place.side === 'bottom' ? place.top
      : place.top + size.height / 2,
  }

  return (
    <div className="fixed inset-0 z-[100]" data-testid="guided-tour" role="dialog" aria-modal="true">
      {/* Dim everything, cut a hole around the anchor. The hole is a real
          element with a very large spread shadow rather than an SVG mask —
          it stays crisp at any zoom and needs no viewBox arithmetic. */}
      <div
        className="absolute rounded-xl pointer-events-none ring-2 ring-gold/70"
        data-testid="tour-spotlight"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          boxShadow: '0 0 0 9999px rgba(0,0,0,.74)',
          transition: reduced ? undefined : 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
        }}
      />

      {/* Click anywhere to move on. */}
      <button
        className="absolute inset-0 w-full h-full cursor-pointer"
        onClick={next}
        aria-label={t('tour.nextStep')}
        tabIndex={-1}
      />

      {/* The arrow itself, drawn from the callout to the thing. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
        aria-hidden
      >
        <defs>
          <marker
            id="tour-arrowhead"
            markerWidth="9"
            markerHeight="9"
            refX="7"
            refY="4.5"
            orient="auto"
          >
            <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--color-gold)" />
          </marker>
        </defs>
        <line
          x1={from.x}
          y1={from.y}
          x2={place.arrowX}
          y2={place.arrowY}
          stroke="var(--color-gold)"
          strokeWidth="2.5"
          strokeLinecap="round"
          markerEnd="url(#tour-arrowhead)"
        />
      </svg>

      {/* The callout. Positioned, not animated in — see the note at the top. */}
      <div
        ref={calloutRef}
        className="absolute surface rounded-2xl border border-gold/35 p-5 shadow-2xl"
        data-testid="tour-callout"
        style={{ top: place.top, left: place.left, width: CALLOUT.width }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-gold/80 tabular-nums">
            {index + 1} / {stops.length}
          </span>
          <button
            onClick={finish}
            data-testid="tour-skip"
            aria-label={t('tour.endTour')}
            className="grid place-items-center w-7 h-7 -mt-1 -mr-1 rounded-lg text-content/40
              hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <h3 className="mt-2 text-[1.05rem] font-bold tracking-tight" data-testid="tour-title">
          {t(stop.titleKey)}
        </h3>
        <p className="mt-1.5 text-sm text-content/65 leading-relaxed">{t(stop.bodyKey)}</p>

        <div className="mt-4 flex items-center gap-2">
          {index > 0 && (
            <button
              onClick={back}
              data-testid="tour-back"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold
                text-content/60 hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
            >
              <ArrowLeft size={14} /> {t('tour.back')}
            </button>
          )}
          <button
            onClick={next}
            data-testid="tour-next"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold
              bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer"
          >
            {last ? t('tour.done') : t('tour.next')} {!last && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
