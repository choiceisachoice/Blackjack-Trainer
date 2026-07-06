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
      <span className="text-[9px] md:text-xs font-bold">{card.rank}</span>
      <span className="text-[8px] md:text-[10px]">{SUIT_MAP[card.suit]}</span>
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
  dealer: 'text-[13px] md:text-[15px]',
  player: 'text-[12px] md:text-[13px]',
  bot: 'text-[12px] md:text-[13px]',
}

/** Large centre suit pip. */
const CARD_PIP_CLASS: Record<CardSize, string> = {
  dealer: 'text-[26px] md:text-[30px]',
  player: 'text-[22px] md:text-[24px]',
  bot: 'text-[22px] md:text-[24px]',
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
      initial={{ x: 180, y: -200, opacity: 0, scale: 0.6 }}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
      transition={{
        duration: 0.4,
        ease: [0.25, 0.1, 0.25, 1],
        delay,
      }}
    >
      <TableCard card={card} faceDown={faceDown} size={size} />
    </motion.div>
  )
}

/**
 * A card that flips in 3D (rotateY) between its back and its face. Used for the
 * dealer's hole card so the reveal animates smoothly instead of snapping.
 */
export function FlipCard({ card, revealed, size = 'dealer' }: { card: Card; revealed: boolean; size?: CardSize }) {
  return (
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
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: style.animate ? [1, 1.05, 1] : 1,
      }}
      transition={style.animate ? { repeat: Infinity, duration: 1 } : { duration: 0.2 }}
      className={`text-[10px] md:text-xs font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
      data-testid="bot-status"
    >
      {BOT_STATUS_LABEL[status]}
    </motion.span>
  )
}
