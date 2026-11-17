import { getHandValue, isBlackjack } from '../../engine/rules/hand-utils'
import { CountingSystemId } from '../../engine/counting/types'
import type { Card } from '../../engine/shoe/types'
import type { CasinoSessionConfig } from '../../engine/casino-session/types'

// ─── Types ───────────────────────────────────────────

export type Phase = 'config' | 'playing' | 'summary'

export type GameStep =
  | 'betting'
  | 'dealing'
  | 'insurance'
  | 'bot_playing'
  | 'human_playing'
  | 'dealer_playing'
  | 'settlement'
  | 'count_check'
  | 'hand_review'
  | 'between_hands'

export type BotStatus = 'wait' | 'thinking' | 'hit' | 'stand' | 'double' | 'split' | 'surrender' | 'bust' | 'blackjack' | 'twentyone' | 'win' | 'loss' | 'push'

// ─── Default Config ──────────────────────────────────

export const DEFAULT_CONFIG: CasinoSessionConfig = {
  sessionMode: 'hands',
  targetHands: 20,
  targetMinutes: 15,
  numBots: 2,
  playerSeatIndex: 3,
  multiHand: false,
  startingBankroll: 5000,
  minBet: 25,
  maxBet: 500,
  numDecks: 6,
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  surrenderAllowed: true,
  blackjackPays: 1.5,
  penetration: 0.75,
  maxSplitHands: 4,
  playStyle: 'counting',
  trainingMode: true,
  countCheckFrequency: 'every5',
  showDeviationHints: true,
  countingSystem: CountingSystemId.HiLo,
  casinoAmbience: true,
}

// ─── Helpers ─────────────────────────────────────────

/**
 * The table's design size, in CSS pixels.
 *
 * The table is drawn once at this size and then scaled to fit, rather than
 * reflowed. Everything inside it — card widths, seat blocks, chip diameters,
 * type sizes — is specified in fixed pixels, so a table that changes size by
 * changing its box keeps postage-stamp contents inside a bigger frame. Scaling
 * the whole scene is the only way those numbers stay in proportion to it.
 *
 * The height is chosen to sit *above* the layout's minimum, not at some ideal:
 * the previous flexible version was in daily use at box heights from roughly
 * 500px upward, so the content demonstrably fits well below 640. Erring high
 * would have made the table shrink on a short window — a regression on the one
 * size that was never the problem.
 */
export const TABLE_DESIGN = { width: 1120, height: 700 } as const

/**
 * The size of a card on the table, in table units.
 *
 * One place, in numbers: the seat layout computes with these, and a card that
 * is sized by a CSS class cannot be computed with. The classes it replaces
 * also switched size at the *viewport's* `md` breakpoint, inside a scene that
 * is scaled as a whole — so the cards changed proportion to their own table.
 *
 * 76 wide, up from 56: on a 1536 × 730 laptop a card was 46 × 66px on screen,
 * which is a thumbnail of a card. `step` is how far each fanned card is moved
 * from the one under it — the width of a "10" index, so no rank is ever hidden.
 */
export const TABLE_CARD = { width: 76, height: 106, step: 36 } as const
/** The dealer's cards, a size up so the hand everyone plays against leads. */
export const DEALER_CARD = { width: 84, height: 118, step: 42 } as const

/**
 * The largest the table is allowed to grow.
 *
 * Without a ceiling, a 3440px monitor would inflate the felt until the cards
 * were the size of coasters. This keeps the table generous on a big screen and
 * still recognisably a table.
 */
export const TABLE_MAX_SCALE = 1.7

export interface Size {
  width: number
  height: number
}

/**
 * The shortest the scene is ever drawn.
 *
 * Top rail (the dealer's hand, about 190px) plus a settled seat row (about
 * 292px with its chip stack) plus the felt's own border and padding (50px) leave the legend some
 * 70px at this height — enough that it sits between the dealer and the chips
 * instead of on top of both. It was 520 with 56px cards, and 420 before that,
 * where the band was zero: the legend ran through the dealer's total and the
 * middle seats' chips.
 */
export const TABLE_MIN_HEIGHT = 624

/**
 * The narrowest the scene is drawn for a table of one seat.
 *
 * Discard tray, dealer and shoe side by side need about this much. A caller
 * with more seats passes its own floor (see `tableMinWidth`).
 */
export const TABLE_MIN_WIDTH = 640

