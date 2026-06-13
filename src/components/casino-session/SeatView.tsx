import { motion } from 'framer-motion'
import type { Card } from '../../engine/shoe/types'
import type { BotPlayer, BotRoundResult } from '../../engine/casino-session/types'
import { AnimatedTableCard } from './CardComponents'
import { BotStatusBadge } from './CardComponents'
import { formatDollar, handValueStr } from './helpers'
import type { BotStatus, GameStep } from './helpers'

// ─── Human Seat ──────────────────────────────────────

interface HumanSeatProps {
  humanHands: Card[][]
  humanVisibleCards: number
  activeHandIndex: number
  currentBet: number
  handDoubled: Set<number>
  isSurrendered: boolean
  humanSettlement: { label: string; profit: number } | null
  gameStep: GameStep
  isActivePlayer: boolean
  isDimmed: boolean
  isDealPhase: boolean
}

export function HumanSeat({
  humanHands,
  humanVisibleCards,
  activeHandIndex,
  currentBet,
  handDoubled,
  isSurrendered,
  humanSettlement,
  gameStep,
  isActivePlayer,
  isDimmed,
  isDealPhase,
}: HumanSeatProps) {
  const isSplit = humanHands.length > 1
  const humanCards = humanHands[activeHandIndex] ?? []
  const isCurrentHandDoubled = handDoubled.has(activeHandIndex)

  return (
    <div
      className={`relative flex flex-col items-center gap-1 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
      style={{ flex: '0 1 140px' }}
      data-testid="human-seat"
    >
      {/* Betting spot */}
      <div className="w-16 h-10 md:w-20 md:h-12 rounded-full flex items-center justify-center"
        style={{
          border: `2px solid rgba(212, 168, 67, ${isActivePlayer ? '0.8' : '0.4'})`,
          background: 'rgba(0,0,0,0.15)',
          boxShadow: isActivePlayer ? '0 0 20px rgba(212, 168, 67, 0.3)' : 'none',
        }}>
        {currentBet > 0 && <span className="text-[10px] text-gold">{formatDollar(currentBet)}</span>}
      </div>

      {/* Cards */}
      {isSplit ? (() => {
        const splitScale = humanHands.length <= 2 ? 0.9 : humanHands.length === 3 ? 0.75 : 0.65
        const useGrid = humanHands.length >= 3
        return (
          <div style={{
            display: useGrid ? 'grid' : 'flex',
            gridTemplateColumns: useGrid ? '1fr 1fr' : undefined,
            gap: '4px',
            maxWidth: '200px',
            transform: `scale(${splitScale})`,
            transformOrigin: 'bottom center',
          }}>
            {humanHands.map((hand, i) => (
              <div key={`hand-${i}`} className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg transition-all
                ${i === activeHandIndex && gameStep === 'human_playing' ? 'ring-2 ring-gold bg-black/20' : gameStep === 'human_playing' ? 'opacity-40' : ''}`}>
                <span className="text-[8px] text-gold font-semibold">Hand {i + 1}</span>
                <div className="flex -space-x-3 md:-space-x-4">
                  {hand.map((c, ci) => (
                    <div key={`h${i}-${ci}`} className="relative" style={{ zIndex: ci }}>
                      <AnimatedTableCard card={c} animateIn size="player" />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-white/80 font-bold">{handValueStr(hand)}</span>
                {handDoubled.has(i) && <span className="text-[7px] text-gold">Doubled</span>}
              </div>
            ))}
          </div>
        )
      })() : (() => {
        const visibleHuman = humanCards.slice(0, humanVisibleCards)
        return visibleHuman.length > 0 ? (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex -space-x-3 md:-space-x-4">
              {visibleHuman.map((c, ci) => (
                <div key={`h-${ci}`} className="relative" style={{ zIndex: ci }}>
                  <AnimatedTableCard
                    card={c}
                    animateIn
                    delay={0}
                    size="player"
                  />
                </div>
              ))}
            </div>
            <span className="text-xs md:text-sm text-white/90 font-bold">{handValueStr(visibleHuman)}</span>
          </div>
        ) : null
      })()}

      {/* Per-player settlement result label */}
      {humanSettlement && gameStep === 'settlement' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`text-sm md:text-base font-black whitespace-nowrap drop-shadow-lg mt-0.5 px-2 py-0.5 rounded ${
            humanSettlement.label === 'Blackjack!'
              ? 'bg-gold text-black'
              : humanSettlement.profit > 0 ? 'text-success'
              : humanSettlement.profit < 0 ? 'text-error'
              : 'text-gold'
          }`}
          data-testid="human-settlement"
        >
          {humanSettlement.label} {humanSettlement.profit > 0 ? '+' : ''}{formatDollar(humanSettlement.profit)}
        </motion.div>
      )}

      {currentBet > 0 && humanCards.length > 0 && (
        <div className="flex items-center gap-1.5 text-[9px] md:text-[10px]">
          <span className="text-gold/70">{formatDollar(currentBet)}</span>
          {isCurrentHandDoubled && <span className="text-gold font-semibold">x2</span>}
          {isSurrendered && <span className="text-warning font-semibold">Surrendered</span>}
        </div>
      )}

      {/* Active glow */}
      {isActivePlayer && (
        <motion.div
          className="absolute -inset-2 rounded-xl pointer-events-none"
          style={{ boxShadow: '0 0 20px rgba(212, 168, 67, 0.4), 0 0 40px rgba(212, 168, 67, 0.15)' }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  )
}

// ─── Bot Seat ────────────────────────────────────────

interface BotSeatProps {
  bot: BotPlayer
  botStatus: BotStatus
  botSettlement: BotRoundResult | undefined
  visibleLimit: number | undefined
  gameStep: GameStep
  isActivePlayer: boolean
  isDimmed: boolean
  activeSplitHand: number
  splitVisibleCards?: number[]
}

export function BotSeat({
  bot,
  botStatus,
  botSettlement,
  visibleLimit,
  gameStep,
  isActivePlayer,
  isDimmed,
  activeSplitHand,
  splitVisibleCards,
}: BotSeatProps) {
  const hasSplit = bot.hands.length > 1
  // Three rendering modes:
  // 1. splitVisibleCards exists → per-hand visibility (during/after split animation)
  // 2. hasSplit && !splitVisibleCards → pre-split (show original pair as single hand)
  // 3. !hasSplit → normal single hand
  const showSplitHands = hasSplit && splitVisibleCards !== undefined

  return (
    <div
      className={`relative flex flex-col items-center gap-1 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
      style={{ flex: '0 1 140px' }}
      data-testid="bot-seat"
    >
      {/* Betting spot */}
      <div className="w-14 h-9 md:w-16 md:h-10 rounded-full flex items-center justify-center"
        style={{ border: '1.5px solid rgba(255, 215, 0, 0.2)', background: 'rgba(0,0,0,0.1)' }}>
        <span className="text-[8px] text-white/30">{formatDollar(bot.currentBet)}</span>
      </div>

      {/* Split hands — per-hand visibility mode */}
      {showSplitHands && gameStep !== 'betting' && (
        <div className="flex gap-1.5">
          {bot.hands.map((hand, hi) => {
            const handVisible = splitVisibleCards[hi] ?? 0
            const shownCards = hand.cards.slice(0, handVisible)
            if (shownCards.length === 0) return null

            const resultLabel = hand.result === 'win' ? 'Win' : hand.result === 'push' ? 'Push' : hand.result === 'loss' ? 'Loss' : hand.result === 'blackjack' ? 'BJ!' : null
            const isHandActive = activeSplitHand === hi
            const hasActiveHand = activeSplitHand >= 0

            return (
              <motion.div key={`${bot.id}-h${hi}`}
                initial={{ x: hi === 0 ? 18 : -18, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg ${
                  hasActiveHand
                    ? isHandActive ? 'ring-2 ring-gold bg-black/20' : 'opacity-40'
                    : ''
                }`}
                style={{ transition: 'opacity 0.4s ease' }}>
                <span className={`text-[7px] font-semibold ${
                  hasActiveHand && isHandActive ? 'text-gold' : 'text-white/40'
                }`}>H{hi + 1}</span>
                <div className="flex -space-x-2.5 md:-space-x-3">
                  {shownCards.map((c, ci) => (
                    <div key={`${bot.id}-h${hi}-${ci}`} className="relative" style={{ zIndex: ci }}>
                      <AnimatedTableCard card={c} animateIn={ci > 0} size="bot" />
                    </div>
                  ))}
                </div>
                <span className="text-[8px] text-white/60 font-semibold">{handValueStr(shownCards)}</span>
                {resultLabel && gameStep === 'settlement' && (
                  <span className={`text-[7px] font-bold ${
                    (hand.profit ?? 0) > 0 ? 'text-success' : (hand.profit ?? 0) < 0 ? 'text-error' : 'text-white/50'
                  }`}>{resultLabel}</span>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Pre-split mode: bot has split but animation hasn't started yet — show original pair as single hand */}
      {hasSplit && !splitVisibleCards && gameStep !== 'betting' && (() => {
        // Reconstruct original pair from first card of each split hand
        const pairCards = bot.hands.map(h => h.cards[0]).filter(Boolean)
        const visibleCards = visibleLimit !== undefined
          ? pairCards.slice(0, visibleLimit)
          : pairCards
        return visibleCards.length > 0 ? (
          <>
            <div className="flex -space-x-2.5 md:-space-x-3">
              {visibleCards.map((c, ci) => (
                <div key={`${bot.id}-pre-${ci}`} className="relative" style={{ zIndex: ci }}>
                  <AnimatedTableCard card={c} animateIn={false} size="bot" />
                </div>
              ))}
            </div>
            <span className="text-[9px] md:text-[10px] text-white/60 font-semibold">{handValueStr(visibleCards)}</span>
          </>
        ) : null
      })()}

      {/* Single hand (no split) */}
      {!hasSplit && (() => {
        const hand = bot.hands[0]
        const visibleCards = hand && visibleLimit !== undefined
          ? hand.cards.slice(0, visibleLimit)
          : hand?.cards ?? []
        return visibleCards.length > 0 && gameStep !== 'betting' ? (
          <>
            <div className="flex -space-x-2.5 md:-space-x-3">
              {visibleCards.map((c, ci) => (
                <div key={`${bot.id}-${ci}`} className="relative" style={{ zIndex: ci }}>
                  <AnimatedTableCard
                    card={c}
                    animateIn
                    delay={0}
                    size="bot"
                  />
                </div>
              ))}
            </div>
            <span className="text-[9px] md:text-[10px] text-white/60 font-semibold">{handValueStr(visibleCards)}</span>
          </>
        ) : null
      })()}

      {/* Per-bot settlement result label */}
      {botSettlement && gameStep === 'settlement' && (
        <span className={`text-[8px] md:text-[10px] font-bold ${
          botSettlement.profit > 0 ? 'text-success'
            : botSettlement.profit < 0 ? 'text-error'
            : 'text-white/50'
        }`} data-testid="bot-settlement">
          {hasSplit ? 'Total: ' : (botSettlement.result === 'blackjack' ? 'BJ! ' : botSettlement.result === 'win' ? 'Win ' : botSettlement.result === 'push' ? 'Push ' : botSettlement.result === 'surrender' ? 'Surr ' : 'Loss ')}
          {botSettlement.profit > 0 ? '+' : ''}{formatDollar(botSettlement.profit)}
        </span>
      )}

      {/* Active glow for bots */}
      {isActivePlayer && (
        <motion.div
          className="absolute -inset-2 rounded-xl pointer-events-none"
          style={{ boxShadow: '0 0 15px rgba(234, 179, 8, 0.3)' }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  )
}
