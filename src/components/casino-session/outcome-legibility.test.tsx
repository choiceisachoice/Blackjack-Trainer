import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BotStatusBadge } from './CardComponents'
import { HumanSeat } from './SeatView'
import { Rank, Suit, type Card } from '../../engine/shoe/types'

/**
 * What the table tells you about your hand must survive a frozen animation.
 *
 * The result of a round is the payload of the whole screen. It entered from
 * `opacity: 0`, so any condition that stops animation frames advancing left the
 * player looking at a settled table with no idea what had happened — the same
 * failure already fixed on the drill card, in the place where it costs money on
 * screen rather than a practice round.
 *
 * Runs against the **real** framer-motion on purpose. The casino session's own
 * test file mocks the library and strips `initial`/`animate`, which is right for
 * testing game logic and is exactly why 56 passing tests never saw this.
 *
 * Fake timers stall the frames, which is the frozen condition itself.
 */

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit })

/** Opacity as the browser would use it, multiplied down the ancestor chain. */
function effectiveOpacity(el: HTMLElement): number {
  let value = 1
  let node: HTMLElement | null = el
  while (node) {
    const own = node.style.opacity
    if (own !== '') value *= Number(own)
    node = node.parentElement
  }
  return value
}

const seatProps = {
  humanHands: [[card(Rank.Ace, Suit.Spades), card(Rank.King, Suit.Hearts)]],
  humanVisibleCards: 2,
  activeHandIndex: 0,
  currentBet: 50,
  bankroll: 1000,
  // A set of the hand indices that were doubled — empty here. It used to be a
  // boolean; the fixture kept the old shape after the component moved to split
  // hands, and only the type checker noticed.
  handDoubled: new Set<number>(),
  isSurrendered: false,
  gameStep: 'settlement' as const,
  isActivePlayer: false,
  isDimmed: false,
  // Settlement is the opposite end of the round from the deal, so `false` is
  // the value this fixture has always implied — it simply predates the prop.
  isDealPhase: false,
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the settlement label on the human seat', () => {
  it('is readable the moment it appears', () => {
    render(
      <HumanSeat {...seatProps} humanSettlement={{ label: 'Blackjack!', profit: 75 }} />,
    )
    const label = screen.getByTestId('human-settlement')
    expect(label).toHaveTextContent('Blackjack!')
    expect(effectiveOpacity(label)).toBe(1)
  })

  it('is readable for a loss too', () => {
    // Losses are the ones a player is most likely to have looked away from and
    // come back to.
    render(
      <HumanSeat {...seatProps} humanSettlement={{ label: 'Loss', profit: -50 }} />,
    )
    expect(effectiveOpacity(screen.getByTestId('human-settlement'))).toBe(1)
  })
})

describe('the bot status badge', () => {
  it('is readable the moment it appears', () => {
    render(<BotStatusBadge status="bust" />)
    const badge = screen.getByTestId('bot-status')
    expect(badge.textContent?.trim()).not.toBe('')
    expect(effectiveOpacity(badge)).toBe(1)
  })

  it('stays readable when the status changes', () => {
    // Each status is keyed, so a change remounts the badge and replays whatever
    // entrance it declares. An opacity entrance therefore hid the badge afresh
    // on every single transition, not just the first.
    const { rerender } = render(<BotStatusBadge status="thinking" />)
    rerender(<BotStatusBadge status="stand" />)
    expect(effectiveOpacity(screen.getByTestId('bot-status'))).toBe(1)
  })
})