/** How far past the design width the felt may be drawn to use up a wide, short box. */
const TABLE_MAX_WIDTH_FACTOR = 1.3

/**
 * The narrowest scene that still holds a given number of seats in one row.
 *
 * A seat needs two cards side by side and a little air; the allowance on top
 * is the felt's border.
 *
 * @param seats - Seats at the table, the player's included
 */
export function tableMinWidth(seats: number): number {
  return Math.min(TABLE_DESIGN.width, Math.max(TABLE_MIN_WIDTH, seats * (TABLE_CARD.width + TABLE_CARD.step + 44) + 60))
}

export interface TableFit {
  /** Factor to apply to the whole scene. */
  scale: number
  /** Width to draw the scene at, *before* scaling. */
  sceneWidth: number
  /** Height to draw the scene at, *before* scaling. */
  sceneHeight: number
}

/**
 * Fit the table to its box — all of it, at every size.
 *
 * ## What this replaced, and why
 *
 * The scale used to come from the width alone, with the scene's height
 * following and a 420px floor under it. The reasoning was sound as far as it
 * went: fitting both axes with `min(w/dw, h/dh)` made a 1280x720 laptop 19%
 * smaller, and shrinking the one size that was never the problem is not a fix.
 *
 * But below the floor the scene was simply taller than its box, and the box
 * centred it — so the overflow was cut off at *both* ends, and the top half
 * could not even be scrolled to. Measured on 13 Nov 2026 in a 1536x730 window,
 * an ordinary 15" laptop with the browser's bars: 93px gone from the top (the
 * dealer's cards), 97px from the bottom (the player's own total). It only ever
 * fitted at 1080px of viewport height, which is the size the demo recorder
 * films at and the reason nobody saw it.
 *
 * ## The rule now
 *
 * 1. The width still leads. A box that is tall enough gets exactly the scale
 *    it had before — nothing that worked got smaller.
 * 2. The height is a ceiling on that scale, not a second axis to fit: the
 *    scene is never scaled so far that its floor no longer fits the box. A
 *    smaller table that is all there beats a larger one with the dealer cut
 *    off.
 * 3. When the height is what limits it, the scene is drawn *wider* to use the
 *    width that would otherwise sit empty beside it — up to a cap, so a very
 *    wide, very short box does not stretch the felt into a ribbon.
 * 4. A box narrower than the design is first met by drawing a narrower scene
 *    at full size (down to `minWidth`), and only then by scaling. On a 390px
 *    phone a three-seat table used to be scaled to 0.35 — an 18px-wide card;
 *    drawn at 640 it is scaled to 0.58.
 *
 * Returns a scale of **1** for an unmeasured box. Zero would paint nothing, and
 * a first frame of nothing is the failure mode this codebase keeps meeting.
 *
 * @param available - The box the table may fill
 * @param design - The scene's design size
 * @param maxScale - Ceiling on the scale
 * @param minWidth - The narrowest the scene may be drawn before it is scaled
 *   down instead; defaults to the design width (never reflow)
 */
export function fitTable(
  available: Size,
  design: Size = TABLE_DESIGN,
  maxScale = TABLE_MAX_SCALE,
  minWidth = design.width,
): TableFit {
  const fallback = { scale: 1, sceneWidth: design.width, sceneHeight: design.height }
  if (design.width <= 0 || design.height <= 0) return fallback
  if (!Number.isFinite(available.width) || available.width <= 0) return fallback

  const floorWidth = Math.min(Math.max(minWidth, 1), design.width)
  const drawnWidth = Math.min(Math.max(available.width, floorWidth), design.width)
  const widthScale = Math.min(available.width / drawnWidth, maxScale)

  // No usable height (unmeasured, or nonsense): the width alone decides, at
  // the design height, as before.
  if (!Number.isFinite(available.height) || available.height <= 0) {
    return { scale: widthScale, sceneWidth: drawnWidth, sceneHeight: design.height }
  }

  const heightScale = available.height / TABLE_MIN_HEIGHT
  const scale = Math.min(widthScale, heightScale)
  const sceneHeight = Math.max(TABLE_MIN_HEIGHT, available.height / scale)
  const sceneWidth = scale < widthScale
    ? Math.min(available.width / scale, design.width * TABLE_MAX_WIDTH_FACTOR)
    : drawnWidth

  return { scale, sceneWidth, sceneHeight }
}

