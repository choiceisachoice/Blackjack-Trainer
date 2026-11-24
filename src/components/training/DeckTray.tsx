import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { activeLocale } from '../../i18n'
import { SpeedFelt } from './SpeedFelt'
import { TRAY_BOTTOM as BOTTOM, TRAY_GAP as GAP, TRAY_RULER_W as RULER_W, TRAY_TOP as TOP, formatDecks, levelY, separateLabels, trayGeometry } from './deck-estimation-model'

/**
 * The Deck Estimation table: the discard tray, as tall as the screen allows,
 * with a deck ruler beside it.
 *
 * While the question is open the ruler shows only its two ends — none left at
 * the top, the whole shoe at the bottom — which the tray's own rim and base
 * say anyway. Graduations next to the stack would turn the estimate into
 * reading a scale, and the estimate is the skill. Once answered the ruler is
 * filled in and two lines cross the tray: the true level (always the top of
 * the stack) and the guess, with the gap between them tinted.
 */

/** Smallest distance between the centres of the two mark labels, px. */
const LABEL_GAP = 24
/** Carbon productive standard: the stack moves while it is watched. */
const STACK_EASE = [0.2, 0, 0.38, 0.9] as const
/** Standard fast effects (M3): opacity only, never past its end. */
const MARK_EASE = [0.31, 0.94, 0.34, 1] as const

/** What was answered, for the marks. */
export interface DeckTrayAnswer {
  /** The estimate in decks remaining; null when the clock ran out first. */
  guess: number | null
  /** Whether it was scored right. */
  correct: boolean
}

/** Props of {@link DeckTray}. */
export interface DeckTrayProps {
  remainingCards: number
  totalCards: number
  /** Null while the question is open. */
  answer: DeckTrayAnswer | null
  /** The setup's precision in decks (0.5 or 1): the ruler's finest tick once revealed. */
  step?: number
  className?: string
}

/** Measures an element's content box, before paint and on every resize. */
function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
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
  return { ref, size }
}

