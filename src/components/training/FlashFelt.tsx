import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { Card } from '../../types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'
import { CardBack, CardFace } from '../cards/CardFace'
import { formatTC } from '../strategy-chart/chart-primitives'
import { CARD_STEP, FELT_LABEL, feltLayout, handName, type QuestionCards } from './flash-scene'

/**
 * The flashcard as a hand on the felt: the dealer's up card, the player's two
 * cards, the true count when the answer depends on it.
 *
 * The cards are sized to the felt (`feltLayout`), not to a breakpoint: a
 * question on a 2000 × 720 monitor and one on a phone get the largest cards
 * that fit, side by side on a wide low felt and the dealer above the player
 * everywhere else.
 *
 * ## The deal
 *
 * Every question deals its three cards in table order — first player card,
 * dealer, second player card — from the shoe's side (top right). A drill asks
 * a question every few seconds, so the deal is short and small: 260 ms over
 * about 60 px, 50 ms apart, the whole deal inside 360 ms (Carbon's productive
 * entrance curve, `cubic-bezier(0, 0, 0.38, 0.9)`). Transform only: a card
 * that slides in at full opacity reads as dealt, and is never left invisible
 * by a stalled frame. With reduced motion the cards do not travel; they fade
 * in over 150 ms instead (`useFadeIn`), so a new question still announces
 * itself.
 */

const DEAL_EASE = [0, 0, 0.38, 0.9] as const
const DEAL_SECONDS = 0.26
const DEAL_STAGGER = 0.05

/** Props of {@link FlashFelt}. */
export interface FlashFeltProps {
  /** The question on the felt. */
  question: FlashQuestion
  /** Its cards, dealt once per question. */
  cards: QuestionCards
  /** The question's number; a new number deals new cards. */
  deal: number
  /** Null while the question is open; whether the answer was right once it is given. */
  verdict: boolean | null
}

/**
 * Fades an element in from transparent once, on mount, by writing its opacity
 * each frame.
 *
 * Not through framer-motion: its hardware-accelerated opacity animation was
 * measured (Chromium, 23 Nov 2026) reaching 0.92 and then dropping back to 0
 * for two to three frames before settling at 1 — a flicker on every question.
 * Not through CSS either: the app's reduced-motion reset cuts every CSS
 * animation and transition to 0.01 ms, and this fade *is* the reduced-motion
 * path. A frame loop writing one inline style has neither problem, and its
 * end state is plain `opacity: 1`.
 */
function useFadeIn(ref: RefObject<HTMLDivElement | null>, enabled: boolean, ms: number) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    el.style.opacity = '0'
    let raf = 0
    let start = -1
    const tick = (now: number) => {
      if (start < 0) start = now
      const p = Math.min(1, (now - start) / ms)
      el.style.opacity = String(p)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      el.style.opacity = ''
    }
  }, [ref, enabled, ms])
}

/** One card of the size the felt allows, dealt in on mount. */
function DealtCard({ card, height, order, faceDown = false }: { card: Card | null; height: number; order: number; faceDown?: boolean }) {
  const reduced = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  useFadeIn(box, reduced === true, 150)
  const width = Math.round((height * 5) / 7)
  const style: CSSProperties = { width, height, borderRadius: Math.round(width * 0.08) }
  return (
    <motion.div
      ref={box}
      className="shrink-0 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.7),0_2px_4px_rgba(0,0,0,0.35)]"
      style={style}
      // `false` with reduced motion, not a smaller offset: the app's
      // MotionConfig turns transform animations off without clearing
      // `initial`, so an offset would strand the card off its place.
      initial={reduced ? false : { x: 56, y: -40, rotate: -6, scale: 0.94 }}
      animate={{ x: 0, y: 0, rotate: 0, scale: 1 }}
      transition={{ duration: DEAL_SECONDS, ease: DEAL_EASE, delay: order * DEAL_STAGGER }}
    >
      {faceDown || !card ? <CardBack /> : <CardFace rank={card.rank} suit={card.suit} variant="full" />}
    </motion.div>
  )
}

/**
 * A hand's place on the felt: its label, printed on the cloth, over its cards.
 *
 * `notation` is the hand as the question was written before it had cards —
 * "16", "A,7", "8,8", "Any" — kept as the hidden text of the test-id element
 * (and as a `data-` attribute). The demo recorder and the film scripts read
 * the spot from that text to choose their answers; the label is outside the
 * element so it does not join it.
 */
function Spot({ label, notation, children, ...data }: { label: string; notation: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="block text-[0.6875rem] sm:text-xs font-bold uppercase tracking-[0.22em] text-gold-bright/75 whitespace-nowrap"
        style={{ height: FELT_LABEL - 8, marginBottom: 8, lineHeight: `${FELT_LABEL - 8}px` }}
      >
        {label}
      </span>
      <div {...data}>
        <span className="sr-only" aria-hidden>{notation}</span>
        {children}
      </div>
    </div>
  )
}

