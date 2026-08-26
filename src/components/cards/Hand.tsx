import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import type { Card } from '../../types'
import { PlayingCard } from './PlayingCard'
import { Rank } from '../../types'

/** Props for the Hand component. */
interface HandProps {
  /** Array of cards in the hand. */
  cards: Card[]
  /** Whether this is the dealer's hand. */
  isDealer?: boolean
  /** Hide the dealer's hole card (index 1, dealt second). */
  hideFirst?: boolean
  /** Optional label for split hands (e.g. "Hand 1"). */
  label?: string
  /** Whether this hand is the currently active hand. */
  isActive?: boolean
  /** Per-card count values for easy mode badges (parallel array). */
  countValues?: number[]
  /** Delay in seconds for the new card dealt during split animation. */
  splitNewCardDelay?: number
}

/**
 * Calculates the display value for a hand.
 */
function getDisplayValue(cards: Card[], hideFirst: boolean): string {
  if (cards.length === 0) return ''
  if (hideFirst) {
    // Only show value of visible cards (upcard at index 0, skip hole card at index 1)
    const visible = [cards[0], ...cards.slice(2)]
    const val = handValue(visible)
    return val.toString()
  }
  const hard = hardTotal(cards)
  const soft = softTotal(cards)
  if (hard > 21) return `${hard} BUST`
  if (soft <= 21 && soft !== hard) return `${soft}`
  return `${hard}`
}

function hardTotal(cards: Card[]): number {
  let total = 0
  for (const c of cards) {
    total += rankValue(c.rank)
  }
  return total
}

function softTotal(cards: Card[]): number {
  const hard = hardTotal(cards)
  const hasAce = cards.some(c => c.rank === Rank.Ace)
  return hasAce && hard + 10 <= 21 ? hard + 10 : hard
}

function handValue(cards: Card[]): number {
  const soft = softTotal(cards)
  return soft <= 21 ? soft : hardTotal(cards)
}

function rankValue(rank: string): number {
  if (rank === Rank.Ace) return 1
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 10
  return parseInt(rank, 10)
}

/**
 * Renders a hand of overlapping playing cards with a value badge.
 *
 * Handles staggered deal animations for the initial deal (4-card sequence),
 * single-card hit animations, and dealer draw staggering.
 */