/**
 * The phone layout: two rows instead of one.
 *
 * In a narrow, upright box the one-row table has no good answer. Measured on
 * a 390 × 844 phone, 16 Nov 2026: three seats gave a 44px card, five bots and
 * the player a 25px one — a thumbnail of a table, with half the felt empty
 * above it. An upright box has height to spare and no width, so the seats are
 * stacked: the other players in a row of their own, drawn smaller
 * (`STACKED_BOT_ZOOM`), and the player's hands below them at full size. That
 * is how a table reads on a phone anywhere: your hand large, the others small.
 */
export const STACKED_BOT_ZOOM = 0.62
/** The bots' row is drawn no larger than this, however few they are. */
const STACKED_BOT_ZOOM_MAX = 0.85
/** The narrowest stacked scene: the dealer's rail needs it. */
const STACKED_MIN_WIDTH = 560
/** The tray and the shoe, drawn smaller so the dealer's hand has the rail. */
export const STACKED_RAIL_ZOOM = 0.55
/** One seat's room in table units: two cards side by side and some air. */
const SEAT_ROOM = TABLE_CARD.width + TABLE_CARD.step + 44

/**
 * Whether a box calls for the stacked layout: narrower than a small tablet
 * and taller than it is wide.
 *
 * @param available - The box the table may fill
 */
export function isStackedBox(available: Size): boolean {
  return Number.isFinite(available.width) && Number.isFinite(available.height)
    && available.width > 0 && available.width < 600 && available.height > available.width
}

/**
 * How large the bots' row is drawn in the stacked layout: as large as the row
 * allows for that many bots, between `STACKED_BOT_ZOOM` (a full table) and
 * 0.85 (one to three bots). At the small end a name is hardly legible; the
 * cards and the chips still are, and those are what is counted.
 *
 * @param bots - Other players at the table
 */
export function stackedBotZoom(bots: number): number {
  if (bots <= 0) return STACKED_BOT_ZOOM_MAX
  const fits = (STACKED_MIN_WIDTH - 60) / (bots * SEAT_ROOM)
  return Math.max(STACKED_BOT_ZOOM, Math.min(STACKED_BOT_ZOOM_MAX, Math.floor(fits * 100) / 100))
}

/**
 * The smallest scene the stacked table can be drawn in.
 *
 * Wide enough for the dealer's rail (five dealer cards between the tray and
 * the shoe), for the player's hands side by side, and for the bots' row at
 * its smaller size; tall enough for the extra row when there are bots.
 *
 * @param bots - Other players at the table
 * @param boxes - Hands the player holds
 */
export function stackedTableSize(bots: number, boxes: number): Size {
  return {
    width: Math.max(STACKED_MIN_WIDTH, boxes * SEAT_ROOM + 60, Math.ceil(bots * SEAT_ROOM * stackedBotZoom(bots)) + 60),
    // Rail, legend, the player's row and the felt's own edge come to about
    // 600; a bot's seat is about 300 tall before it is drawn smaller.
    height: bots > 0 ? 602 + Math.ceil(300 * stackedBotZoom(bots)) : TABLE_MIN_HEIGHT,
  }
}

/**
 * Fit the stacked table to its box: as large as both axes allow, and then the
 * scene is drawn to fill the box exactly, so the felt has no margin.
 *
 * @param available - The box the table may fill
 * @param bots - Other players at the table
 * @param boxes - Hands the player holds
 */
export function fitStackedTable(available: Size, bots: number, boxes: number): TableFit {
  const need = stackedTableSize(bots, boxes)
  const scale = Math.min(available.width / need.width, available.height / need.height, TABLE_MAX_SCALE)
  return { scale, sceneWidth: available.width / scale, sceneHeight: available.height / scale }
}

/**
 * Table limits a hand can actually be dealt under.
 *
 * The setup accepted any three numbers. A minimum above the maximum made every
 * bet illegal — the table sat at "place your bet" for good — and a bankroll
 * below the minimum showed a Deal button that did nothing. The minimum is the
 * figure the player chose first, so it stands; the maximum and the bankroll
 * are raised to meet it.
 *
 * @param limits - The three amounts from the setup screen
 * @returns The same amounts, with `maxBet` and `startingBankroll` no lower than `minBet`
 */
