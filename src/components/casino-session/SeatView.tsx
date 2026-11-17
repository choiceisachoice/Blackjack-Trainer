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

// ─── The seat every player shares ────────────────────

/**
 * Room for a seat's cards and their total. A split adds a label above and
 * "doubled" below; those run over the top into the open felt, so the room
 * — and with it every betting circle — stays where it is.
 */
const CARDS_ROOM = TABLE_CARD.height + 28
/** The betting circle printed on the felt, and the room its chips stand in. */
export const SPOT_SIZE = 66
const SPOT_ROOM = SPOT_SIZE + 26

/**
 * One seat at the table, the same for everybody who sits at it.
 *
 * The parts have fixed heights, top to bottom: the cards, the betting circle,
 * one line for what is happening (a bot's "Stand", then the result), the name.
 * That is what puts every betting circle on the same curve. The player's seat and a bot's seat used to be two
 * different stacks of parts — a bot had a status badge under its name, the
 * player a taller result line — and the row was aligned at the bottom, so the
 * player's chip stood higher than the chip of the bot beside it (Darius,
 * 16 Nov 2026: "Es sollte alles symmetrisch an einer Rundung am Tisch
 * platziert sein").
 *
 * The cards lie between the circle and the dealer and the chips are in front
 * of the player, as on a table.
 */