export function Hand({ cards, isDealer = false, hideFirst = false, label, isActive = false, countValues, splitNewCardDelay }: HandProps) {
  // The count badge pops in on scale; guarded so a reduced-motion visitor gets
  // it at full size rather than stranded at 30%.
  const reduced = useReducedMotion()
  // Track previous card count to detect initial deal vs. hit.
  // Written only in an effect (after commit), so this read yields the last
  // committed value — the previous-value idiom, safe under concurrent
  // rendering. The rule targets refs mutated during render; this one isn't.
  const prevCardCount = useRef(0)
  // eslint-disable-next-line react-hooks/refs -- deliberate previous-value read; see above
  const prevCardCountSnapshot = prevCardCount.current
  const isInitialDeal = prevCardCountSnapshot === 0 && cards.length >= 2

  /**
   * Returns the animation delay for a card based on its position in the deal sequence.
   *
   * Initial deal (~2s total):
   *   Player 1st (0s), Dealer 1st (0.5s), Player 2nd (1.0s), Dealer hole (1.5s)
   * Dealer draw: 0.6s flip + 0.5s pause, then 0.5s slide + 0.6s pause per card
   * Player hit: immediate (0s delay, 0.5s slide duration handled in PlayingCard)
   */
  function getCardDelay(cardIndex: number): number {
    if (isInitialDeal) {
      if (isDealer) {
        return cardIndex === 0 ? 0.5 : 1.5
      }
      return cardIndex === 0 ? 0 : 1.0
    }

    // Dealer drawing after reveal: stagger after hole card flip
    if (isDealer && cardIndex >= prevCardCountSnapshot) {
      const drawIndex = cardIndex - prevCardCountSnapshot
      return 0.6 + 0.8 + drawIndex * 0.8
    }

    // Player hit: immediate
    return 0
  }

  // Pre-compute animation info for each card (used by both badges and cards).
  // Flagged transitively because the delay derives from the snapshot above;
  // this closure only consumes that already-captured value, never the ref.
  // eslint-disable-next-line react-hooks/refs -- consumes the snapshot, not the ref
  const cardAnimations = cards.map((_, i) => {
    const animateIn = splitNewCardDelay !== undefined
      ? i === 1
      : i >= prevCardCountSnapshot || isInitialDeal
    const delay = splitNewCardDelay !== undefined
      ? (i === 1 ? splitNewCardDelay : 0)
      : getCardDelay(i)
    return { animateIn, delay }
  })

  const hard = hardTotal(cards)
  const computedBust = !hideFirst && hard > 21 && softTotal(cards) > 21

  // Delay showing BUST text by 500ms when a new card causes bust, so it appears
  // after the card slide animation completes.
  const [showBustText, setShowBustText] = useState(false)
  /** Which card count the running delay belongs to; -1 when none is running. */
  const bustDelayCardCount = useRef(-1)
  /** The delay itself, owned here rather than by the effect's cleanup. */
  const bustTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const newCardCausedBust = computedBust && cards.length > prevCardCountSnapshot

    // Start the delay once per bust. The guard on `bustDelayCardCount` is what
    // makes this idempotent: a re-render during the wait finds the delay already
    // claimed for this card count and leaves it alone.
    if (newCardCausedBust && bustDelayCardCount.current !== cards.length) {
      bustDelayCardCount.current = cards.length
      setShowBustText(false)
      if (bustTimer.current) clearTimeout(bustTimer.current)
      bustTimer.current = setTimeout(() => {
        bustTimer.current = null
        setShowBustText(true)
      }, 500)
      return
    }

    // Not in an active delay → sync immediately. Covers the hand resetting, a
    // hand that never busted, and a bust already on screen.
    if (bustDelayCardCount.current !== cards.length) {
      setShowBustText(computedBust)
    }
  }, [computedBust, cards.length, prevCardCountSnapshot])

  // The only place the delay is cancelled. It used to be cancelled by the
  // effect's cleanup, which runs after *every* render — so any unrelated
  // re-render inside the 500ms killed it, and nothing restarted it: by then the
  // card-count snapshot had caught up and neither branch above fires again. The
  // player was shown the total where the table meant to say BUST.
  useEffect(() => () => {
    if (bustTimer.current) clearTimeout(bustTimer.current)
  }, [])

  // Update prevCardCount ref after all reads
  useEffect(() => {
    prevCardCount.current = cards.length
  })

  const displayValue = showBustText
    ? getDisplayValue(cards, hideFirst)
    : (computedBust ? `${hard}` : getDisplayValue(cards, hideFirst))

  // Bail out AFTER every hook has run. Returning early above the hooks would
  // make this component call one hook when the hand is empty and five when it
  // isn't, so a mounted hand going from cards to empty (round reset, a split
  // being cleared, a seat emptying) breaks React's hook order.
  if (cards.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          isActive ? 'bg-gold text-on-gold' : 'bg-contrast/10 text-content/60'
        }`}>
          {label}
        </span>
      )}

      {/* Count value badges row (easy mode) — each badge fades in after its card arrives */}
      {countValues && (
        <div className="flex -space-x-6 md:-space-x-8">
          {cards.map((card, i) => {
            const isFaceDown = hideFirst && i === 1
            const val = countValues[i]
            const { animateIn: isNewCard, delay: cardDelay } = cardAnimations[i]
            // Badge appears after card slide completes (+0.5s)
            // Hole card reveal: badge appears after flip animation (0.6s)
            const isHoleCardReveal = isDealer && i === 1 && !isFaceDown && !isNewCard
            const badgeDelay = isNewCard ? cardDelay + 0.5 : (isHoleCardReveal ? 0.6 : 0)
            return (
              <div key={`badge-${card.rank}-${card.suit}-${i}-${isFaceDown}`} className="w-[5rem] md:w-[6.25rem] flex-shrink-0 flex justify-center">
                <motion.div
                  initial={reduced ? false : { opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: badgeDelay, duration: 0.2, ease: 'easeOut' }}
                  className={`w-[22px] h-[22px] rounded-full text-[0.6875rem] font-bold
                    flex items-center justify-center
                    ${isFaceDown
                      ? 'bg-contrast/20 text-content/50'
                      : val > 0 ? 'bg-success text-white' : val < 0 ? 'bg-error text-white' : 'bg-contrast/30 text-content/80'
                    }`}>
                  {isFaceDown ? '?' : val > 0 ? `+${val}` : val}
                </motion.div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex -space-x-6 md:-space-x-8">
        <AnimatePresence>
          {cards.map((card, i) => {
            const { animateIn, delay } = cardAnimations[i]

            return (
              <div key={`${card.rank}-${card.suit}-${i}`} className="relative" style={{ zIndex: i }}>
                <PlayingCard
                  card={card}
                  faceDown={hideFirst && i === 1}
                  animateIn={animateIn}
                  delay={delay}
                  isDealer={isDealer}
                />
              </div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Hand value badge */}
      <div className={`mt-1 px-3 py-0.5 rounded-full text-sm font-bold ${
        showBustText
          ? 'bg-error text-white'
          : isDealer && hideFirst
            ? 'bg-contrast/10 text-content/60'
            : 'bg-contrast/20 text-content'
      }`}>
        {displayValue}
      </div>
    </div>
  )
}
