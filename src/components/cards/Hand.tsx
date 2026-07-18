import { AnimatePresence, motion } from 'framer-motion'
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
  // Track previous card count to detect initial deal vs. hit
  const prevCardCount = useRef(0)
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

  // Pre-compute animation info for each card (used by both badges and cards)
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

  // Delay showing BUST text by 500ms when a new card causes bust,
  // so it appears after the card slide animation completes.
  const [showBustText, setShowBustText] = useState(false)
  const bustDelayCardCount = useRef(-1)
  useEffect(() => {
    if (computedBust && cards.length > prevCardCountSnapshot) {
      // New card causes bust → delay display
      bustDelayCardCount.current = cards.length
      setShowBustText(false)
      const t = setTimeout(() => setShowBustText(true), 500)
      return () => clearTimeout(t)
    }
    if (bustDelayCardCount.current !== cards.length) {
      // Not in an active bust delay → sync immediately
      setShowBustText(computedBust)
    }
  })

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
          isActive ? 'bg-gold text-black' : 'bg-contrast/10 text-content/60'
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
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: badgeDelay, duration: 0.2, ease: 'easeOut' }}
                  className={`w-[22px] h-[22px] rounded-full text-[10px] font-bold
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
