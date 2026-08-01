import { motion } from 'framer-motion'
import type { Card } from '../../engine/shoe/types'
import { SUIT_MAP } from './helpers'

// ─── Mini Card Component (for table) ─────────────────

export function MiniCard({ card, faceDown }: { card: Card; faceDown?: boolean }) {
  const isRed = card.suit === 'Hearts' || card.suit === 'Diamonds'
  if (faceDown) {
    return (
      <div className="w-8 h-11 md:w-10 md:h-14 rounded bg-card-back border border-blue-300/30 flex items-center justify-center flex-shrink-0">
        <div className="w-6 h-9 md:w-8 md:h-11 rounded border border-blue-300/20 opacity-40"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 6px)' }} />
      </div>
    )
  }
  return (
    <div className={`w-8 h-11 md:w-10 md:h-14 rounded bg-white border border-gray-300 shadow flex flex-col items-center justify-center leading-none flex-shrink-0
      ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
      <span className="text-[0.65rem] md:text-xs font-bold">{card.rank}</span>
      <span className="text-[0.625rem] md:text-[0.6875rem]">{SUIT_MAP[card.suit]}</span>
    </div>
  )
}

// ─── Enhanced Table Card Components ─────────────

export type CardSize = 'dealer' | 'player' | 'bot'

/**
 * Uniform, readable card sizes. Players and bots share ONE size so no seat's
 * cards are harder to read than another's — essential for a counting trainer.
 */
const CARD_SIZE_CLASS: Record<CardSize, string> = {
  dealer: 'w-[58px] h-[82px] md:w-[64px] md:h-[90px]',
  player: 'w-[52px] h-[74px] md:w-[56px] md:h-[80px]',
  bot: 'w-[52px] h-[74px] md:w-[56px] md:h-[80px]',
}

/** Corner index (rank over suit) — stays visible when cards are fanned. */
const CARD_CORNER_CLASS: Record<CardSize, string> = {
  dealer: 'text-[0.85rem] md:text-[0.95rem]',
  player: 'text-[0.8125rem] md:text-[0.85rem]',
  bot: 'text-[0.8125rem] md:text-[0.85rem]',
}

/** Large centre suit pip. */
const CARD_PIP_CLASS: Record<CardSize, string> = {
  dealer: 'text-[1.625rem] md:text-[1.875rem]',
  player: 'text-[1.375rem] md:text-[1.5rem]',
  bot: 'text-[1.375rem] md:text-[1.5rem]',
}

export function TableCard({ card, faceDown, size = 'player' }: { card: Card; faceDown?: boolean; size?: CardSize }) {
  const isRed = card.suit === 'Hearts' || card.suit === 'Diamonds'

  if (faceDown) {
    return (
      <div className={`${CARD_SIZE_CLASS[size]} rounded-md flex items-center justify-center flex-shrink-0 shadow-lg`}
        style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)', border: '2px solid rgba(96,165,250,0.3)' }}>
        <div className="w-[80%] h-[80%] rounded border border-blue-300/20"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 8px)' }} />
      </div>
    )
  }

  return (
    <div className={`${CARD_SIZE_CLASS[size]} relative rounded-md bg-white border border-gray-300 shadow-lg leading-none flex-shrink-0
      ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
      {/* Top-left corner index — remains readable when the card is overlapped */}
      <span className={`absolute top-[3px] left-[4px] flex flex-col items-center font-bold ${CARD_CORNER_CLASS[size]}`}>
        <span>{card.rank}</span>
        <span className="text-[0.82em] -mt-[1px]">{SUIT_MAP[card.suit]}</span>
      </span>
      {/* Centre pip */}
      <span className={`absolute inset-0 grid place-items-center opacity-90 ${CARD_PIP_CLASS[size]}`}>{SUIT_MAP[card.suit]}</span>
    </div>
  )
}

/**
 * A dealt card that glides in from the shoe's direction (the table's top-right)
 * to its resting spot. A single fixed offset + duration is used for every card,
 * so the deal reads as one calm, consistent motion — reliable framer
 * `initial → animate` on mount, no per-card measuring.
 */
export function AnimatedTableCard({
  card,
  faceDown = false,
  animateIn = false,
  delay = 0,
  size = 'player',
}: {
  card: Card
  faceDown?: boolean
  animateIn?: boolean
  delay?: number
  size?: CardSize
}) {
  if (!animateIn) {
    return <TableCard card={card} faceDown={faceDown} size={size} />
  }

  return (
    <motion.div
      initial={{ x: 170, y: -190, opacity: 0, scale: 0.7, rotate: -8 }}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.62, ease: [0.2, 0.8, 0.25, 1], delay }}
    >
      <TableCard card={card} faceDown={faceDown} size={size} />
    </motion.div>
  )
}

/**
 * A card that first glides in from the shoe (like every dealt card), then flips
 * in 3D (rotateY) between its back and its face. Used for the dealer's hole
 * card so it deals in at the same calm speed as the rest and the reveal
 * animates smoothly instead of snapping.
 *
 * The outer motion element handles the deal-in (translate/opacity/scale); the
 * inner one handles the 3D flip — kept separate so the 2D and 3D transforms
 * don't fight.
 */
export function FlipCard({ card, revealed, size = 'dealer' }: { card: Card; revealed: boolean; size?: CardSize }) {
  return (
    <motion.div
      initial={{ x: 170, y: -190, opacity: 0, scale: 0.7, rotate: -8 }}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.62, ease: [0.2, 0.8, 0.25, 1] }}
    >
      <div style={{ perspective: '900px' }}>
        <motion.div
          className={`${CARD_SIZE_CLASS[size]} relative`}
          style={{ transformStyle: 'preserve-3d' }}
          initial={false}
          animate={{ rotateY: revealed ? 0 : 180 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Face (visible at 0°) */}
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
            <TableCard card={card} size={size} />
          </div>
          {/* Back (visible at 180°) */}
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <TableCard card={card} faceDown size={size} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── Bot Status Badge ────────────────────────────────

import { BOT_STATUS_STYLE, BOT_STATUS_LABEL } from './helpers'
import type { BotStatus } from './helpers'

export function BotStatusBadge({ status }: { status: BotStatus }) {
  const style = BOT_STATUS_STYLE[status]
  return (
    <motion.span
      key={status}
      // Transform only. The badge is keyed on the status, so every transition
      // remounts it and replays this entrance — an opacity entrance hid the
      // badge afresh on each change, not merely the first, and "BUST!" is a
      // result the player has to be able to read.
      initial={{ scale: 0.8 }}
      animate={{
        scale: style.animate ? [1, 1.05, 1] : 1,
      }}
      transition={style.animate ? { repeat: Infinity, duration: 1 } : { duration: 0.2 }}
      className={`text-[0.6875rem] md:text-xs font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
      data-testid="bot-status"
    >
      {BOT_STATUS_LABEL[status]}
    </motion.span>
  )
}