/** The felt with the question's hand on it. */
export function FlashFelt({ question, cards, deal, verdict }: FlashFeltProps) {
  const { t } = useTranslation()
  const zone = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLDivElement>(null)
  const hasCount = question.trueCount !== null
  const [size, setSize] = useState({ w: 0, h: 0, chipRight: 0, chipBottom: 0 })

  // The card area's size decides the card size, and the count chip's corner
  // decides whether the hands have to clear it. Measured before paint, so the
  // first frame of a question already has its cards at their final size.
  useLayoutEffect(() => {
    const el = zone.current
    if (!el) return
    const measure = () => {
      const z = el.getBoundingClientRect()
      const c = chip.current?.getBoundingClientRect()
      const next = {
        w: Math.round(el.clientWidth),
        h: Math.round(el.clientHeight),
        chipRight: c ? Math.round(c.right - z.left + 10) : 0,
        chipBottom: c ? Math.round(c.bottom - z.top + 10) : 0,
      }
      setSize(s => (s.w === next.w && s.h === next.h && s.chipRight === next.chipRight && s.chipBottom === next.chipBottom ? s : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (chip.current) observer.observe(chip.current)
    return () => observer.disconnect()
  }, [hasCount])

  const corner = hasCount && size.chipBottom > 0 ? { right: size.chipRight, bottom: size.chipBottom } : undefined
  const { arrangement, cardHeight, offsetTop, gap } = feltLayout(size.w, size.h, corner)
  const cardWidth = Math.round((cardHeight * 5) / 7)
  const step = Math.round(cardWidth * CARD_STEP)
  const anyHand = question.hand === '*'
  const name = handName(question)
  const spot = t('try.end.hand', { hand: t(name.key, name.values), dealer: question.dealer })

  return (
    <div
      className="relative h-full min-h-0 flex flex-col rounded-[22px] sm:rounded-[28px] p-3 sm:p-5 short:p-2.5"
      style={{
        background:
          'radial-gradient(ellipse 120% 90% at 50% -10%,' +
          ' var(--color-felt) 0%,' +
          ' color-mix(in srgb, var(--color-felt) 86%, black) 50%,' +
          ' color-mix(in srgb, var(--color-felt) 60%, black) 100%)',
        border: '6px solid var(--color-wood)',
        boxShadow: '0 0 0 1px #6b4423, 0 18px 50px -18px rgba(0,0,0,0.8), inset 0 0 70px rgba(0,0,0,0.25)',
      }}
      data-testid="flash-felt"
      data-hand-kind={question.handKind}
      data-deviation={String(question.isDeviation)}
    >
      {/* The answer, at a glance: a green or red line around the whole table.
          An opacity change (150 ms effect), so it costs no layout or paint. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -inset-[7px] rounded-[28px] sm:rounded-[34px] border-2
          transition-opacity duration-150 ease-out
          ${verdict === null ? 'opacity-0 border-transparent' : verdict ? 'opacity-100 border-success/85' : 'opacity-100 border-error/85'}`}
      />

      {/* The count, when the right play depends on it: the first thing to read. */}
      {question.trueCount !== null && (
        <div
          ref={chip}
          // Once answered, a phone gives the felt's room to the verdict, which
          // states the count itself ("At TC +2 …").
          className={`${verdict !== null ? 'max-lg:hidden' : ''} absolute z-10 left-3 top-3 sm:left-5 sm:top-5 short:left-2.5 short:top-2.5 flex flex-col items-start
            rounded-xl sm:rounded-2xl bg-black/45 border border-gold/45 px-3 py-1.5 sm:px-4 sm:py-2
            shadow-[0_8px_24px_-10px_rgba(0,0,0,0.8)]`}
        >
          <span className="text-[0.625rem] sm:text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-gold-bright/80 whitespace-nowrap">
            {t('training.flash.trueCount')}
          </span>
          <span className="text-2xl sm:text-4xl short:text-2xl font-extrabold leading-none tabular-nums text-gold-bright" data-testid="true-count">
            {formatTC(question.trueCount)}
          </span>
        </div>
      )}

      {/* The cards. The inner box is absolute so what it holds can never
          change the size that was measured to size it. */}
      <div ref={zone} className="relative flex-1 min-h-0">
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center justify-center ${arrangement === 'row' ? 'flex-row' : 'flex-col'}`}
          style={{ top: offsetTop, gap }}
        >
          <Spot label={t('basics.dealer')} notation={question.dealer} data-testid="dealer-card" data-dealer={question.dealer}>
            <DealtCard key={`d${deal}`} card={cards.dealer} height={cardHeight} order={1} />
          </Spot>
          <Spot label={t('training.flash.yourHand')} notation={anyHand ? 'Any' : question.hand} data-testid="player-hand" data-hand={question.hand}>
            <div className="relative" style={{ width: cardWidth + step, height: cardHeight }}>
              <div className="absolute left-0 top-0">
                <DealtCard key={`p0-${deal}`} card={cards.player[0] ?? null} faceDown={anyHand} height={cardHeight} order={0} />
              </div>
              <div className="absolute top-0" style={{ left: step }}>
                <DealtCard key={`p1-${deal}`} card={cards.player[1] ?? null} faceDown={anyHand} height={cardHeight} order={2} />
              </div>
            </div>
          </Spot>
        </div>
      </div>

      {/* The spot in words, on narrow screens; wide ones carry it in the side panel. */}
      <p className={`lg:hidden ${verdict === null ? 'short:hidden' : ''} mt-2 short:mt-1 self-center max-w-full truncate rounded-full bg-black/35 border border-white/10
        px-4 py-1 short:py-0.5 text-base sm:text-lg short:text-sm font-bold text-content tabular-nums`}
        data-testid="spot-on-felt"
      >
        {spot}
      </p>

      {/* A table rule, printed on the cloth the way a real felt prints its own. */}
      {question.noSurrender && (
        <p
          className={`${verdict !== null ? 'max-lg:hidden' : ''} mt-2 short:mt-1 self-center text-center text-[0.625rem] sm:text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-gold-bright/70`}
          data-testid="no-surrender"
        >
          {t('training.flash.noSurrender')}
        </p>
      )}
    </div>
  )
}
