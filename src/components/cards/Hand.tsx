import { AnimatePresence } from 'framer-motion'
import { useRef, useEffect } from 'react'
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
export function Hand({ cards, isDealer = false, hideFirst = false, label, isActive = false, countValues }: HandProps) {
  // Track previous card count to detect initial deal vs. hit
  const prevCardCount = useRef(0)
  const isInitialDeal = prevCardCount.current === 0 && cards.length >= 2

  useEffect(() => {
    prevCardCount.current = cards.length
  })

  if (cards.length === 0) return null

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
    if (isDealer && cardIndex >= prevCardCount.current) {
      const drawIndex = cardIndex - prevCardCount.current
      return 0.6 + 0.5 + drawIndex * 1.1
    }

    // Player hit: immediate
    return 0
  }

  const displayValue = getDisplayValue(cards, hideFirst)
  const hard = hardTotal(cards)
  const isBust = !hideFirst && hard > 21 && softTotal(cards) > 21

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          isActive ? 'bg-gold text-black' : 'bg-white/10 text-white/60'
        }`}>
          {label}
        </span>
      )}

      <div className="flex -space-x-6 md:-space-x-8">
        <AnimatePresence>
          {cards.map((card, i) => (
            <div key={`${card.rank}-${card.suit}-${i}`} className="relative" style={{ zIndex: i }}>
              <PlayingCard
                card={card}
                faceDown={hideFirst && i === 1}
                animateIn={i >= prevCardCount.current || isInitialDeal}
                delay={getCardDelay(i)}
                isDealer={isDealer}
                countValue={countValues?.[i]}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Hand value badge */}
      <div className={`mt-1 px-3 py-0.5 rounded-full text-sm font-bold ${
        isBust
          ? 'bg-error text-white'
          : isDealer && hideFirst
            ? 'bg-white/10 text-white/60'
            : 'bg-white/20 text-white'
      }`}>
        {displayValue}
      </div>
    </div>
  )
}
