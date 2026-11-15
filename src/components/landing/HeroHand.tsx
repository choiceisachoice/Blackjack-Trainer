import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { CardFace } from '../cards/CardFace'
import { hiLoValue } from '../cards/card-suits'

/**
 * The landing hero's picture: a hand dealt onto felt, counted as it lands.
 *
 * It replaces a WebGL scene of cards and chips drifting out of fog. That scene
 * had been tuned four times and never worked, for a reason tuning could not
 * reach: its objects were small, blurred and dim by design, so the first thing
 * a visitor saw of a card-counting trainer was a dark field with smudges in it.
 *
 * This shows the product instead of decorating around it. Five sharp cards are
 * dealt, each with its Hi-Lo value, and the running count moves with every
 * card — which is the whole skill, demonstrated in four seconds to somebody
 * who has not read a word yet. The numbers are real: 2–6 count +1, 7–9 count
 * 0, tens and aces count −1.
 *
 * Rendered whole on the server and on the first client frame (the page is
 * prerendered and must not re-deal the hand the visitor is already looking
 * at); the loop starts after the first hold. With reduced motion it stays the
 * one dealt hand.
 */

interface HeroCard { rank: string; suit: 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades' }

/** Fixed hands, so the server and the client draw the same first frame. */
const HANDS: HeroCard[][] = [
  [{ rank: '5', suit: 'Hearts' }, { rank: 'K', suit: 'Spades' }, { rank: '3', suit: 'Clubs' }, { rank: '6', suit: 'Diamonds' }, { rank: '9', suit: 'Spades' }],
  [{ rank: 'A', suit: 'Spades' }, { rank: '4', suit: 'Diamonds' }, { rank: '2', suit: 'Hearts' }, { rank: 'Q', suit: 'Clubs' }, { rank: '5', suit: 'Spades' }],
  [{ rank: '10', suit: 'Hearts' }, { rank: 'J', suit: 'Clubs' }, { rank: '7', suit: 'Diamonds' }, { rank: '6', suit: 'Spades' }, { rank: 'A', suit: 'Hearts' }],
  [{ rank: '3', suit: 'Spades' }, { rank: '2', suit: 'Clubs' }, { rank: '8', suit: 'Hearts' }, { rank: '4', suit: 'Spades' }, { rank: 'K', suit: 'Diamonds' }],
]

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

const DEAL_MS = 720
const HOLD_MS = 2800

/** The dealt, counted hand shown beside the landing headline. */
export function HeroHand({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [hand, setHand] = useState(0)
  const [shown, setShown] = useState(HANDS[0].length)
  // False for the first hand: it is already on screen and must not fly in.
  const [dealing, setDealing] = useState(false)

  useEffect(() => {
    if (reduced) return
    const full = shown >= HANDS[hand].length
    const id = window.setTimeout(() => {
      setDealing(true)
      if (full) { setHand(h => (h + 1) % HANDS.length); setShown(0) }
      else setShown(s => s + 1)
    }, full ? HOLD_MS : DEAL_MS)
    return () => window.clearTimeout(id)
  }, [hand, shown, reduced])

  const cards = HANDS[hand]
  const count = cards.slice(0, shown).reduce((sum, c) => sum + hiLoValue(c.rank), 0)

  return (
    <div aria-hidden className={`select-none ${className}`} data-testid="hero-hand">
      <div className="rounded-[28px] bg-felt border-[10px] border-felt-dark px-5 pt-7 pb-6 sm:px-7 shadow-[0_24px_60px_-28px_rgba(0,0,0,.9)]">
        <div className="flex justify-center gap-2 sm:gap-3 min-h-[7rem] sm:min-h-[8.25rem]">
          {cards.map((c, i) => {
            const v = hiLoValue(c.rank)
            const on = i < shown
            return (
              <div key={`${hand}-${i}`} className="flex flex-col items-center gap-2.5" style={{ visibility: on ? 'visible' : 'hidden' }}>
                <motion.div
                  className="w-[3.1rem] sm:w-[3.9rem] aspect-[5/7] rounded-md shadow-[0_6px_14px_-4px_rgba(0,0,0,.55)]"
                  initial={dealing && on ? { x: 60, y: -70, rotate: 9, opacity: 0 } : false}
                  animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                  transition={{ duration: 0.34, ease: [0.2, 0.8, 0.25, 1] }}
                >
                  <CardFace rank={c.rank} suit={c.suit} variant="full" />
                </motion.div>
                <span className={`text-sm sm:text-base font-extrabold tabular-nums rounded-full px-2.5 py-0.5
                  ${v > 0 ? 'bg-white text-[#0b7a3b]' : v < 0 ? 'bg-white text-[#c8102e]' : 'bg-white/85 text-[#3b4048]'}`}>
                  {signed(v)}
                </span>
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex items-end justify-between border-t border-white/15 pt-4">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">{t('training.bet.runningCount')}</span>
          <span className="text-5xl sm:text-6xl font-extrabold tabular-nums leading-none text-gold-bright" data-testid="hero-count">{signed(count)}</span>
        </div>
      </div>
    </div>
  )
}
