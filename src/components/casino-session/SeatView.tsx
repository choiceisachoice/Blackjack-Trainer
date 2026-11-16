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
import type { BotPlayer, BotRoundResult, BotTurnHandView } from '../../engine/casino-session/types'
import { AnimatedTableCard, BotStatusBadge } from './CardComponents'
import { ChipStack, type ChipOutcome } from './Chip'
import { formatDollar, handValueStr, TABLE_CARD } from './helpers'
import type { BotStatus, GameStep } from './helpers'

const CARD_W = TABLE_CARD.width
const CARD_STEP = TABLE_CARD.step
/** Two cards side by side: what a seat is centred on. */
const HAND_BASE = CARD_W + CARD_STEP
const SPLIT_GAP = 10

/**
 * One fanned hand of cards + its total.
 *
 * **Nothing already on the table moves when a card arrives.** The hand used to
 * be a centred flex row, so every hit re-centred it: the cards the player was
 * reading slid left by half a card, and the seat grew with them. Cards are now
 * placed from the left edge of a box that never changes size — `width` — and a
 * new card lands to the right of the last one.
 *
 * `reach` is how far to the right the fan may extend (a single hand may run
 * over its box into the free part of its seat). Only a hand too long for its
 * reach tightens its step, and a box narrower than one card scales the hand.
 */
