import { motion } from 'framer-motion'
import type { Card } from '../../types'
import { Suit } from '../../types'

const SUIT_SYMBOL: Record<string, string> = {
  [Suit.Hearts]: '♥',
  [Suit.Diamonds]: '♦',
  [Suit.Clubs]: '♣',
  [Suit.Spades]: '♠',
}

/** Props for the PlayingCard component. */
interface PlayingCardProps {
  /** The card to display. */
  card: Card
  /** Show the card face-down (back side). */
  faceDown?: boolean
  /** Animate the card sliding in from above with a flip. */
  animateIn?: boolean
}

/**
 * Renders a single playing card with rank and suit.
 *
 * Shows a white card face with rank/suit in corners, or a blue
 * patterned back when faceDown is true.
 */
export function PlayingCard({ card, faceDown = false, animateIn = false }: PlayingCardProps) {
  const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds
  const suitSymbol = SUIT_SYMBOL[card.suit]
  const textColor = isRed ? 'text-red-600' : 'text-gray-900'

  return (
    <motion.div
      className="relative w-[5rem] h-[7rem] md:w-[6.25rem] md:h-[8.75rem] rounded-lg shadow-lg select-none flex-shrink-0"
      initial={animateIn ? { y: -80, opacity: 0, rotateY: 90 } : false}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {faceDown ? (
        /* Card Back */
        <div className="w-full h-full rounded-lg bg-card-back border-2 border-blue-300/30 flex items-center justify-center overflow-hidden">
          <div className="w-[85%] h-[85%] rounded border border-blue-300/20"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.05) 5px, rgba(255,255,255,0.05) 10px)',
            }}
          />
        </div>
      ) : (
        /* Card Face */
        <div className={`w-full h-full rounded-lg bg-white border border-gray-300 flex flex-col justify-between p-1 md:p-1.5 ${textColor}`}>
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
      )}
    </motion.div>
  )
}
