import { motion } from 'framer-motion'
import { useState } from 'react'
import { useGameStore } from '../../store/game-store'

/** Maximum number of visual card layers in each stack. */
const MAX_LAYERS = 7

/**
 * A single 3D card stack that visually represents a pile of cards.
 * Used for both the shoe and discard tray.
 */
function CardStack3D({
  fillRatio,
  label,
  isMessy = false,
  side,
  tooltip,
}: {
  fillRatio: number
  label: string
  isMessy?: boolean
  side: 'left' | 'right'
  tooltip?: string
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const layerCount = Math.max(0, Math.round(fillRatio * MAX_LAYERS))
  const rotateY = side === 'right' ? -12 : 12

  return (
    <div
      className="flex flex-col items-center gap-1"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="relative" style={{ perspective: '600px' }}>
        <div
          className="relative"
          style={{
            transform: `rotateX(18deg) rotateY(${rotateY}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Base tray */}
          <div className="w-14 h-9 md:w-16 md:h-10 rounded-sm bg-wood/30 border border-wood/20" />

          {/* Card layers */}
          {Array.from({ length: layerCount }).map((_, i) => {
            const messyRotate = isMessy ? Math.sin(i * 2.7) * 3 : 0
            const messyX = isMessy ? Math.sin(i * 1.8) * 1.5 : 0

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
                className="absolute w-14 h-9 md:w-16 md:h-10 rounded-sm border border-blue-300/20 bg-card-back"
                style={{
                  bottom: `${i * 3 + 4}px`,
                  left: `${messyX}px`,
                  transform: `rotateZ(${messyRotate}deg)`,
                  zIndex: i,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  backgroundImage:
                    'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 6px)',
                }}
              />
            )
          })}

          {/* Shoe opening slot (only for the shoe side) */}
          {side === 'right' && layerCount > 0 && (
            <div
              className="absolute w-5 h-1.5 bg-black/50 rounded-sm"
              style={{ bottom: '4px', left: '-3px' }}
            />
          )}
        </div>

        {/* Tooltip on hover */}
        {tooltip && showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap
              text-[10px] text-gold bg-black/80 px-2 py-0.5 rounded pointer-events-none z-20"
          >
            {tooltip}
          </motion.div>
        )}
      </div>

      <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
    </div>
  )
}

/**
 * Visual 3D shoe stack (right side of table).
 * Shrinks as cards are dealt from the shoe.
 */
export function ShoeStack() {
  const shoe = useGameStore(s => s.shoe)
  const numDecks = useGameStore(s => s.rules.numDecks)

  if (!shoe) return <div className="w-14 md:w-16" />

  const totalCards = numDecks * 52
  const fillRatio = shoe.remaining() / totalCards

  return (
    <CardStack3D
      fillRatio={fillRatio}
      label="Shoe"
      side="right"
      tooltip="Estimate the remaining decks!"
    />
  )
}

/**
 * Visual 3D discard tray (left side of table).
 * Grows as cards are played.
 */
export function DiscardStack() {
  const shoe = useGameStore(s => s.shoe)
  const numDecks = useGameStore(s => s.rules.numDecks)

  if (!shoe) return <div className="w-14 md:w-16" />

  const totalCards = numDecks * 52
  const fillRatio = (totalCards - shoe.remaining()) / totalCards

  return (
    <CardStack3D
      fillRatio={fillRatio}
      label="Discard"
      isMessy
      side="left"
    />
  )
}