export function playableLimits<L extends { minBet: number; maxBet: number; startingBankroll: number }>(limits: L): L {
  return {
    ...limits,
    maxBet: Math.max(limits.maxBet, limits.minBet),
    startingBankroll: Math.max(limits.startingBankroll, limits.minBet),
  }
}

export function formatDollar(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  // Whole dollars as they always were; anything else to the cent. A surrender
  // on $25 used to read "$4,987.5".
  const text = Number.isInteger(abs)
    ? abs.toLocaleString()
    : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${text}`
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** The colours of a drawn chip. Plain values: an SVG attribute cannot read a CSS variable. */
/** One of the player's hands: the box it was dealt to, and whether a split made it. */
export interface HandInfo {
  /** Which of the player's betting boxes this hand belongs to (0-based). */
  box: number
  /** True once it came out of a split: no blackjack, no surrender. */
  split: boolean
}

/**
 * How many cards of one hand are on the table while the round is being dealt.
 *
 * The deal goes round the table twice, one card each, so with several hands a
 * single "cards shown" number cannot be per hand. `shown` counts the player's
 * cards in the order they are dealt: with two hands, 1 is the first hand's
 * first card, 2 the second hand's first, 3 the first hand's second.
 *
 * @param shown - Cards of the player dealt so far (999 = all)
 * @param box - The hand asked about
 * @param boxes - How many hands the player has
 */
export function visibleForBox(shown: number, box: number, boxes: number): number {
  return (shown > box ? 1 : 0) + (shown > boxes + box ? 1 : 0)
}

/**
 * How long the table waits for bets, in seconds.
 *
 * An online table gives a fixed window and then deals; an open-ended wait is
 * what a trainer does, and it lets the pace of a session fall apart. Thirty
 * seconds is enough to read the count, size the bet and place it — and Enter
 * deals at once for anyone who is ready sooner.
 */
/** How long the player has for a decision on a hand; then the hand stands. */
export const DECISION_SECONDS = 30
export const BET_SECONDS = 30

export interface ChipColor {
  /** The body. */
  readonly fill: string
  /** The rim, a shade darker, so a stack reads as separate chips. */
  readonly edge: string
  /** The inlays on the rim and the ring on the face. */
  readonly inlay: string
  /** The amount printed on the face. */
  readonly ink: string
}

/**
 * The colour of a chip of this value, by the convention every casino uses:
 * white 1, red 5, blue 10, green 25, black 100, purple 500, and gold from
 * 1,000 — the only place on the table gold is a denomination.
 *
 * @param value - The chip's denomination; in-between values take the colour
 *   of the denomination below them
 */
export function chipColor(value: number): ChipColor {
  if (value >= 1000) return { fill: '#d4a847', edge: '#8a6a1f', inlay: '#fff6dc', ink: '#1a1405' }
  if (value >= 500) return { fill: '#6d28d9', edge: '#3f1487', inlay: '#f3ecff', ink: '#ffffff' }
  if (value >= 100) return { fill: '#1c1917', edge: '#000000', inlay: '#f2f1ee', ink: '#ffffff' }
  if (value >= 25) return { fill: '#15803d', edge: '#0b4a23', inlay: '#eafff1', ink: '#ffffff' }
  if (value >= 10) return { fill: '#1e3a8a', edge: '#12234f', inlay: '#e8efff', ink: '#ffffff' }
  if (value >= 5) return { fill: '#c41e3a', edge: '#7a1022', inlay: '#fff0f2', ink: '#ffffff' }
  return { fill: '#e8eaed', edge: '#9aa0a8', inlay: '#3b4048', ink: '#14161a' }
}

/** Denominations a bet is cut into, largest first. */
const STACK_DENOMINATIONS = [1000, 500, 100, 25, 5, 1] as const

/**
 * A bet as the chips that make it up, largest first: 175 → 100, 25, 25, 25.
 * Cents are not chips; the amount is taken down to whole dollars.
 *
 * @param amount - The bet in dollars
 * @returns One entry per chip; empty for no bet
 */
export function chipBreakdown(amount: number): number[] {
  const chips: number[] = []
  let left = Math.max(0, Math.floor(amount))
  for (const d of STACK_DENOMINATIONS) {
    while (left >= d && chips.length < 40) { chips.push(d); left -= d }
  }
  return chips
}

export function getChipDenominations(minBet: number, maxBet: number): number[] {
  const allChips: number[] = [minBet]
  const standards = [5, 10, 15, 25, 50, 100, 200, 250, 500, 1000, 2500, 5000]
  for (const val of standards) {
    if (val > minBet && val <= maxBet && !allChips.includes(val)) allChips.push(val)
  }
  if (!allChips.includes(maxBet)) allChips.push(maxBet)

  if (allChips.length <= 8) return allChips

  const result: number[] = [allChips[0]]
  const targetCount = 8
  for (let i = 1; i < targetCount - 1; i++) {
    const idx = Math.round((i / (targetCount - 1)) * (allChips.length - 1))
    if (!result.includes(allChips[idx])) result.push(allChips[idx])
  }
  if (!result.includes(allChips[allChips.length - 1])) {
    result.push(allChips[allChips.length - 1])
  }
  return result
}

export const SUIT_MAP: Record<string, string> = { Hearts: '\u2665', Diamonds: '\u2666', Clubs: '\u2663', Spades: '\u2660' }

export function handValueStr(cards: Card[]): string {
  if (cards.length === 0) return ''
  const { best } = getHandValue(cards)
  return `${best}`
}

/**
 * A NATURAL blackjack is only possible on an unsplit two-card hand. After a
 * split (handCount > 1), a two-card 21 like [A,10] is a plain 21 — NOT a
 * blackjack — so it must never be shown or paid as one.
 * @param handCount - How many hands the player currently holds (1 = unsplit)
 * @param cards - The hand's cards
 */
export function isNaturalBlackjack(handCount: number, cards: Card[]): boolean {
  return handCount === 1 && isBlackjack(cards)
}

export const BOT_STATUS_STYLE: Record<BotStatus, { bg: string; text: string; animate?: boolean }> = {
  wait: { bg: 'bg-gray-500/60', text: 'text-gray-300' },
  thinking: { bg: 'bg-yellow-500/70', text: 'text-yellow-100', animate: true },
  hit: { bg: 'bg-white/80', text: 'text-black' },
  stand: { bg: 'bg-green-500/80', text: 'text-white' },
  double: { bg: 'bg-orange-500/80', text: 'text-white' },
  split: { bg: 'bg-blue-500/80', text: 'text-white' },
  surrender: { bg: 'bg-purple-500/80', text: 'text-white' },
  bust: { bg: 'bg-red-600/90', text: 'text-white' },
  blackjack: { bg: 'bg-gold', text: 'text-on-gold' },
  twentyone: { bg: 'bg-green-400/90', text: 'text-white' },
  win: { bg: 'bg-green-500/80', text: 'text-white' },
  loss: { bg: 'bg-red-500/80', text: 'text-white' },
  push: { bg: 'bg-gray-400/80', text: 'text-black' },
}

/**
 * What a bot's status bubble says, as translation keys.
 *
 * Keys and not text: this file is plain TypeScript, where the JSX lint rule
 * cannot see it, and these bubbles are on screen for most of a Casino Session.
 */
export const BOT_STATUS_LABEL_KEY: Record<BotStatus, string> = {
  wait: 'casino.bot.wait',
  thinking: 'casino.bot.thinking',
  hit: 'casino.bot.hit',
  stand: 'casino.bot.stand',
  double: 'casino.bot.double',
  split: 'casino.bot.split',
  surrender: 'casino.bot.surrender',
  bust: 'casino.bot.bust',
  blackjack: 'casino.bot.blackjack',
  twentyone: 'casino.bot.twentyone',
  win: 'casino.bot.win',
  loss: 'casino.bot.loss',
  push: 'casino.bot.push',
}

/**
 * Whether a finished casino session is worth writing down.
 *
 * A session that dealt no hands is not a session. Everything downstream ran
 * unconditionally before this existed, so opening the table and leaving again
 * wrote a full record: the 60 XP casino base reward, a zero-hand row in the
 * analytics and the bankroll tracker, and one of the three casino sessions the
 * final curriculum stage asks for — that stage sets `minAccuracy: 0`, so any
 * counted session qualifies. Three open-and-close trips finished the last stage
 * of the training plan without a card being dealt.
 *
 * The drill modes have carried the equivalent threshold from the start
 * (`MIN_QUESTIONS` in `useSessionSave`); the casino path never grew one.
 *
 * @param handsPlayed - Number of hands actually dealt in the session
 */
export function isRecordableSession(handsPlayed: number): boolean {
  return handsPlayed > 0
}
