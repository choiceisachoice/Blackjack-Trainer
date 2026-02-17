import { motion } from 'framer-motion'
import { useState, useMemo } from 'react'
import { useGameStore } from '../../store/game-store'

/** Card dimensions in px – large enough for visual deck estimation. */
const CARD_WIDTH = 130
const CARD_HEIGHT = 85

/**
 * Maximum stack body height in px.
 * At 150px a full 6-deck shoe is unmistakably tall, and the difference
 * between 4 decks remaining vs 2 decks remaining is ~50px – clearly visible.
 */
const MAX_STACK_HEIGHT = 150

/** Number of individual card layers rendered in the stack. */
const MAX_LAYERS = 15

/** Vertical offset per layer in px. */
const LAYER_OFFSET = 2

/**
 * Generates an array of card-layer positions for the 3D stack.
 * Each layer is offset slightly to create a realistic stacked look.
 */
function useCardLayers(fillRatio: number, isMessy: boolean) {
  return useMemo(() => {
    const visibleLayers = Math.max(0, Math.round(fillRatio * MAX_LAYERS))
    return Array.from({ length: visibleLayers }, (_, i) => {
      const messyX = isMessy ? (Math.sin(i * 2.7) * 1.5) : 0
      const messyRotate = isMessy ? (Math.sin(i * 1.9) * 1.8) : 0
      return {
        index: i,
        offsetY: i * LAYER_OFFSET,
        offsetX: messyX,
        rotate: messyRotate,
      }
    })
  }, [fillRatio, isMessy])
}

/**
 * A 3D card stack with individually rendered card layers for realistic depth.
 *
 * - Each layer is a thin card edge offset by LAYER_OFFSET px
 * - The top card shows a card-back pattern
 * - Stack height scales proportionally with fillRatio
 * - Shadows between layers add depth perception
 * - The shoe side has an opening slot for dealing
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
  const layers = useCardLayers(fillRatio, isMessy)
  const stackHeight = Math.max(0, Math.round(fillRatio * MAX_STACK_HEIGHT))
  const hasCards = fillRatio > 0.01
  const rotateY = side === 'right' ? -15 : 15

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{ perspective: '600px' }}>
        <div
          style={{
            transform: `rotateX(25deg) rotateY(${rotateY}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <motion.div
            animate={{ height: hasCards ? CARD_HEIGHT + stackHeight : 14 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position: 'relative',
              width: `${CARD_WIDTH}px`,
            }}
          >
            {/* Stack body – individual card layers visible from the side */}
            {hasCards && (
              <motion.div
                animate={{ height: stackHeight }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="overflow-hidden"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  width: `${CARD_WIDTH}px`,
                  borderRadius: '0 0 4px 4px',
                }}
              >
                {/* Base gradient body */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to right, #12235a, #1e3a8a, #182f70)',
                    boxShadow: '0 3px 8px rgba(0,0,0,0.6)',
                    borderRadius: '0 0 4px 4px',
                  }}
                />
                {/* Individual card-edge layers */}
                {layers.map((layer) => (
                  <div
                    key={layer.index}
                    style={{
                      position: 'absolute',
                      bottom: `${layer.offsetY}px`,
                      left: `${layer.offsetX}px`,
                      width: `${CARD_WIDTH}px`,
                      height: '2px',
                      transform: `rotateZ(${layer.rotate}deg)`,
                      background: layer.index % 2 === 0
                        ? 'linear-gradient(to right, #e8e0d4, #f5f0e8, #e8e0d4)'
                        : 'linear-gradient(to right, #d8d0c4, #eae4da, #d8d0c4)',
                      boxShadow: '0 1px 1px rgba(0,0,0,0.15)',
                      zIndex: layer.index,
                    }}
                  />
                ))}
                {/* Side edge highlight for paper-like look */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '3px',
                    height: '100%',
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(255,255,255,0.03))',
                  }}
                />
              </motion.div>
            )}

            {/* Top card – card back pattern */}
            {hasCards && (
              <motion.div
                animate={{ bottom: stackHeight }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  width: `${CARD_WIDTH}px`,
                  height: `${CARD_HEIGHT}px`,
                }}
                className="rounded-md bg-card-back border border-blue-300/30 shadow-lg"
              >
                <div className="w-full h-full rounded-md flex items-center justify-center overflow-hidden">
                  <div
                    className="w-[85%] h-[85%] rounded border border-blue-300/20"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.05) 4px, rgba(255,255,255,0.05) 8px)',
                    }}
                  />
                </div>
              </motion.div>
            )}

            {/* Shoe opening slot (only for shoe side) */}
            {side === 'right' && hasCards && (
              <motion.div
                animate={{ bottom: Math.max(0, stackHeight / 2 - 8) }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="bg-black/60 rounded-sm"
                style={{
                  position: 'absolute',
                  left: '-6px',
                  width: '10px',
                  height: '16px',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
                }}
              />
            )}

            {/* Empty tray when no cards */}
            {!hasCards && (
              <div
                className="rounded bg-wood/20 border border-wood/10"
                style={{
                  width: `${CARD_WIDTH}px`,
                  height: '14px',
                  position: 'absolute',
                  bottom: 0,
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            )}
          </motion.div>
        </div>
      </div>

      <span className="text-[11px] text-white/40 uppercase tracking-widest font-medium">
        {label}
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
 * Visual 3D shoe stack (right side of table).
 * Shrinks as cards are dealt from the shoe.
 *
 * Subscribes to the primitive remainingCards counter for reliable re-renders.
 */
export function ShoeStack() {
  const remainingCards = useGameStore(s => s.remainingCards)
  const numDecks = useGameStore(s => s.rules.numDecks)
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return <div style={{ width: `${CARD_WIDTH}px` }} />

  const totalCards = numDecks * 52
  const fillRatio = remainingCards / totalCards

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
 *
 * Subscribes to the primitive remainingCards counter for reliable re-renders.
 */
export function DiscardStack() {
  const remainingCards = useGameStore(s => s.remainingCards)
  const numDecks = useGameStore(s => s.rules.numDecks)
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return <div style={{ width: `${CARD_WIDTH}px` }} />

  const totalCards = numDecks * 52
  const fillRatio = (totalCards - remainingCards) / totalCards

  return (
    <CardStack3D
      fillRatio={fillRatio}
      label="Discard"
      isMessy
      side="left"
    />
  )
}
