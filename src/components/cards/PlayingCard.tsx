import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import type { Card } from '../../types'
import { Suit } from '../../types'

const SUIT_SYMBOL: Record<string, string> = {
  [Suit.Hearts]: '\u2665',
  [Suit.Diamonds]: '\u2666',
  [Suit.Clubs]: '\u2663',
  [Suit.Spades]: '\u2660',
}

/** Props for the PlayingCard component. */
interface PlayingCardProps {
  /** The card to display. */
  card: Card
  /** Show the card face-down (back side). */
  faceDown?: boolean
  /** Animate the card sliding in from the shoe with a flip. */
  animateIn?: boolean
  /** Delay in seconds before the deal animation starts. */
  delay?: number
  /** Whether this card belongs to the dealer hand (affects slide direction). */
  isDealer?: boolean
}

/**
 * Renders a single playing card with 3D flip capability.
 *
 * When animateIn is true, the card slides from the shoe position (top-right)
 * to its target position, then flips from face-down to face-up.
 * The dealer hole card stays face-down until revealed.
 */
export function PlayingCard({
  card,
  faceDown = false,
  animateIn = false,
  delay = 0,
  isDealer = false,
}: PlayingCardProps) {
  const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds
  const suitSymbol = SUIT_SYMBOL[card.suit]
  const textColor = isRed ? 'text-red-600' : 'text-gray-900'

  // canFlip: false while the card is sliding in, true after slide completes
  const [canFlip, setCanFlip] = useState(!animateIn)

  // Track faceDown changes for dealer reveal animation
  const prevFaceDown = useRef(faceDown)
  const isRevealing = prevFaceDown.current && !faceDown

  useEffect(() => {
    prevFaceDown.current = faceDown
  })

  // Determine card rotation:
  // rotateY=0 → front face visible, rotateY=180 → back visible
  const targetRotation = faceDown ? 180 : 0
  const currentRotation = canFlip ? targetRotation : 180

  // Slide offset: from shoe (top-right of table) to target position
  const slideX = isDealer ? 200 : 280
  const slideY = isDealer ? -30 : -350

  return (
    <motion.div
      className="relative w-[5rem] h-[7rem] md:w-[6.25rem] md:h-[8.75rem] select-none flex-shrink-0"
      style={{ perspective: '800px' }}
      initial={animateIn ? { x: slideX, y: slideY, opacity: 0 } : false}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      onAnimationComplete={() => {
        if (animateIn && !canFlip) setCanFlip(true)
      }}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: currentRotation }}
        transition={{
          duration: isRevealing ? 0.4 : 0.25,
          ease: 'easeInOut',
        }}
      >
        {/* Card Face (front) */}
        <div
          className={`absolute inset-0 rounded-lg bg-white border border-gray-300 shadow-lg
            flex flex-col justify-between p-1 md:p-1.5 ${textColor}`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Top-left corner */}
          <div className="flex flex-col items-start leading-none">
            <span className="text-sm md:text-base font-bold">{card.rank}</span>
            <span className="text-sm md:text-base">{suitSymbol}</span>
          </div>

          {/* Center suit */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl md:text-3xl opacity-20">{suitSymbol}</span>
          </div>

          {/* Bottom-right corner (rotated) */}
          <div className="flex flex-col items-end leading-none rotate-180">
            <span className="text-sm md:text-base font-bold">{card.rank}</span>
            <span className="text-sm md:text-base">{suitSymbol}</span>
          </div>
        </div>

        {/* Card Back */}
        <div
          className="absolute inset-0 rounded-lg bg-card-back border-2 border-blue-300/30
            flex items-center justify-center overflow-hidden shadow-lg"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div
            className="w-[85%] h-[85%] rounded border border-blue-300/20"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.05) 5px, rgba(255,255,255,0.05) 10px)',
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}
