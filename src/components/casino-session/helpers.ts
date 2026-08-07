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

/** The shortest the scene may get before the seats start fighting the dealer. */
export const TABLE_MIN_HEIGHT = 420

export interface TableFit {
  /** Factor to apply to the whole scene. */
  scale: number
  /** Height to draw the scene at, *before* scaling. */
  sceneHeight: number
}

/**
 * Fit the table to its box.
 *
 * ## Why the scale comes from the width alone
 *
 * The obvious version takes `min(w/dw, h/dh)` — fit both axes. Tried, and it
 * traded one screen for another: an ultrawide gained 70%, but a 1280x720 laptop
 * *lost* 19%, because a short box forced the whole scene down. Shrinking the
 * one size that was never the problem is not a fix.
 *
 * So the width sets the scale, and the height follows: the scene is drawn
 * taller or shorter so that, once scaled, it exactly fills the box. That is
 * what the old flexible layout did with its `flex-1` middle band, kept intact —
 * the difference is that now the whole scene grows with the screen instead of
 * stopping at 1120px while its contents stay pinned to hard-coded pixels.
 *
 * Returns a scale of **1** for an unmeasured box. Zero would paint nothing, and
 * a first frame of nothing is the failure mode this codebase keeps meeting.
 */
export function fitTable(
  available: Size,
  design: Size = TABLE_DESIGN,
  maxScale = TABLE_MAX_SCALE,
): TableFit {
  const fallback = { scale: 1, sceneHeight: design.height }
  if (design.width <= 0 || design.height <= 0) return fallback

  const raw = available.width / design.width
  if (!Number.isFinite(raw) || raw <= 0) return fallback

  const scale = Math.min(raw, maxScale)

  // The height the scene must be drawn at so that scaling lands exactly on the
  // box. Floored, so a very short window compresses the felt rather than
  // clipping the seats off the bottom.
  const wanted = available.height / scale
  const sceneHeight = Number.isFinite(wanted)
    ? Math.max(TABLE_MIN_HEIGHT, wanted)
    : design.height

  return { scale, sceneHeight }
}

export function formatDollar(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString()}`
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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

export function cardLabel(c: Card): string {
  return `${c.rank}${SUIT_MAP[c.suit] ?? c.suit}`
}

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
  blackjack: { bg: 'bg-gold', text: 'text-black' },
  twentyone: { bg: 'bg-green-400/90', text: 'text-white' },
  win: { bg: 'bg-green-500/80', text: 'text-white' },
  loss: { bg: 'bg-red-500/80', text: 'text-white' },
  push: { bg: 'bg-gray-400/80', text: 'text-black' },
}

export const BOT_STATUS_LABEL: Record<BotStatus, string> = {
  wait: 'Wait',
  thinking: 'Thinking...',
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double Down',
  split: 'Split',
  surrender: 'Surrender',
  bust: 'BUST!',
  blackjack: 'Blackjack!',
  twentyone: '21!',
  win: 'Win',
  loss: 'Loss',
  push: 'Push',
}
