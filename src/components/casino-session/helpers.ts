import { getHandValue } from '../../engine/rules/hand-utils'
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
