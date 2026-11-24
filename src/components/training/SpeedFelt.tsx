import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Card } from '../../types'
import { CardFace } from '../cards/CardFace'
import { cardImageUrl } from '../cards/card-suits'
import { runCardHeight } from './speed-drill-model'

/**
 * The Speed Drill's table: the felt every phase of a round is shown on, and
 * the card being counted.
 *
 * The felt is the Flashcards felt — the same cloth, rail and verdict line —
 * so the two drills read as one product. It is drawn here rather than
 * imported because `FlashFelt` is the whole flashcard scene, not a frame.
 */

/** Props of {@link SpeedFelt}. */
export interface SpeedFeltProps {
  /** Null while the round is open; whether the answer was right once given. */
  verdict: boolean | null
  children: ReactNode
  className?: string
}

/** The felt, with a green or red line around it once the round is answered. */
export function SpeedFelt({ verdict, children, className = '' }: SpeedFeltProps) {
  return (
    <div
      className={`relative h-full min-h-0 flex flex-col rounded-[22px] sm:rounded-[28px] p-3 sm:p-5 short:p-2.5 ${className}`}
      style={{
        background:
          'radial-gradient(ellipse 120% 90% at 50% -10%,' +
          ' var(--color-felt) 0%,' +
          ' color-mix(in srgb, var(--color-felt) 86%, black) 50%,' +
          ' color-mix(in srgb, var(--color-felt) 60%, black) 100%)',
        border: '6px solid var(--color-wood)',
        boxShadow: '0 0 0 1px #6b4423, 0 18px 50px -18px rgba(0,0,0,0.8), inset 0 0 70px rgba(0,0,0,0.25)',
      }}
      data-testid="speed-felt"
    >
      {/* An opacity change (150 ms effect): no layout, no paint of the felt. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-[7px] rounded-[28px] sm:rounded-[34px] border-2
          transition-opacity duration-150 ease-out
          ${verdict === null ? 'opacity-0 border-transparent' : verdict ? 'opacity-100 border-success/85' : 'opacity-100 border-error/85'}`}
      />
      {children}
    </div>
  )
}

/**
 * A card's two layers, filling a parent that is `relative isolate` and keeps
 * the 5:7 ratio: the drawn compact face (`z-0`) under the standard deck's
 * picture (`z-10`). See {@link DrillCard} for why the order is explicit.
 *
 * The picture is an HTML `<img>`, not the SVG `<image>` that `CardFace`'s full
 * layout uses: an `<img>` is served from the page's list of images already
 * loaded (`preloadCardImages`), while an SVG image was measured asking the
 * server again — twenty cards of the round's review stood blank for over a
 * second on a busy dev server. The drawn face under it keeps every rank
 * readable in that time either way.
 */
export function CardLayers({ card }: { card: Card }) {
  return (
    <>
      <div className="absolute inset-0 z-0" data-layer="drawn">
        <CardFace rank={card.rank} suit={card.suit} variant="compact" />
      </div>
      <img
        src={cardImageUrl(card.rank, card.suit)}
        alt=""
        aria-hidden
        draggable={false}
        decoding="sync"
        className="absolute inset-0 z-10 w-full h-full select-none"
      />
    </>
  )
}

/** Props of {@link DrillCard}. */
export interface DrillCardProps {
  card: Card
  /** Height in px; the width is 5/7 of it. */
  height: number
}

/**
 * The card being counted: the standard deck's face — the picture Flashcards
 * and the table show — over the product's own drawn face.
 *
 * Two layers, in a fixed order, inside one stacking context (`isolate`):
 *
 * 1. `z-0` — `CardFace` in its compact layout: rank, suit and (for a court
 *    card) its figure, drawn as SVG. It is there for the one frame an image
 *    can be late in, so a card shown for half a second is never a blank: the
 *    drill does not wait for a picture.
 * 2. `z-10` — the image, opaque, covering the drawn face completely.
 *
 * The order is explicit because it was once implicit and wrong: the drawn
 * card's upside-down index (`rotate-180`) and its faint centre pip
 * (`opacity-20`) each made a stacking context, and stacking contexts paint
 * above an unindexed positioned image that comes before them — a stray index
 * and a grey pip over every card of the drill. Now nothing but the image sits
 * in the upper layer.
 *
 * `w-[250px] h-[350px]` and the hidden `.text-4xl` rank are kept for the demo
 * film scripts (`scripts/demo/film.mjs`, `record.mjs`), which find the card
 * and read its rank by them; the inline size wins over the classes.
 */
export function DrillCard({ card, height }: DrillCardProps) {
  const width = Math.round((height * 5) / 7)
  return (
    <div
      data-testid="drill-card"
      data-rank={card.rank}
      data-suit={card.suit}
      className="relative isolate shrink-0 w-[250px] h-[350px] overflow-hidden
        shadow-[0_14px_30px_-10px_rgba(0,0,0,0.75),0_3px_6px_rgba(0,0,0,0.35)]"
      style={{ width, height, borderRadius: Math.round(width * 0.075) }}
    >
      <CardLayers card={card} />
      <span className="sr-only text-4xl font-bold" aria-hidden>{card.rank}</span>
    </div>
  )
}

/** Carbon's productive entrance curve: decelerates in, no overshoot. */
const DEAL_EASE = [0, 0, 0.38, 0.9] as const

/**
 * The deal of one card: 120 ms over about 26 px from the shoe's side (top
 * right), with a 2° turn that settles. A card here is seen hundreds of times
 * a session and may be shown for only 500 ms, so the motion is at the short
 * end of Carbon's micro-interaction band (90–120 ms) and moves transform
 * alone: the card is at full opacity, readable, from its first frame. With
 * reduced motion the card does not travel; it is simply there — a fade would
 * cost reading time on a card that is on screen for half a second, and the
 * countdown under it refilling already marks the change.
 */
const DEAL = { duration: 0.12, ease: DEAL_EASE }

/** Space under the card for the countdown bar, in px. */
const COUNTDOWN_ROOM = 28
/** Space between the card and the box printed around its place, in px. */
const SPOT_MARGIN = 12

/** Props of {@link SpeedRunStage}. */
export interface SpeedRunStageProps {
  card: Card
  /** The card's place in the round; a new index deals a new card. */
  index: number
  /** The countdown fill, whose transform the drill's frame loop writes. */
  countdownRef: RefObject<HTMLDivElement | null>
}

/**
 * The running round on the felt: the card, as large as the felt allows, and
 * the time it has left as a bar beneath it. No count anywhere — the count is
 * the test.
 */
export function SpeedRunStage({ card, index, countdownRef }: SpeedRunStageProps) {
  const reduced = useReducedMotion()
  const zone = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Measured before paint, so the first card is already at its final size.
  useLayoutEffect(() => {
    const el = zone.current
    if (!el) return
    const measure = () => {
      const next = { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) }
      setSize(s => (s.w === next.w && s.h === next.h ? s : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const height = runCardHeight(size.w - SPOT_MARGIN * 2, size.h - COUNTDOWN_ROOM - SPOT_MARGIN * 2)
  const width = Math.round((height * 5) / 7)

  return (
    <div ref={zone} className="relative flex-1 min-h-0" data-testid="speed-run-stage">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 short:gap-3">
        {/* The card's place, printed on the cloth as a table prints its
            boxes: the card lands in it, so it never floats in an empty felt. */}
        <div
          className="relative grid place-items-center shrink-0 border border-gold-bright/25"
          style={{ width: width + SPOT_MARGIN * 2, height: height + SPOT_MARGIN * 2, borderRadius: Math.round(width * 0.075) + SPOT_MARGIN }}
          data-testid="drill-spot"
        >
          <motion.div
            key={index}
            initial={reduced ? false : { x: 22, y: -14, rotate: -2 }}
            animate={{ x: 0, y: 0, rotate: 0 }}
            transition={DEAL}
          >
            <DrillCard card={card} height={height} />
          </motion.div>
        </div>
        <div className="h-1.5 rounded-full bg-black/40 overflow-hidden shrink-0" style={{ width }}>
          <div
            ref={countdownRef}
            data-testid="drill-countdown"
            className="h-full w-full bg-gold-bright/85 rounded-full origin-left"
            // `scaleX`, not `width`: width forces layout on every frame, and
            // this one runs continuously for the length of the drill.
            style={{ transform: 'scaleX(1)', willChange: 'transform' }}
          />
        </div>
      </div>
    </div>
  )
}