function Hand({ cards, animateFrom = 0, totalClass = 'text-sm', width = HAND_BASE, reach = width, moment = null }: {
  cards: Card[]; animateFrom?: number; totalClass?: string
  /** A blackjack or a win, from the seat; a bust the hand sees for itself. */
  moment?: HandMoment | null
  /** Width of the box the hand is laid out in. */
  width?: number
  /** How far from the box's left edge the last card may end. */
  reach?: number
}) {
  const scale = Math.min(1, width / (CARD_W + 10))
  const room = Math.max(CARD_W, reach / scale)
  const step = cards.length > 1 ? Math.min(CARD_STEP, (room - CARD_W) / (cards.length - 1)) : CARD_STEP
  // A bust is on the table the moment the card that causes it is: no seat has
  // to tell the hand. It outranks anything the seat says.
  const bust = cards.length > 2 && Number(handValueStr(cards)) > 21
  const shown: HandMoment | null = bust ? 'bust' : moment
  const fan = CARD_W + step * Math.max(0, cards.length - 1)
  return (
    <div
      className="flex flex-col items-center gap-0.5"
      style={{ width }}
      {...(cards.length === 0 ? { 'aria-hidden': true, 'data-testid': 'hand-placeholder' } : {})}
    >
      {/* The room is there before the first card: the seat row is bottom-aligned,
          and a hand that appeared with its first card pushed its chip up by a
          card's height in one frame. */}
      <div className="relative self-start" style={{ height: TABLE_CARD.height, width: width / scale, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left' }}>
        {cards.map((c, ci) => (
          <div
            key={ci}
            className="absolute top-0 transition-[filter] duration-500"
            style={{ zIndex: ci, left: ci * step, filter: bust ? 'grayscale(0.7) brightness(0.62)' : undefined }}
          >
            <AnimatedTableCard card={c} animateIn={ci >= animateFrom} size="player" />
          </div>
        ))}
        {shown && <HandBanner key={shown} moment={shown} left={fan / 2} />}
      </div>
      <span className={`${totalClass} text-white/90 font-bold ${cards.length === 0 ? 'invisible' : ''}`}>{cards.length === 0 ? '0' : handValueStr(cards)}</span>
    </div>
  )
}

/** Two cards making 21 on a hand that was not split: a blackjack. */
function isNatural(cards: Card[], split: boolean): boolean {
  return !split && cards.length === 2 && handValueStr(cards) === '21'
}

/** The moments a hand can have: the two that end it, and being paid. */
export type HandMoment = 'blackjack' | 'bust' | 'win'

const MOMENT_STYLE: Record<HandMoment, { key: string; className: string }> = {
  blackjack: { key: 'casino.bot.blackjack', className: 'bg-gold-bright text-on-gold' },
  bust: { key: 'casino.bot.bust', className: 'bg-[#c8102e] text-white' },
  win: { key: 'casino.table.resultWin', className: 'bg-[#15803d] text-white' },
}

/**
 * What happened to a hand, said on the hand.
 *
 * A blackjack, a bust and a win used to be a word in small type under the
 * cards, the same size as the name. At a table they are the three things
 * everybody looks up for — so each is a plate across the cards the moment it
 * happens, and a blackjack gets one sweep of light.
 *
 * It enters by scale, never by opacity: a result must be readable even if an
 * animation frame is dropped (the rule this table follows for every result).
 */
function HandBanner({ moment, left }: { moment: HandMoment; left: number }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const style = MOMENT_STYLE[moment]
  return (
    <motion.div
      className="absolute z-20 pointer-events-none"
      style={{ left, bottom: 14, x: '-50%' }}
      initial={reduced ? false : { scale: 0.3, rotate: -14 }}
      animate={{ scale: 1, rotate: -5 }}
      transition={{ type: 'spring', stiffness: 520, damping: 17 }}
      data-testid="hand-banner"
      data-moment={moment}
    >
      <div className={`relative overflow-hidden rounded-md px-2.5 py-1 text-[0.8125rem] font-black uppercase tracking-[0.08em] whitespace-nowrap
        shadow-[0_3px_0_rgba(0,0,0,.35),0_6px_14px_rgba(0,0,0,.45)] ${style.className}`}>
        {t(style.key).replace(/!$/, '')}
        {moment === 'blackjack' && !reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-1/3 bg-white/70 skew-x-[-20deg]"
            initial={{ left: '-40%' }}
            animate={{ left: '120%' }}
            transition={{ duration: 0.7, delay: 0.25, ease: 'easeInOut' }}
          />
        )}
      </div>
    </motion.div>
  )
}

/**
 * How a seat's hands share its slot.
 *
 * One hand sits on the two-card base in the middle of the slot and may fan
 * into the free half to its right. Split hands divide the slot evenly, but a
 * hand is never narrower than two readable cards: three or four hands run over
 * the slot's edges into the free felt beside it instead of being squeezed until
 * a card hides the one under it. Either way the seat itself keeps its width, so
 * a split no longer pushes every other seat along the table — it used to, four
 * times per re-split.
 */
function handBoxes(slotWidth: number, hands: number): { width: number; reach: number } {
  if (hands <= 1) return { width: HAND_BASE, reach: HAND_BASE + Math.max(0, (slotWidth - HAND_BASE) / 2 - 4) }
  const share = Math.floor((slotWidth - SPLIT_GAP * (hands - 1)) / hands)
  const width = Math.max(HAND_BASE, Math.min(HAND_BASE + CARD_STEP, share))
  return { width, reach: width }
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
  /** Width of this seat's slot on the table, in table units. */
  slotWidth?: number
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
  slotWidth = 200,
}: HumanSeatProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const isSplit = humanHands.length > 1
  const humanCards = humanHands[activeHandIndex] ?? []
  // What lies on the table: one bet per hand, two on a doubled one. The chip
  // used to show the opening bet only, so doubling $20 still read $20.
  const stake = currentBet * humanHands.reduce((n, _, i) => n + (handDoubled.has(i) ? 2 : 1), 0)
  const box = handBoxes(slotWidth, humanHands.length)
  // Where the chips go once the hand is settled. A surrender loses (half) the bet.
  const humanOutcome: ChipOutcome = gameStep !== 'settlement' || !humanSettlement ? null
    : humanSettlement.result === 'surrender' ? 'loss'
    : humanSettlement.result
  // A natural shows as soon as both cards are down, not at settlement.
  const shownCards = humanCards.slice(0, humanVisibleCards)
  const humanMoment: HandMoment | null = isNatural(shownCards, isSplit) ? 'blackjack'
    : humanOutcome === 'win' ? 'win' : null

  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
      style={{ width: slotWidth }}
      data-testid="human-seat"
    >
      <ChipStack amount={stake} outcome={humanOutcome} payout={humanSettlement?.profit} />

      {/* Cards */}
      {isSplit ? (
        <div className="flex justify-center" style={{ gap: SPLIT_GAP }}>
          {humanHands.map((hand, i) => (
            <motion.div
              key={`hand-${i}`}
              // The hands do not slide: their boxes are where they will stay,
              // and the cards are dealt into them.
              initial={reduced ? false : { scale: 0.96 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`flex flex-col items-center gap-0.5 py-1 rounded-lg transition-opacity duration-500 ease-out
                ${i === activeHandIndex && gameStep === 'human_playing' ? 'ring-2 ring-gold bg-black/20' : gameStep === 'human_playing' ? 'opacity-40' : ''}`}
            >
              <span className="text-[0.65rem] text-gold font-semibold uppercase tracking-wide">{t('casino.table.handNo', { n: i + 1 })}</span>
              <Hand cards={hand} animateFrom={1} totalClass="text-[0.75rem]" width={box.width} reach={box.reach} />
              {handDoubled.has(i) && <span className="text-[0.625rem] text-gold">{t('casino.table.doubled')}</span>}
            </motion.div>
          ))}
        </div>
      ) : (
        <Hand cards={shownCards} totalClass="text-sm" width={box.width} reach={box.reach} moment={humanMoment} />
      )}

      {/*
        Per-player settlement result label.

        Transform only. This is the answer to "what just happened to my hand",
        so a frozen frame loop must leave it small-then-settling, never absent —
        it used to enter from `opacity: 0` and a stalled animation left the
        player looking at a settled table with no result on it.
      */}
      {/* Its height is there from the deal on. The label used to be inserted
          at settlement, between the cards and the name: every seat's cards and
          chip jumped up by its height in the same frame, the whole row at once. */}
      <div className="h-7 flex items-center justify-center">
      {humanSettlement && gameStep === 'settlement' && (
        <motion.div
          initial={reduced ? false : { scale: 0.8 }}
          animate={{ scale: 1 }}
          className={`text-sm md:text-base font-black whitespace-nowrap drop-shadow-lg px-2 py-0.5 rounded ${
            humanSettlement.result === 'blackjack'
              ? 'bg-gold text-on-gold'
              : humanSettlement.profit > 0 ? 'text-success'
              : humanSettlement.profit < 0 ? 'text-error'
              : 'text-gold'
          }`}
          data-testid="human-settlement"
        >
          {t(SETTLEMENT_KEY[humanSettlement.result])} {humanSettlement.profit > 0 ? '+' : ''}{formatDollar(humanSettlement.profit)}
        </motion.div>
      )}
      </div>

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
  /** The split hands as they lie on the table now, from the replay of the bot's turn. */
  splitHands?: BotTurnHandView[]
  /** Width of this seat's slot on the table, in table units. */
  slotWidth?: number
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
  splitHands,
  slotWidth = 200,
}: BotSeatProps) {
  const { t } = useTranslation()
  const reducedBot = useReducedMotion()
  const hasSplit = bot.hands.length > 1
  const showSplitHands = hasSplit && splitHands !== undefined
  // The chips on the spot are every bet the bot has out: a doubled hand is two
  // bets, a split is one per hand. It used to show the opening bet for the
  // whole round, so a bot that doubled $25 kept one chip and was then paid
  // $50 — right money, wrong picture. The engine plays a bot's turn in one go
  // and the table replays it, so the extra chips appear once the bot has acted.
  const acted = gameStep === 'settlement' || gameStep === 'dealer_playing' || (botStatus !== 'wait' && botStatus !== 'thinking')
  const botStake = acted && bot.hands.length > 0 ? bot.hands.reduce((sum, h) => sum + h.bet, 0) : bot.currentBet
  const single = handBoxes(slotWidth, 1)
  const split = handBoxes(slotWidth, showSplitHands ? splitHands.filter(v => v.cards.length > 0).length : 1)

  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 transition-opacity ${isDimmed ? 'opacity-40' : ''}`}
      style={{ width: slotWidth }}
      data-testid="bot-seat"
    >
      <ChipStack
        amount={botStake}
        outcome={gameStep !== 'settlement' || !botSettlement ? null : botSettlement.profit > 0 ? 'win' : botSettlement.profit < 0 ? 'loss' : 'push'}
        payout={botSettlement?.profit}
      />

      {/* Split hands — exactly the hands on the table at this moment of the
          replay. Keyed by the hand's id, not its position: a re-split inserts
          a hand next to the one split, which slides in while the others make
          room (`layout`), instead of every hand after it changing identity. */}
      {showSplitHands && gameStep !== 'betting' && (
        <div className="flex justify-center" style={{ gap: SPLIT_GAP }}>
          {splitHands.map((view, hi) => {
            const shownCards = view.cards
            if (shownCards.length === 0) return null

            // Results exist only once the replay has caught up with the engine,
            // which is when the settlement shows them.
            const hand = bot.hands[hi]
            const resultLabel = hand?.result === 'win' ? t('casino.table.resultWin') : hand?.result === 'push' ? t('casino.table.resultPush') : hand?.result === 'loss' ? t('casino.table.resultLoss') : hand?.result === 'blackjack' ? t('casino.table.resultBlackjack') : null
            const isHandActive = activeSplitHand === hi
            const hasActiveHand = activeSplitHand >= 0

            return (
              <motion.div key={`${bot.id}-h${view.id}`}
                // No `layout` and no sideways slide. Both moved hands that were
                // already on the table — and `layout` measures in screen pixels
                // inside a scene that is CSS-scaled, so the distances were wrong
                // as well. The boxes are fixed; the cards are dealt into them.
                initial={reducedBot ? false : { scale: 0.96 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`flex flex-col items-center gap-0.5 py-1 rounded-lg ${
                  hasActiveHand ? (isHandActive ? 'ring-2 ring-gold bg-black/20' : 'opacity-40') : ''
                }`}
                style={{ transition: 'opacity 0.4s ease' }}>
                <span className={`text-[0.625rem] font-semibold uppercase ${hasActiveHand && isHandActive ? 'text-gold' : 'text-white/40'}`}>{t('casino.table.handShort', { n: hi + 1 })}</span>
                <Hand cards={shownCards} animateFrom={1} totalClass="text-[0.6875rem]" width={split.width} reach={split.reach}
                  moment={gameStep === 'settlement' && hand?.result === 'win' ? 'win' : null} />
                {resultLabel && gameStep === 'settlement' && (
                  <span className={`text-[0.625rem] font-bold ${
                    (hand?.profit ?? 0) > 0 ? 'text-success' : (hand?.profit ?? 0) < 0 ? 'text-error' : 'text-white/50'
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
          flash on re-splits). The pair comes from the turn log: after a re-split
          the first cards of the final hands are not the two cards that were dealt. */}
      {hasSplit && !splitHands && gameStep !== 'betting' && (() => {
        const pairCards = bot.turnLog?.[0]?.hands[0]?.cards
          ?? bot.hands.map(h => h.cards[0]).filter(Boolean).slice(0, 2)
        return <Hand cards={pairCards} animateFrom={pairCards.length} totalClass="text-[0.6875rem]" width={single.width} reach={single.reach} />
      })()}

      {/* Single hand (no split) */}
      {!hasSplit && gameStep !== 'betting' && (() => {
        const hand = bot.hands[0]
        const visibleCards = hand && visibleLimit !== undefined ? hand.cards.slice(0, visibleLimit) : hand?.cards ?? []
        const moment: HandMoment | null = isNatural(visibleCards, false) ? 'blackjack'
          : gameStep === 'settlement' && (botSettlement?.profit ?? 0) > 0 ? 'win' : null
        return <Hand cards={visibleCards} totalClass="text-[0.6875rem]" width={single.width} reach={single.reach} moment={moment} />
      })()}

      {/* Per-bot settlement result label, in a slot that is always there. */}
      <div className="h-4 flex items-center justify-center">
      {botSettlement && gameStep === 'settlement' && (
        <span className={`text-[0.65rem] md:text-[0.6875rem] font-bold ${
          botSettlement.profit > 0 ? 'text-success' : botSettlement.profit < 0 ? 'text-error' : 'text-white/50'
        }`} data-testid="bot-settlement">
          {hasSplit ? `${t('casino.table.total')}: ` : `${botSettlement.result === 'blackjack' ? t('casino.table.resultBlackjack') : botSettlement.result === 'win' ? t('casino.table.resultWin') : botSettlement.result === 'push' ? t('casino.table.resultPush') : botSettlement.result === 'surrender' ? t('casino.table.resultSurrender') : t('casino.table.resultLoss')} `}
          {botSettlement.profit > 0 ? '+' : ''}{formatDollar(botSettlement.profit)}
        </span>
      )}
      </div>

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
