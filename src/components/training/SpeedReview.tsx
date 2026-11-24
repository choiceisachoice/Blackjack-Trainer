import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Card } from '../../types'
import { CardFace } from '../cards/CardFace'
import { formatTC } from '../strategy-chart/chart-primitives'
import { reviewLayout } from './speed-drill-model'
import { CardLayers } from './SpeedFelt'

/** The fade at the foot of a review that scrolls. */
const FADE = 'linear-gradient(to bottom, black calc(100% - 36px), transparent)'

/** Height of the line printed above the cards, in px (with its gap). */
const TITLE_ROOM = 30

/** Props of {@link SpeedReview}. */
export interface SpeedReviewProps {
  /** The round's cards, in dealing order. */
  cards: readonly Card[]
  /** The running count after each card. */
  runningAfter: readonly number[]
  /** Cards (by index) the hint points at; drawn with a gold ring. */
  marked?: readonly number[]
}

/**
 * The round laid out again, every card in dealing order with the true
 * running count after it — the teaching moment of the drill.
 *
 * The drill cannot know where someone's count went astray; only the final
 * answer reaches it. So it gives back the one thing that settles it: the
 * count as it should have stood after each card, to put beside the one the
 * learner remembers. The last count is the answer, and is set off in gold.
 *
 * The cards are sized to the felt (`reviewLayout`): twenty cards fill a wide
 * felt in two rows; a long round on a phone scrolls rather than shrinking the
 * ranks past reading.
 */
export function SpeedReview({ cards, runningAfter, marked = [] }: SpeedReviewProps) {
  const { t } = useTranslation()
  const zone = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLParagraphElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0, title: TITLE_ROOM })

  useLayoutEffect(() => {
    const el = zone.current
    if (!el) return
    const measure = () => {
      // The title is left out on a phone held sideways (`short:hidden`), and
      // its room goes to the cards.
      const room = title.current && title.current.offsetParent !== null ? TITLE_ROOM : 0
      const next = { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight), title: room }
      setSize(s => (s.w === next.w && s.h === next.h && s.title === next.title ? s : next))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = reviewLayout(size.w, size.h - size.title, cards.length)
  const cw = layout.cardWidth
  const ch = Math.round((cw * 7) / 5)
  // The compact face below ~110 px: its index is the rank at a glance; the
  // full standard face above it, layered as on the running card.
  const full = cw >= 110
  const labelSize = cw < 56 ? 'text-xs' : cw < 90 ? 'text-sm' : 'text-base'
  const last = cards.length - 1

  return (
    <div ref={zone} className="relative flex-1 min-h-0" data-testid="speed-review">
      <div
        className={`absolute inset-0 ${layout.scroll ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}`}
        // A round too long for the felt scrolls; the fade at the foot says there is more.
        style={layout.scroll ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
        data-scroll={layout.scroll ? 'true' : undefined}
      >
        <div className={`min-h-full flex flex-col items-center ${layout.scroll ? 'justify-start pb-8' : 'justify-center'}`}>
          <p
            ref={title}
            className="short:hidden shrink-0 text-[0.6875rem] sm:text-xs font-bold uppercase tracking-[0.22em] text-gold-bright/75 text-center"
            style={{ height: TITLE_ROOM - 10, marginBottom: 10, lineHeight: `${TITLE_ROOM - 10}px` }}
          >
            {t('training.speed.reviewTitle')}
          </p>
          <ol
            className="grid"
            style={{ gridTemplateColumns: `repeat(${layout.cols}, ${cw}px)`, columnGap: layout.gap, rowGap: layout.gap }}
            aria-label={t('training.speed.reviewTitle')}
          >
            {cards.map((card, i) => {
              const isMarked = marked.includes(i)
              const isLast = i === last
              const rc = runningAfter[i] ?? 0
              return (
                <li
                  key={i}
                  className="flex flex-col items-center"
                  data-testid="review-card"
                  data-index={i}
                  data-marked={isMarked ? 'true' : undefined}
                >
                  <div
                    className={`relative isolate overflow-hidden shadow-[0_6px_14px_-6px_rgba(0,0,0,0.7)]
                      ${isMarked ? 'ring-2 ring-gold-bright ring-offset-2 ring-offset-[#0d4a2b]' : ''}`}
                    style={{ width: cw, height: ch, borderRadius: Math.round(cw * 0.075) }}
                  >
                    {full ? <CardLayers card={card} /> : <CardFace rank={card.rank} suit={card.suit} variant="compact" />}
                  </div>
                  <span
                    className={`inline-grid place-items-center min-w-[2rem] px-1.5 rounded-full font-extrabold tabular-nums leading-none ${labelSize}
                      ${isLast ? 'bg-gold text-on-gold' : isMarked ? 'text-gold-bright' : 'text-content/90'} ${cw < 56 ? 'mt-0.5' : 'mt-1'}`}
                    style={{ height: layout.label - 6 }}
                    data-testid="review-count"
                  >
                    {formatTC(rc)}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