/** The discard tray scene. Carries `discard-visual`, which must never state the answer while it is open. */
export function DeckTray({ remainingCards, totalCards, answer, step = 0.5, className = '' }: DeckTrayProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const { ref, size } = useBoxSize()
  const locale = activeLocale()
  const decks = Math.max(1, Math.round(totalCards / 52))
  const remaining = remainingCards / 52
  const { height: H, width: TW, labelW: LW } = trayGeometry(size.w, size.h)
  const trueY = levelY(remaining, totalCards / 52, H)
  const guessY = answer?.guess != null ? levelY(answer.guess, totalCards / 52, H) : null
  const [trueLabelY, guessLabelY] = guessY === null
    ? [trueY, null]
    : separateLabels(trueY, guessY, LABEL_GAP, H)
  const tone = answer?.correct ? 'success' : 'error'
  const total = LW + GAP + TW + GAP + RULER_W
  const rulerX = LW + GAP + TW + GAP
  const fade = (delay: number) => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: reduced ? 0 : 0.15, ease: MARK_EASE, delay: reduced ? 0 : delay },
  })

  // The ruler's ticks, in decks remaining from the top: the ends always, the
  // rest once answered.
  const ticks: number[] = []
  if (answer) for (let d = 0; d <= decks + 1e-9; d += step) ticks.push(Math.round(d * 2) / 2)
  else ticks.push(0, decks)

  return (
    <SpeedFelt verdict={answer ? answer.correct : null} className={className}>
      <div className="flex-1 min-h-0 flex flex-col" data-testid="discard-visual">
        <p className="shrink-0 text-center text-[0.6875rem] sm:text-xs tracking-[0.16em] uppercase text-white/50 font-semibold">
          {t('training.deckShoeTray', { n: decks })}
        </p>
        <div ref={ref} className="relative flex-1 min-h-0 mt-1" data-testid="deck-tray-zone">
          {size.h > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative shrink-0" style={{ width: total, height: TOP + H + BOTTOM }}>
                {/* The acrylic tray: the whole shoe's height, the stack rising in it. */}
                <div
                  className="absolute overflow-hidden rounded-t-[4px]"
                  style={{
                    left: LW + GAP, top: TOP, width: TW, height: H,
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03) 40%, rgba(255,255,255,0.06))',
                    border: '1px solid rgba(255,255,255,0.2)', borderBottom: 'none',
                    boxShadow: 'inset 0 0 24px rgba(0,0,0,0.25), 0 2px 10px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Full height, moved down by what is still in the shoe:
                      transform only, and the card edges travel with it
                      instead of being squashed. Integer px keep them crisp. */}
                  <motion.div
                    data-testid="discard-stack"
                    data-share={(1 - remainingCards / totalCards).toFixed(3)}
                    className="absolute inset-x-0 top-0"
                    style={{
                      height: H,
                      background:
                        'linear-gradient(90deg, rgba(0,0,0,0.16), transparent 14%, transparent 86%, rgba(0,0,0,0.18)),' +
                        ' repeating-linear-gradient(180deg, #f3f2ee 0px, #f3f2ee 2px, #c9c7c0 2px, #c9c7c0 3px)',
                      boxShadow: 'inset 0 2px 0 #ffffff, 0 -1px 4px rgba(0,0,0,0.35)',
                    }}
                    initial={false}
                    animate={{ y: trueY }}
                    transition={{ duration: reduced ? 0 : 0.24, ease: STACK_EASE }}
                  />
                  {/* The acrylic's front face: a reflection over everything. */}
                  <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[10%] w-[7%] bg-white/[0.06]" />
                </div>
                {/* The base the tray stands on. */}
                <div
                  aria-hidden
                  className="absolute rounded-b-[5px]"
                  style={{ left: LW + GAP - 5, top: TOP + H, width: TW + 10, height: 9, background: 'linear-gradient(180deg, #2a2522, #141110)' }}
                />

                {/* The ruler: decks left, read down from the top. */}
                <span
                  className="absolute text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-white/45 whitespace-nowrap"
                  style={{ right: 0, top: 2 }}
                  data-testid="deck-ruler-caption"
                >
                  {t('training.deck.rulerCaption')}
                </span>
                <div aria-hidden className="absolute w-px bg-white/30" style={{ left: rulerX, top: TOP, height: H }} />
                {ticks.map(d => {
                  const whole = Math.abs(d - Math.round(d)) < 1e-9
                  const end = d === 0 || d === decks
                  const y = TOP + levelY(d, decks, H)
                  const label = whole && (end || answer)
                  return (
                    <motion.div key={`${d}-${answer ? 'r' : 'q'}`} {...(end ? {} : fade(0))} className="absolute" style={{ left: rulerX, top: y }} data-testid="ruler-tick">
                      <span className={`absolute left-0 top-0 h-px ${whole ? 'w-2.5 bg-white/55' : 'w-1.5 bg-white/30'}`} />
                      {label && (
                        <span className="absolute left-3.5 -top-2 text-[0.6875rem] leading-4 font-semibold tabular-nums text-white/60">
                          {formatDecks(d, locale)}
                        </span>
                      )}
                    </motion.div>
                  )
                })}

                {answer && (
                  <>
                    {/* The gap between the guess and the truth. */}
                    {guessY !== null && Math.abs(guessY - trueY) > 1 && (
                      <motion.div
                        {...fade(0.02)}
                        aria-hidden
                        className="absolute"
                        style={{ left: LW + GAP, width: TW + GAP / 2 + 2, top: TOP + Math.min(guessY, trueY), height: Math.abs(guessY - trueY) }}
                        data-testid="deck-error-band"
                      >
                        {/* A light wash over the tray, and the gap measured as a bar against the ruler. */}
                        <span className={`absolute inset-y-0 left-0 ${tone === 'success' ? 'bg-success/10' : 'bg-error/12'}`} style={{ width: TW }} />
                        <span className={`absolute inset-y-0 right-0 w-[3px] rounded-full ${tone === 'success' ? 'bg-success' : 'bg-error'}`} />
                      </motion.div>
                    )}
                    {/* The true level: the top of the stack. */}
                    <motion.div {...fade(0)} className="absolute" style={{ left: 0, top: TOP, width: LW + GAP + TW + 6, height: H }}>
                      <span className="absolute h-0.5 bg-gold-bright rounded-full" style={{ left: LW - 2, right: 0, top: trueY - 1 }} />
                      <span
                        className="absolute right-[calc(100%-var(--lw))] -translate-y-1/2 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums whitespace-nowrap bg-gold-bright text-on-gold shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
                        style={{ '--lw': `${LW - 4}px`, top: trueLabelY } as CSSProperties}
                        data-testid="mark-true"
                      >
                        {t('training.deck.markTrue', { v: formatDecks(remaining, locale, true) })}
                      </span>
                    </motion.div>
                    {/* The guess. */}
                    {guessY !== null && guessLabelY !== null && answer.guess !== null && (
                      <motion.div {...fade(0.04)} className="absolute" style={{ left: 0, top: TOP, width: LW + GAP + TW + 6, height: H }}>
                        <span
                          className={`absolute border-t-2 border-dashed ${tone === 'success' ? 'border-success' : 'border-error'}`}
                          style={{ left: LW - 2, right: 0, top: guessY - 1 }}
                        />
                        <span
                          className={`absolute right-[calc(100%-var(--lw))] -translate-y-1/2 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums whitespace-nowrap text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)]
                            ${tone === 'success' ? 'bg-chip-green' : 'bg-chip-red'}`}
                          style={{ '--lw': `${LW - 4}px`, top: guessLabelY } as CSSProperties}
                          data-testid="mark-guess"
                        >
                          {t('training.deck.markYou', { v: formatDecks(answer.guess, locale) })}
                        </span>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SpeedFelt>
  )
}
