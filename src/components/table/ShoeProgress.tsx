import { motion } from 'framer-motion'
import { useGameStore } from '../../store/game-store'

/**
 * Single scaling constant used by BOTH shoe and discard.
 * Guarantees: what the shoe loses in width, the discard gains in height.
 * 312 cards × 0.6 = 187px max visual size.
 */
const PIXELS_PER_CARD = 0.6

/** Shoe housing accommodates full card block + frame padding. */
const SHOE_HOUSING_WIDTH = Math.round(312 * PIXELS_PER_CARD) + 30 // ~217px
const SHOE_HOUSING_HEIGHT = 90

/** Discard acrylic container width (height is derived from the shoe size). */
const DISCARD_CONTAINER_WIDTH = 120

/**
 * Realistic horizontal card shoe (Kartenschlitten).
 *
 * - Upright housing with vertical card edges (viewed from the side)
 * - Dark wood/plastic frame, card block shrinks from left as cards are dealt
 * - Slot on the left for card output
 * - NO text, NO numbers, NO percentage indicators
 */
export function ShoeHousing({ cardCount, totalCards, penetration }: {
  cardCount: number
  totalCards: number
  penetration: number
}) {
  const blockWidth = Math.max(0, Math.round(cardCount * PIXELS_PER_CARD))

  // Cut card position: fixed distance from the RIGHT edge of the card block.
  // At 75% penetration, 25% of cards remain after the cut card.
  const cutCardRight = Math.round((1 - penetration) * totalCards * PIXELS_PER_CARD)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        style={{
          width: `${SHOE_HOUSING_WIDTH}px`,
          height: `${SHOE_HOUSING_HEIGHT}px`,
          background: 'linear-gradient(180deg, #3d2317 0%, #2c1810 100%)',
          borderRadius: '6px',
          border: '2px solid #1a0f0a',
          boxShadow:
            '0 4px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
          padding: '8px',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'flex-end',
        }}
      >
        {/* Top bevel highlight */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background:
              'linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.12), rgba(255,255,255,0.05))',
            borderRadius: '6px 6px 0 0',
          }}
        />

        {/* Card block – vertical card edges, shrinks from left */}
        <motion.div
          animate={{ width: blockWidth }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            height: '100%',
            borderRadius: '2px',
            background:
              'repeating-linear-gradient(90deg, #f5f5f5 0px, #f5f5f5 1px, #e0e0e0 1px, #e0e0e0 2px)',
            boxShadow:
              'inset 0 1px 2px rgba(0,0,0,0.1), 0 0 3px rgba(0,0,0,0.2)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'visible',
          }}
        >
          {/* Cut Card – red plastic marker */}
          <div
            style={{
              position: 'absolute',
              right: `${cutCardRight}px`,
              top: '-2px',
              width: '3px',
              height: 'calc(100% + 2px)',
              background: '#ef4444',
              borderRadius: '1px',
              boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
              zIndex: 2,
            }}
          />
        </motion.div>

        {/* Slot / opening on the left front */}
        <div
          style={{
            position: 'absolute',
            left: '-1px',
            top: '20%',
            height: '60%',
            width: '5px',
            background: '#0a0a0a',
            borderRadius: '0 3px 3px 0',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)',
          }}
        />
      </div>

      <span className="text-[0.75rem] text-content/40 uppercase tracking-widest font-medium">
        Shoe
      </span>
    </div>
  )
}

/**
 * Vertical acrylic discard tray – like a real casino.
 *
 * - Transparent acrylic container with subtle glass border
 * - Cards lie FLAT stacked on top of each other – stack grows UPWARD
 * - Horizontal card-edge lines (side view of flat stack)
 * - Dark base at the bottom
 * - Only grows when cards are collected after settlement (not during a hand)
 * - NO text, NO numbers, NO percentage indicators
 */
export function DiscardTray({
  cardCount,
  totalCards = 312,
  showTicks = true,
  pxPerCard = PIXELS_PER_CARD,
  width = DISCARD_CONTAINER_WIDTH,
}: {
  cardCount: number
  totalCards?: number
  /** Show gold per-deck graduation lines. Off for the estimation drill (no cheating). */
  showTicks?: boolean
  /** Vertical scale (pixels per card). Larger = bigger tray. */
  pxPerCard?: number
  /** Container width in px. */
  width?: number
}) {
  const stackHeight = Math.max(0, Math.round(cardCount * pxPerCard))
  const hasCards = cardCount > 0

  // The tray is a fixed physical size = the whole shoe. The stack rises within it.
  const deckPx = 52 * pxPerCard
  const numDecks = Math.max(1, Math.round(totalCards / 52))
  const trayHeight = Math.round(totalCards * pxPerCard)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        style={{
          width: `${width}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        {/* Acrylic container — fixed height = full shoe */}
        <div
          style={{
            width: '100%',
            height: `${trayHeight + 8}px`,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderBottom: 'none',
            borderRadius: '3px 3px 0 0',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            boxShadow:
              'inset 0 0 20px rgba(255, 255, 255, 0.03), 0 2px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Deck graduation ticks (one per full deck boundary) */}
          {showTicks && Array.from({ length: numDecks - 1 }, (_, i) => i + 1).map(d => (
            <div
              key={d}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: `${d * deckPx}px`,
                height: '1px',
                background: 'rgba(212, 168, 67, 0.28)',
                zIndex: 2,
              }}
            />
          ))}

          {/* Card stack – horizontal card edges, grows from bottom */}
          {hasCards && (
            <motion.div
              animate={{ height: stackHeight }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                width: '100%',
                borderRadius: '2px 2px 0 0',
                background:
                  'repeating-linear-gradient(180deg, #f0f0f0 0px, #f0f0f0 1.5px, #d4d4d4 1.5px, #d4d4d4 2.5px)',
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.08)',
                zIndex: 1,
              }}
            />
          )}
        </div>

        {/* Dark base */}
        <div
          style={{
            width: '100%',
            height: '8px',
            background: '#1c1917',
            borderRadius: '0 0 4px 4px',
          }}
        />
      </div>

      <span className="text-[0.75rem] text-content/40 uppercase tracking-widest font-medium">
        Discard
      </span>
    </div>
  )
}

/**
 * Visual shoe (right side of table).
 * Reads remainingInShoe from the store – shrinks on every dealt card.
 */
export function ShoeStack() {
  const remainingInShoe = useGameStore(s => s.remainingInShoe)
  const totalCards = useGameStore(s => s.totalCards)
  const penetration = useGameStore(s => s.rules.penetration)
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return <div style={{ width: `${SHOE_HOUSING_WIDTH}px` }} />

  return (
    <ShoeHousing
      cardCount={remainingInShoe}
      totalCards={totalCards}
      penetration={penetration}
    />
  )
}

/**
 * Visual discard tray (left side of table).
 * Reads cardsInDiscard from the store – grows only after settlement + newRound.
 */
export function DiscardStack() {
  const cardsInDiscard = useGameStore(s => s.cardsInDiscard)
  const totalCards = useGameStore(s => s.totalCards)
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return <div style={{ width: `${DISCARD_CONTAINER_WIDTH}px` }} />

  return <DiscardTray cardCount={cardsInDiscard} totalCards={totalCards} />
}