function SeatShell({ testid, slotWidth, dimmed = false, active = false, cards, spot, result, name, status }: {
  testid: string
  slotWidth: number
  dimmed?: boolean
  active?: boolean
  cards?: React.ReactNode
  spot: React.ReactNode
  result?: React.ReactNode
  name?: React.ReactNode
  status?: React.ReactNode
}) {
  const reduced = useReducedMotion()
  return (
    <div
      className={`relative flex flex-col items-center transition-opacity ${dimmed ? 'opacity-40' : ''}`}
      style={{ width: slotWidth }}
      data-testid={testid}
    >
      <div className="flex items-end justify-center" style={{ height: CARDS_ROOM }}>{cards}</div>
      <div className="relative flex items-end justify-center w-full" style={{ height: SPOT_ROOM }}>
        {/* Whose turn it is, said on the betting circle — as on a live table.
            It used to be a glowing rectangle round the whole seat, which at
            the outer seats ran over the rim and, round a split hand's own
            frame, drew one box inside another (design review, 17 Nov 2026). */}
        {active && (
          <motion.span
            aria-hidden
            data-testid="seat-turn"
            className="absolute bottom-0 left-1/2 rounded-full pointer-events-none border-2 border-gold"
            style={{
              width: SPOT_SIZE, height: SPOT_SIZE, marginLeft: -SPOT_SIZE / 2,
              boxShadow: '0 0 0 4px rgba(212,168,71,.22), 0 0 22px rgba(212,168,71,.55)',
            }}
            // Opacity loops survive `reducedMotion` — it only disables transform
            // and layout — so this one has to be switched off by hand. A pulse is
            // the kind of motion you cannot look away from.
            animate={reduced ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
            transition={reduced ? { duration: 0 } : { duration: 1.5, repeat: Infinity }}
          />
        )}
        {spot}
      </div>
      {/* One line, there from the deal on: what the seat is doing, and at
          settlement what it won or lost. Inserted only when there was a result
          it pushed every seat's cards up in the same frame. */}
      <div className="flex items-center justify-center" style={{ height: 26 }} data-testid="seat-result">{result ?? status}</div>
      <div className="flex items-center justify-center" style={{ height: 36 }}>{name}</div>

    </div>
  )
}

/**
 * The betting circle and what stands in it.
 *
 * The circle is printed on the felt for every seat, taken or not. While bets
 * are placed the player's own circles are buttons: a click puts the chips on
 * that hand alone (the circle turns gold), a second click lets go, and the
 * small × takes the hand off the table.
 */
function BetSpot({ amount, outcome = null, payout, pick }: {
  amount: number
  outcome?: ChipOutcome
  payout?: number
  pick?: SeatPick
}) {
  const { t } = useTranslation()
  return (
    <>
      <span
        aria-hidden
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border-2 transition-[border-color,box-shadow,background-color] duration-150
          ${pick?.selected ? 'border-gold bg-gold/10 shadow-[0_0_0_4px_rgba(212,168,71,.22)]' : 'border-white/25'}`}
        style={{ width: SPOT_SIZE, height: SPOT_SIZE }}
        data-testid="bet-spot"
      />
      <div className="relative" style={{ marginBottom: (SPOT_SIZE - 46) / 2 }}>
        <ChipStack amount={amount} outcome={outcome} payout={payout} bare />
      </div>
      {pick && (
        <>
          <button
            type="button"
            onClick={pick.onSelect}
            aria-pressed={pick.selected}
            aria-label={t('casino.table.handNo', { n: pick.index + 1 })}
            data-testid={`box-${pick.index + 1}`}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full cursor-pointer hover:bg-white/10"
            style={{ width: SPOT_SIZE, height: SPOT_SIZE }}
          />
          {pick.onClose && (
            <button
              type="button"
              onClick={pick.onClose}
              aria-label={t('casino.table.removeHand', { n: pick.index + 1 })}
              data-testid={`box-close-${pick.index + 1}`}
              className="absolute z-10 w-7 h-7 rounded-full bg-black/75 border border-white/30 text-white/85
                text-base leading-none font-bold cursor-pointer hover:bg-[#c8102e] hover:border-transparent transition-colors"
              style={{ bottom: SPOT_SIZE - 14, left: `calc(50% + ${SPOT_SIZE / 2 - 10}px)` }}
            >×</button>
          )}
        </>
      )}
    </>
  )
}

/**
 * A seat nobody sits at: its betting circle, and — when the player may take
 * another hand — a plus in it. One click and the seat is theirs.
 */
export function EmptySeat({ seat, slotWidth = 200, onOpen }: {
  /** The seat's number at the table, from 0. */
  seat: number
  slotWidth?: number
  /** Present when the player may open a hand here. */
  onOpen?: () => void
}) {
  const { t } = useTranslation()
  return (
    <SeatShell
      testid="empty-seat"
      slotWidth={slotWidth}
      spot={onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('casino.table.addHand')}
          data-testid={`seat-open-${seat + 1}`}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 grid place-items-center rounded-full border-2 border-dashed border-gold/60 text-gold-bright
            text-3xl leading-none font-semibold cursor-pointer transition-colors hover:bg-gold hover:text-on-gold hover:border-solid hover:border-gold"
          style={{ width: SPOT_SIZE, height: SPOT_SIZE }}
        >+</button>
      ) : (
        <span
          aria-hidden
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border-2 border-white/25"
          style={{ width: SPOT_SIZE, height: SPOT_SIZE }}
          data-testid="bet-spot"
        />
      )}
    />
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
  /**
   * While betting: this hand can be picked (the chips then go on it alone),
   * taken off the table, and — on the player's last hand — joined by another.
   */
  pick?: SeatPick
}

/** What a hand on the felt offers while bets are placed. */
export interface SeatPick {
  /** Which of the player's hands this is, from 0. */
  index: number
  /** Chips go on this hand only. */
  selected: boolean
  /** Show "Hand n" — the player holds more than one. */
  numbered: boolean
  onSelect: () => void
  /** Present when the hand may be removed. */
  onClose?: () => void
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
  pick,
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
    <SeatShell
      testid="human-seat"
      slotWidth={slotWidth}
      dimmed={isDimmed}
      active={isActivePlayer}
      cards={isSplit ? (
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
      spot={<BetSpot amount={stake} outcome={humanOutcome} payout={humanSettlement?.profit} pick={pick} />}
      /*
        The result, in a line whose height is there from the deal on: inserted
        at settlement it pushed every seat's cards up in the same frame.
        Transform only — a frozen frame loop must leave it small-then-settling,
        never absent.
      */
      result={humanSettlement && gameStep === 'settlement' ? (
        <motion.div
          initial={reduced ? false : { scale: 0.8 }}
          animate={{ scale: 1 }}
          className={`text-sm font-black whitespace-nowrap drop-shadow-lg px-2 rounded ${
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
      ) : pick?.numbered ? (
        <span className={`text-[0.75rem] font-semibold uppercase tracking-wide ${pick.selected ? 'text-gold-bright' : 'text-white/55'}`}>
          {t('casino.table.handNo', { n: pick.index + 1 })}
        </span>
      ) : null}
      name={<NamePlate name={t('casino.table.you')} bankroll={bankroll} you />}
      status={isSurrendered ? <span className="text-[0.65rem] text-warning font-semibold">{t('casino.table.surrendered')}</span> : null}
    />
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

  const botOutcome: ChipOutcome = gameStep !== 'settlement' || !botSettlement ? null
    : botSettlement.profit > 0 ? 'win' : botSettlement.profit < 0 ? 'loss' : 'push'

  // What lies in front of the bot. Three cases: the split hands as the replay
  // has them now; the pair the engine has already split while the replay has
  // not started (shown still, from the turn log — after a re-split the first
  // cards of the final hands are not the two that were dealt); one hand.
  let cards: React.ReactNode = null
  if (gameStep !== 'betting') {
    if (showSplitHands) {
      cards = (
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
      )
    } else if (hasSplit) {
      const pairCards = bot.turnLog?.[0]?.hands[0]?.cards
        ?? bot.hands.map(h => h.cards[0]).filter(Boolean).slice(0, 2)
      cards = <Hand cards={pairCards} animateFrom={pairCards.length} totalClass="text-[0.6875rem]" width={single.width} reach={single.reach} />
    } else {
      const hand = bot.hands[0]
      const visibleCards = hand && visibleLimit !== undefined ? hand.cards.slice(0, visibleLimit) : hand?.cards ?? []
      const moment: HandMoment | null = isNatural(visibleCards, false) ? 'blackjack'
        : gameStep === 'settlement' && (botSettlement?.profit ?? 0) > 0 ? 'win' : null
      cards = <Hand cards={visibleCards} totalClass="text-[0.6875rem]" width={single.width} reach={single.reach} moment={moment} />
    }
  }

  return (
    <SeatShell
      testid="bot-seat"
      slotWidth={slotWidth}
      dimmed={isDimmed}
      active={isActivePlayer}
      cards={cards}
      spot={<BetSpot amount={botStake} outcome={botOutcome} payout={botSettlement?.profit} />}
      result={botSettlement && gameStep === 'settlement' ? (
        <span className={`text-[0.6875rem] font-bold ${
          botSettlement.profit > 0 ? 'text-success' : botSettlement.profit < 0 ? 'text-error' : 'text-white/50'
        }`} data-testid="bot-settlement">
          {hasSplit ? `${t('casino.table.total')}: ` : `${botSettlement.result === 'blackjack' ? t('casino.table.resultBlackjack') : botSettlement.result === 'win' ? t('casino.table.resultWin') : botSettlement.result === 'push' ? t('casino.table.resultPush') : botSettlement.result === 'surrender' ? t('casino.table.resultSurrender') : t('casino.table.resultLoss')} `}
          {botSettlement.profit > 0 ? '+' : ''}{formatDollar(botSettlement.profit)}
        </span>
      ) : null}
      name={<NamePlate name={bot.name} bankroll={bot.bankroll} />}
      status={gameStep === 'betting' ? undefined : <BotStatusBadge status={botStatus} />}
    />
  )
}
