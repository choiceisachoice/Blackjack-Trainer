import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BotStatusBadge } from '../casino-session/CardComponents'
import { HumanSeat } from '../casino-session/SeatView'
import { Rank, Suit, type Card } from '../../engine/shoe/types'

/**
 * Reduced motion has to remove the entrance, not merely stop it.
 *
 * CSS was already handled — `index.css` carries a global
 * `@media (prefers-reduced-motion: reduce)` reset. What no CSS rule can reach
 * is framer-motion, which animates by writing inline styles frame by frame.
 *
 * The obvious fix, one `MotionConfig reducedMotion="user"` at the root, is a
 * trap on its own, and a browser proved it: that setting disables transform
 * animations but does **not** clear `initial`. The drill card sat at
 * `matrix(0.94, …)` permanently, and the dealt cards — `initial={{ x: 170,
 * y: -190 }}` — would have been stranded off-table for good. Turning the
 * animation off had made the layout wrong rather than merely still.
 *
 * So every transform entrance passes `initial={false}` when the preference is
 * set, which tells framer-motion to render at the target. These tests pin that,
 * and they can: in jsdom the animation never advances, so whatever `initial`
 * declares is exactly what stays on the element — the same property that makes
 * the legibility tests meaningful.
 */

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit })

const seatProps = {
  humanHands: [[card(Rank.Ace, Suit.Spades), card(Rank.King, Suit.Hearts)]],
  humanVisibleCards: 2,
  activeHandIndex: 0,
  currentBet: 50,
  bankroll: 1000,
  handDoubled: new Set<number>(),
  isSurrendered: false,
  gameStep: 'settlement' as const,
  isActivePlayer: false,
  isDimmed: false,
  isDealPhase: false,
  humanSettlement: { label: 'Blackjack!', profit: 75 },
}

afterEach(() => { vi.unstubAllGlobals() })

describe('with reduced motion requested', () => {
  beforeEach(() => { preferReducedMotion(true) })

  it('leaves no residual transform on the bot status badge', () => {
    render(<BotStatusBadge status="bust" />)
    expect(screen.getByTestId('bot-status').style.transform || 'none').toBe('none')
  })

  it('leaves no residual transform on the settlement label', () => {
    render(<HumanSeat {...seatProps} />)
    expect(screen.getByTestId('human-settlement').style.transform || 'none').toBe('none')
  })
})
