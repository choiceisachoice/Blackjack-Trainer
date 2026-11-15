import { motion } from 'framer-motion'
import { memo, useState, useEffect, useRef } from 'react'
import type { Card } from '../../types'
import { CardFace, CardBack } from './CardFace'

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
export const PlayingCard = memo(function PlayingCard({
  card,
  faceDown = false,
  animateIn = false,
  delay = 0,
  isDealer = false,
}: PlayingCardProps) {
  // canFlip: false while the card is sliding in, true after slide completes
  const [canFlip, setCanFlip] = useState(!animateIn)

  // Track faceDown changes for dealer reveal animation.
  // The ref is written only in the effect below, i.e. after commit, so reading
  // it here yields the last *committed* value — which is exactly the intent of
  // the previous-value idiom and is safe under concurrent rendering. The rule
  // guards against refs mutated during render; this one never is.
  const prevFaceDown = useRef(faceDown)
  // eslint-disable-next-line react-hooks/refs -- deliberate previous-value read; see above
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
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
      onAnimationComplete={() => {
        if (!canFlip) setCanFlip(true)
      }}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: currentRotation }}
        transition={{
          duration: isRevealing ? 0.6 : 0.3,
          ease: 'easeInOut',
        }}
      >
        {/* Face */}
        <div className="absolute inset-0 rounded-lg shadow-lg" style={{ backfaceVisibility: 'hidden' }}>
          <CardFace rank={card.rank} suit={card.suit} variant="full" />
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-lg shadow-lg"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <CardBack />
        </div>
      </motion.div>

    </motion.div>
  )
})
