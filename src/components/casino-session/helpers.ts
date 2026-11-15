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
export const TABLE_DESIGN = { width: 1120, height: 640 } as const

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
 * Top rail (the shoe, about 171px) plus a settled seat row (about 222px) plus
 * the felt's own border and padding (50px) leave the legend some 75px at this
 * height — enough that it sits between the dealer and the chips instead of on
 * top of both. It was 420, where that band was zero: the legend ran through
 * the dealer's total and the middle seats' chips.
 */
export const TABLE_MIN_HEIGHT = 520

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
 * A seat is 140px at rest and the row's gaps are 20–32px; the allowance on
 * top is the arc's rim and the felt's border.
 *
 * @param seats - Seats at the table, the player's included
 */
export function tableMinWidth(seats: number): number {
  return Math.min(TABLE_DESIGN.width, Math.max(TABLE_MIN_WIDTH, seats * 150 + 60))
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

/** The body colour of a chip and the ink that stays legible on it. */
export interface ChipFace {
  /** CSS colour for the chip body, always a token reference. */
  readonly fill: string
  /** Tailwind text-colour class for the value printed on the chip. */
  readonly ink: string
}

/**
 * Map a bet denomination to a chip colour, following casino convention.
 *
 * The four `--color-chip-*` tokens have existed in `index.css` since the theme
 * was written and were referenced by nothing — `bg-chip-red`, `bg-chip-green`
 * and `bg-chip-black` had zero occurrences in the whole app, while the betting
 * controls rendered every denomination as the same grey rectangle. This is what
 * they were declared for.
 *
 * The thresholds are the real table convention rather than an arbitrary ramp,
 * so a player who has sat at a table reads the value before reading the number:
 * red fives, blue tens, green twenty-fives, black hundreds. Above five hundred
 * the house colour takes over, because the palette has no purple and inventing
 * one for a single denomination would put a fifth colour outside the theme.
 *
 * Ink is chosen by the fill and never by the theme — the rule the light-theme
 * work in `CLAUDE.md` left behind — which is why the gold chip gets
 * `text-on-gold` and not `text-white`.
 *
 * @param value Denomination in whole currency units. Values below five, which
 *   `getChipDenominations` can produce from a low table minimum, take the red
 *   face rather than a colour of their own.
 * @returns The chip's fill colour and the text colour to print on it.
 */
export function chipFace(value: number): ChipFace {
  if (value >= 500) return { fill: 'var(--color-gold)', ink: 'text-on-gold' }
  if (value >= 100) return { fill: 'var(--color-chip-black)', ink: 'text-white' }
  if (value >= 25) return { fill: 'var(--color-chip-green)', ink: 'text-white' }
  if (value >= 10) return { fill: 'var(--color-chip-blue)', ink: 'text-white' }
  return { fill: 'var(--color-chip-red)', ink: 'text-white' }
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
