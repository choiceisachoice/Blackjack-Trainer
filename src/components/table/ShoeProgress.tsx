import { motion } from 'framer-motion'
import { useState } from 'react'
import { useGameStore } from '../../store/game-store'

/** Shoe housing dimensions in px. */
const SHOE_WIDTH = 220
const SHOE_HEIGHT = 85

/** Discard tray dimensions in px. */
const DISCARD_WIDTH = 160
const DISCARD_TRAY_HEIGHT = 30
const DISCARD_MAX_STACK = 120

/**
 * Realistic horizontal card shoe (Kartenschlitten).
 *
 * - Dark wood/plastic housing sitting flat on the table (NO rotation)
 * - Inside: a white card block visible from the side (card edges as vertical lines)
 * - The card block shrinks from left as cards are dealt
 * - A slot on the left front where cards come out
 * - All backgrounds transparent – sits directly on green felt
 */
function ShoeHousing({
  fillRatio,
  tooltip,
}: {
  fillRatio: number
  tooltip?: string
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const fillPercent = Math.max(0, Math.min(100, fillRatio * 100))

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Shoe housing – flat, no rotation */}
      <div
        style={{
          width: `${SHOE_WIDTH}px`,
          height: `${SHOE_HEIGHT}px`,
          background: 'linear-gradient(180deg, #3d2317 0%, #2c1810 100%)',
          borderRadius: '6px',
          border: '2px solid #1a0f0a',
          boxShadow:
            '0 4px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
          padding: '8px',
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

        {/* Card block inside the shoe – shrinks from left */}
        <motion.div
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{
            height: '100%',
            marginLeft: 'auto',
            borderRadius: '2px',
            background:
              'repeating-linear-gradient(90deg, #f5f5f5 0px, #f5f5f5 1px, #e0e0e0 1px, #e0e0e0 2px)',
            boxShadow:
              'inset 0 1px 2px rgba(0,0,0,0.1), 0 0 3px rgba(0,0,0,0.2)',
          }}
        />

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

      <span className="text-[11px] text-white/40 uppercase tracking-widest font-medium">
        Shoe
      </span>

      {/* Tooltip on hover */}
      {tooltip && showTooltip && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[11px] text-gold bg-black/80 px-2.5 py-1 rounded pointer-events-none whitespace-nowrap"
        >
          {tooltip}
        </motion.div>
      )}
    </div>
  )
}

/**
 * Flat discard tray with a straight card stack growing upward.
 *
 * - A shallow tray/container at the bottom (dark red, semi-transparent)
 * - Cards stacked flat and straight on top (horizontal card-edge lines)
 * - Stack grows upward as cards are discarded
 * - NO rotation, NO tilting – everything is straight
 * - All backgrounds transparent – sits directly on green felt
 */
function DiscardTray({ fillRatio }: { fillRatio: number }) {
  const stackHeight = Math.max(0, Math.round(fillRatio * DISCARD_MAX_STACK))
  const hasCards = fillRatio > 0.01

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Stack + tray wrapper */}
      <div
        style={{
          position: 'relative',
          width: `${DISCARD_WIDTH}px`,
          height: `${DISCARD_TRAY_HEIGHT + DISCARD_MAX_STACK + 10}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        {/* Card stack – grows upward from the tray */}
        {hasCards && (
          <motion.div
            animate={{ height: stackHeight }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              width: '100%',
              overflow: 'hidden',
              borderRadius: '3px 3px 0 0',
              background:
                'repeating-linear-gradient(0deg, #f5f5f5 0px, #f5f5f5 1px, #e0e0e0 1px, #e0e0e0 2px)',
              boxShadow: '0 -2px 4px rgba(0,0,0,0.3)',
            }}
          />
        )}

        {/* Tray container */}
        <div
          style={{
            width: '100%',
            height: `${DISCARD_TRAY_HEIGHT}px`,
            background: 'rgba(139, 0, 0, 0.3)',
            border: '2px solid rgba(139, 0, 0, 0.6)',
            borderRadius: '4px 4px 8px 8px',
            boxShadow:
              '0 3px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}
        />
      </div>

      <span className="text-[11px] text-white/40 uppercase tracking-widest font-medium">
        Discard
      </span>
    </div>
  )
}

/**
 * Visual shoe (right side of table).
 * Horizontal card shoe housing that shrinks as cards are dealt.
 *
 * Subscribes to the primitive remainingCards counter for reliable re-renders.
 */
export function ShoeStack() {
  const remainingCards = useGameStore(s => s.remainingCards)
  const numDecks = useGameStore(s => s.rules.numDecks)
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return <div style={{ width: `${SHOE_WIDTH}px` }} />

  const totalCards = numDecks * 52
  const fillRatio = remainingCards / totalCards

  return (
    <ShoeHousing
      fillRatio={fillRatio}
      tooltip="Estimate the remaining decks!"
    />
  )
}

/**
 * Visual discard tray (left side of table).
 * Flat tray with a straight stack growing upward.
 *
 * Subscribes to the primitive remainingCards counter for reliable re-renders.
 */
export function DiscardStack() {
  const remainingCards = useGameStore(s => s.remainingCards)
  const numDecks = useGameStore(s => s.rules.numDecks)
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return <div style={{ width: `${DISCARD_WIDTH}px` }} />

  const totalCards = numDecks * 52
  const fillRatio = (totalCards - remainingCards) / totalCards

  return <DiscardTray fillRatio={fillRatio} />
}
