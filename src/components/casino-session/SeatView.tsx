import { useTranslation } from 'react-i18next'
import type { HandOutcome } from './useGameLoop'

/**
 * The player's own result, as a key rather than a sentence.
 *
 * `casino.table.result*` is the same set the split hands and the bots already
 * use, so a table shows one vocabulary rather than two.
 */
const SETTLEMENT_KEY: Record<HandOutcome, string> = {
  blackjack: 'casino.table.resultBlackjack',
  win: 'casino.table.resultWin',
  loss: 'casino.table.resultLoss',
  push: 'casino.table.resultPush',
  surrender: 'casino.table.resultSurrender',
}
import { motion, useReducedMotion } from 'framer-motion'
import type { Card } from '../../engine/shoe/types'
import type { BotPlayer, BotRoundResult } from '../../engine/casino-session/types'
import { AnimatedTableCard, BotStatusBadge } from './CardComponents'
import { formatDollar, handValueStr } from './helpers'
import type { BotStatus, GameStep } from './helpers'

/**
 * One fanned hand of cards + its total. Cards overlap toward the right with the
 * newest on top; the top-left corner (rank+suit) stays visible so every card is
 * readable. The overlap tightens as the hand grows so a long hand never runs
 * off the table.
 */
function Hand({ cards, animateFrom = 0, totalClass = 'text-sm' }: {
  cards: Card[]; animateFrom?: number; totalClass?: string
}) {
  if (cards.length === 0) return null
  const overlap = cards.length <= 4 ? 22 : cards.length <= 6 ? 30 : 36
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex">
        {cards.map((c, ci) => (
          <div key={ci} className="relative" style={{ zIndex: ci, marginLeft: ci === 0 ? 0 : -overlap }}>
            <AnimatedTableCard card={c} animateIn={ci >= animateFrom} size="player" />
          </div>
        ))}
      </div>
      <span className={`${totalClass} text-white/90 font-bold`}>{handValueStr(cards)}</span>
    </div>
  )
}

/** Bet chip shown above a seat's cards. */
function BetChip({ amount, active }: { amount: number; active?: boolean }) {
  return (
    <div
      className="grid place-items-center rounded-full shrink-0"
      style={{
        width: 34, height: 34,
        fontSize: 10, fontWeight: 700, color: 'var(--color-casino-bg)',
        background: 'radial-gradient(circle at 50% 35%, var(--color-gold-bright), var(--color-gold))',
        border: `2px dashed rgba(0,0,0,0.25)`,
        boxShadow: active ? '0 0 16px -2px var(--color-gold)' : '0 3px 8px rgba(0,0,0,0.4)',
        opacity: amount > 0 ? 1 : 0.25,
      }}
    >
      {amount > 0 ? formatDollar(amount) : ''}
    </div>
  )
}

/** Name + bankroll plate at the bottom of a seat block. */
function NamePlate({ name, bankroll, you }: { name: string; bankroll: number; you?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className={`text-[0.75rem] md:text-xs font-semibold ${you ? 'text-gold-bright' : 'text-white/70'}`}>
        {you ? `★ ${t('casino.table.you')}` : name}
      </span>
      <span className="text-[0.6875rem] text-white/40 tabular-nums">{formatDollar(bankroll)}</span>
    </div>
  )
}

// ─── Human Seat ──────────────────────────────────────

