import { motion } from 'framer-motion'

interface ShoeVisualProps {
  /** Number of cards remaining in the shoe. */
  remainingCards: number
  /** Total cards in the shoe (e.g. 312 for 6 decks). */
  totalCards: number
  /** Penetration ratio (0-1). Cut card placed at this fraction. Default 0.75. */
  penetration?: number
  /** Visual size: 'normal' (small reference) or 'large' (deck estimation). */
  size?: 'normal' | 'large'
  /** Whether to show the cut card marker. Default true. */
  showCutCard?: boolean
}

/**
 * Pixels per deck of cards in the card block.
 * Constant across deck counts so 1-deck difference is always clearly visible.
 * Large: ~33px per deck (1 deck difference = 33px, clearly visible).
 * Normal: ~12px per deck (for small reference shoe in feedback).
 */
const PX_PER_DECK_LARGE = 33
const PX_PER_DECK_NORMAL = 12

/**
 * Cards fill ~38% of the shoe's internal length.
 * Based on real casino shoes: 6 decks (96mm) in a 25.4cm internal shoe.
 */
const CARD_FILL_RATIO = 0.38

/** Large mode fixed dimensions (px). */
const LARGE = { slot: 25, roller: 20, wall: 8, padV: 8, height: 100, base: 6, br: 5 }

/** Normal mode fixed dimensions (px). */
const NORMAL = { slot: 10, roller: 8, wall: 5, padV: 5, height: 55, base: 4, br: 3 }

/** Computes all shoe dimensions from total cards and size. */
function getDims(totalCards: number, size: 'normal' | 'large') {
  const numDecks = Math.max(1, Math.round(totalCards / 52))
  const isLarge = size === 'large'
  const c = isLarge ? LARGE : NORMAL
  const pxPerDeck = isLarge ? PX_PER_DECK_LARGE : PX_PER_DECK_NORMAL

  const maxBlock = numDecks * pxPerDeck
  // Internal space: where empty space + card block live (realistic 38% ratio)
  const internal = Math.round(maxBlock / CARD_FILL_RATIO)
  // Total housing: slot + left wall + internal + roller + right wall
  const width = c.slot + c.wall + internal + c.roller + c.wall

  return { ...c, width, maxBlock, internal, pxPerDeck, isLarge }
}

/**
 * Standalone shoe visual that renders based on props (no store dependency).
 *
 * Realistic horizontal dealing shoe (Kartenschlitten) with:
 * - Transparent acrylic housing with black base
 * - Dealing slot on the left
 * - Card block (shrinks as cards are dealt)
 * - Roller/wedge behind cards (moves WITH the card block)
 * - Empty interior space (grows as cards are dealt)
 * - Red cut card marker
 *
 * Housing scales with deck count: 2-deck shoe is physically smaller than 8-deck shoe,
 * but pixels-per-deck stays constant for consistent estimation training.
 */
export function ShoeVisual({
  remainingCards,
  totalCards,
  penetration = 0.75,
  size = 'normal',
  showCutCard = true,
}: ShoeVisualProps) {
  const d = getDims(totalCards, size)

  const blockWidth = Math.max(0, Math.round((remainingCards / 52) * d.pxPerDeck))

  // Cut card: fixed distance from right edge of the FULL card block
  const cutCardFromRight = Math.round((1 - penetration) * d.maxBlock)

  return (
    <div data-testid="shoe-visual" style={{ display: 'inline-flex', flexDirection: 'column' }}>
      {/* ── Acrylic Housing ── */}
      <div style={{
        width: d.width,
        height: d.height,
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderBottom: 'none',
        borderRadius: `${d.br}px ${d.br}px 0 0`,
        display: 'flex',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 20px rgba(255,255,255,0.03), 0 2px 8px rgba(0,0,0,0.3)',
      }}>
        {/* Dealing slot – dark vertical gap at left edge */}
        <div style={{
          width: d.slot,
          flexShrink: 0,
          background: 'linear-gradient(90deg, #080808, #0e0e0e)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }} />

        {/* Left wall spacer */}
        <div style={{ width: d.wall, flexShrink: 0 }} />

        {/* Interior – card area with vertical padding for top/bottom walls */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'stretch',
          padding: `${d.padV}px 0`,
          minWidth: 0,
        }}>
          {/* Empty space – grows as cards are dealt (dark interior) */}
          <div style={{
            flex: 1,
            minWidth: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.35) 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }} />

          {/* Card block – vertical card-edge texture, shrinks as dealt */}
          <motion.div
            animate={{ width: blockWidth }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              flexShrink: 0,
              height: '100%',
              borderRadius: '1px',
              background:
                'repeating-linear-gradient(90deg, #f5f5f5 0px, #f5f5f5 1px, #e0e0e0 1px, #e0e0e0 2px)',
              boxShadow:
                'inset 0 1px 2px rgba(0,0,0,0.08), -2px 0 4px rgba(0,0,0,0.15)',
              position: 'relative',
              overflow: 'visible',
            }}
          >
            {/* Cut card – red plastic marker */}
            {showCutCard && (
              <div style={{
                position: 'absolute',
                right: cutCardFromRight,
                top: '-2px',
                width: d.isLarge ? '3px' : '2px',
                height: 'calc(100% + 4px)',
                background: '#ef4444',
                borderRadius: '1px',
                boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
                zIndex: 2,
              }} />
            )}
          </motion.div>

          {/* Roller/wedge – pushes cards toward dealing slot */}
          <div style={{
            width: d.roller,
            flexShrink: 0,
            background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
            borderRadius: `${d.isLarge ? 2 : 1}px ${d.isLarge ? 2 : 1}px 0 0`,
            boxShadow: '-1px 0 3px rgba(0,0,0,0.4)',
          }} />
        </div>

        {/* Right wall spacer */}
        <div style={{ width: d.wall, flexShrink: 0 }} />
      </div>

      {/* ── Black Base ── */}
      <div style={{
        width: d.width,
        height: d.base,
        background: '#1c1917',
        borderRadius: `0 0 ${d.br}px ${d.br}px`,
      }} />
    </div>
  )
}
