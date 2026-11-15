import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { Card } from '../../engine/shoe/types'
import { CardFace, CardBack } from '../cards/CardFace'
import { TABLE_CARD, DEALER_CARD } from './helpers'

// ─── Mini Card Component (for table) ─────────────────

export function MiniCard({ card, faceDown }: { card: Card; faceDown?: boolean }) {
  return (
    <div className="w-8 h-11 md:w-10 md:h-14 flex-shrink-0 rounded-[3px] shadow">
      {faceDown ? <CardBack /> : <CardFace rank={card.rank} suit={card.suit} />}
    </div>
  )
}

// ─── Enhanced Table Card Components ─────────────

export type CardSize = 'dealer' | 'player' | 'bot'

/**
 * Uniform, readable card sizes. Players and bots share ONE size so no seat's
 * cards are harder to read than another's — essential for a counting trainer.
 * In table units, from `helpers.ts`.
 */
const CARD_BOX: Record<CardSize, { width: number; height: number }> = {
  dealer: DEALER_CARD,
  player: TABLE_CARD,
  bot: TABLE_CARD,
}
const boxOf = (size: CardSize) => ({ width: CARD_BOX[size].width, height: CARD_BOX[size].height })

export function TableCard({ card, faceDown, size = 'player' }: { card: Card; faceDown?: boolean; size?: CardSize }) {
  return (
    <div className="flex-shrink-0 rounded-[6px] shadow-[0_2px_6px_rgba(0,0,0,.45)]" style={boxOf(size)}>
      {faceDown ? <CardBack /> : <CardFace rank={card.rank} suit={card.suit} />}
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
  // Called before the early return below: a hook after a conditional return is
  // a hook that sometimes does not run.
  const reduced = useReducedMotion()

  if (!animateIn) {
    return <TableCard card={card} faceDown={faceDown} size={size} />
  }

  return (
    <motion.div
      /*
        `false`, not a smaller offset, when the visitor asked for less motion.
        `MotionConfig reducedMotion="user"` disables transform animations but
        does *not* clear `initial` — so an unguarded offset does not calm the
        deal, it strands the card 170px right and 190px above where it belongs,
        permanently. Verified in a browser, not assumed.
      */
      initial={reduced ? false : { x: 170, y: -190, scale: 0.7, rotate: -8 }}
      // No opacity in the entrance. A stalled frame loop used to leave the card
      // invisible *and* off-position; now it is merely off-position, which is
      // recoverable the moment a frame runs. A card that glides in at full
      // opacity also reads more like a dealt card than one that fades in.
      animate={{ x: 0, y: 0, scale: 1, rotate: 0 }}
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
  const reduced = useReducedMotion()
  return (
    <motion.div
      // Same reason as `AnimatedTableCard`: an unguarded offset strands the
      // dealer's hole card off-table instead of merely not gliding.
      initial={reduced ? false : { x: 170, y: -190, scale: 0.7, rotate: -8 }}
      animate={{ x: 0, y: 0, scale: 1, rotate: 0 }}
      transition={{ duration: 0.62, ease: [0.2, 0.8, 0.25, 1] }}
    >
      <div style={{ perspective: '900px' }}>
        <motion.div
          className="relative"
          style={{ ...boxOf(size), transformStyle: 'preserve-3d' }}
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

import { BOT_STATUS_STYLE, BOT_STATUS_LABEL_KEY } from './helpers'
import type { BotStatus } from './helpers'

export function BotStatusBadge({ status }: { status: BotStatus }) {
  const { t } = useTranslation()
  const style = BOT_STATUS_STYLE[status]
  const reduced = useReducedMotion()
  // "Thinking..." pulses forever. A loop is the one kind of motion someone with
  // a vestibular sensitivity cannot look away from, so it is the first to go.
  const pulse = style.animate && !reduced
  return (
    <motion.span
      key={status}
      // Transform only. The badge is keyed on the status, so every transition
      // remounts it and replays this entrance — an opacity entrance hid the
      // badge afresh on each change, not merely the first, and "BUST!" is a
      // result the player has to be able to read.
      initial={reduced ? false : { scale: 0.8 }}
      animate={{
        scale: pulse ? [1, 1.05, 1] : 1,
      }}
      transition={pulse ? { repeat: Infinity, duration: 1 } : { duration: 0.2 }}
      className={`text-[0.6875rem] md:text-xs font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}
      data-testid="bot-status"
    >
      {t(BOT_STATUS_LABEL_KEY[status])}
    </motion.span>
  )
}