interface HumanSeatProps {
  humanHands: Card[][]
  humanVisibleCards: number
  activeHandIndex: number
  currentBet: number
  bankroll: number
  handDoubled: Set<number>
  isSurrendered: boolean
  humanSettlement: { result: HandOutcome; profit: number } | null
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
  bankroll,
  handDoubled,
  isSurrendered,
  humanSettlement,
  gameStep,
  isActivePlayer,
  isDimmed,
}: HumanSeatProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const isSplit = humanHands.length > 1
  const humanCards = humanHands[activeHandIndex] ?? []

  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
      style={{ flex: '0 0 auto', minWidth: '140px' }}
      data-testid="human-seat"
    >
      <BetChip amount={currentBet} active={isActivePlayer} />

      {/* Cards */}
      {isSplit ? (
        <div className="flex flex-wrap justify-center gap-3 max-w-[420px]">
          {humanHands.map((hand, i) => (
            <motion.div
              key={`hand-${i}`}
              // Slide the two hands apart from the centre — as if the pair is
              // being separated — instead of popping into place.
              initial={reduced ? false : { x: i === 0 ? 40 : -40, scale: 0.94 }}
              animate={{ x: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-opacity duration-500 ease-out
                ${i === activeHandIndex && gameStep === 'human_playing' ? 'ring-2 ring-gold bg-black/20' : gameStep === 'human_playing' ? 'opacity-40' : ''}`}
            >
              <span className="text-[0.65rem] text-gold font-semibold uppercase tracking-wide">{t('casino.table.handNo', { n: i + 1 })}</span>
              <Hand cards={hand} animateFrom={1} totalClass="text-[0.75rem]" />
              {handDoubled.has(i) && <span className="text-[0.625rem] text-gold">{t('casino.table.doubled')}</span>}
            </motion.div>
          ))}
        </div>
      ) : (
        <Hand cards={humanCards.slice(0, humanVisibleCards)} totalClass="text-sm" />
      )}

      {/*
        Per-player settlement result label.

        Transform only. This is the answer to "what just happened to my hand",
        so a frozen frame loop must leave it small-then-settling, never absent —
        it used to enter from `opacity: 0` and a stalled animation left the
        player looking at a settled table with no result on it.
      */}
      {humanSettlement && gameStep === 'settlement' && (
        <motion.div
          initial={reduced ? false : { scale: 0.8 }}
          animate={{ scale: 1 }}
          className={`text-sm md:text-base font-black whitespace-nowrap drop-shadow-lg px-2 py-0.5 rounded ${
            humanSettlement.result === 'blackjack'
              ? 'bg-gold text-casino-bg'
              : humanSettlement.profit > 0 ? 'text-success'
              : humanSettlement.profit < 0 ? 'text-error'
              : 'text-gold'
          }`}
          data-testid="human-settlement"
        >
          {t(SETTLEMENT_KEY[humanSettlement.result])} {humanSettlement.profit > 0 ? '+' : ''}{formatDollar(humanSettlement.profit)}
        </motion.div>
      )}

      {isSurrendered && <span className="text-[0.65rem] text-warning font-semibold">{t('casino.table.surrendered')}</span>}

      <NamePlate name={t('casino.table.you')} bankroll={bankroll} you />

      {/* Active glow */}
      {isActivePlayer && (
        <motion.div
          className="absolute -inset-2 rounded-xl pointer-events-none"
          style={{ boxShadow: '0 0 20px rgba(212, 168, 67, 0.4), 0 0 40px rgba(212, 168, 67, 0.15)' }}
          // Opacity loops survive `reducedMotion` — it only disables transform
          // and layout — so this one has to be switched off by hand. A pulse is
          // the kind of motion you cannot look away from.
          animate={reduced ? { opacity: 0.8 } : { opacity: [0.5, 1, 0.5] }}
          transition={reduced ? { duration: 0 } : { duration: 1.5, repeat: Infinity }}
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
  const { t } = useTranslation()
  const reducedBot = useReducedMotion()
  const hasSplit = bot.hands.length > 1
  const showSplitHands = hasSplit && splitVisibleCards !== undefined

  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
      style={{ flex: '0 0 auto', minWidth: '140px' }}
      data-testid="bot-seat"
    >
      <BetChip amount={bot.currentBet} active={isActivePlayer} />

      {/* Split hands — per-hand visibility mode */}
      {showSplitHands && gameStep !== 'betting' && (
        <div className="flex flex-wrap justify-center gap-3 max-w-[420px]">
          {bot.hands.map((hand, hi) => {
            const handVisible = splitVisibleCards[hi] ?? 0
            const shownCards = hand.cards.slice(0, handVisible)
            if (shownCards.length === 0) return null

            const resultLabel = hand.result === 'win' ? t('casino.table.resultWin') : hand.result === 'push' ? t('casino.table.resultPush') : hand.result === 'loss' ? t('casino.table.resultLoss') : hand.result === 'blackjack' ? t('casino.table.resultBlackjack') : null
            const isHandActive = activeSplitHand === hi
            const hasActiveHand = activeSplitHand >= 0

            return (
              <motion.div key={`${bot.id}-h${hi}`}
                initial={reducedBot ? false : { x: hi === 0 ? 18 : -18, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg ${
                  hasActiveHand ? (isHandActive ? 'ring-2 ring-gold bg-black/20' : 'opacity-40') : ''
                }`}
                style={{ transition: 'opacity 0.4s ease' }}>
                <span className={`text-[0.625rem] font-semibold uppercase ${hasActiveHand && isHandActive ? 'text-gold' : 'text-white/40'}`}>{t('casino.table.handShort', { n: hi + 1 })}</span>
                <Hand cards={shownCards} animateFrom={1} totalClass="text-[0.6875rem]" />
                {resultLabel && gameStep === 'settlement' && (
                  <span className={`text-[0.625rem] font-bold ${
                    (hand.profit ?? 0) > 0 ? 'text-success' : (hand.profit ?? 0) < 0 ? 'text-error' : 'text-white/50'
                  }`}>{resultLabel}</span>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Pre-split mode: the engine has already split, but the animation hasn't
          started. Show ONLY the original two-card pair, and DON'T animate it —
          these cards are already on the table, so they must not re-fly when the
          seat switches into split mode (that caused the odd flick + a 3-card
          flash on re-splits). */}
      {hasSplit && !splitVisibleCards && gameStep !== 'betting' && (() => {
        const pairCards = bot.hands.map(h => h.cards[0]).filter(Boolean).slice(0, 2)
        return <Hand cards={pairCards} animateFrom={pairCards.length} totalClass="text-[0.6875rem]" />
      })()}

      {/* Single hand (no split) */}
      {!hasSplit && gameStep !== 'betting' && (() => {
        const hand = bot.hands[0]
        const visibleCards = hand && visibleLimit !== undefined ? hand.cards.slice(0, visibleLimit) : hand?.cards ?? []
        return <Hand cards={visibleCards} totalClass="text-[0.6875rem]" />
      })()}

      {/* Per-bot settlement result label */}
      {botSettlement && gameStep === 'settlement' && (
        <span className={`text-[0.65rem] md:text-[0.6875rem] font-bold ${
          botSettlement.profit > 0 ? 'text-success' : botSettlement.profit < 0 ? 'text-error' : 'text-white/50'
        }`} data-testid="bot-settlement">
          {hasSplit ? `${t('casino.table.total')}: ` : `${botSettlement.result === 'blackjack' ? t('casino.table.resultBlackjack') : botSettlement.result === 'win' ? t('casino.table.resultWin') : botSettlement.result === 'push' ? t('casino.table.resultPush') : botSettlement.result === 'surrender' ? t('casino.table.resultSurrender') : t('casino.table.resultLoss')} `}
          {botSettlement.profit > 0 ? '+' : ''}{formatDollar(botSettlement.profit)}
        </span>
      )}

      <NamePlate name={bot.name} bankroll={bot.bankroll} />
      <BotStatusBadge status={botStatus} />

      {/* Active glow for bots */}
      {isActivePlayer && (
        <motion.div
          className="absolute -inset-2 rounded-xl pointer-events-none"
          style={{ boxShadow: '0 0 15px rgba(234, 179, 8, 0.3)' }}
          // Same as the human seat's glow: an opacity loop is invisible to
          // `reducedMotion` and has to be stopped explicitly.
          animate={reducedBot ? { opacity: 0.6 } : { opacity: [0.3, 0.8, 0.3] }}
          transition={reducedBot ? { duration: 0 } : { duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  )
}
