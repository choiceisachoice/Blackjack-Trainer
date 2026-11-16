import React from 'react'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { visibleForBox } from './helpers'

/**
 * Several hands for one player (Darius, 16 Nov 2026): as at an online table,
 * the player may open more than one box. Each is dealt, played and paid as a
 * hand of its own — a second box can be a blackjack, a hand out of a split
 * cannot — and every one of them is money.
 */
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-') || ['className', 'style', 'onClick', 'id', 'role'].includes(k)))
  return {
    motion: new Proxy({}, {
      get: (_t, tag: string) => ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(p), children),
    }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
    useAnimationControls: () => ({ set: () => {}, start: () => {} }),
  }
})
vi.mock('../../services/casino-ambient', () => ({
  casinoAmbient: { start: vi.fn(), stop: vi.fn(), playing: false, volume: 0.15 },
}))
vi.mock('../table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({ enabled: false, volume: 0 }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) }),
}))
vi.mock('../../store/level-store', () => ({
  useLevelStore: { getState: () => ({ addSessionXP: vi.fn(), addChallengeXP: vi.fn(), addAchievementXP: vi.fn(), addAchievementsXP: vi.fn() }) },
}))

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/** The shoe deals exactly these, in order, then repeats. */
function stack(cards: Card[]) {
  let n = 0
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => cards[n++ % cards.length])
}

function sitDown(hands: number) {
  render(<CasinoSession />)
  fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Session Length' })).getByRole('button', { name: 'Unlimited' }))
  fireEvent.click(screen.getByRole('button', { name: 'Just Blackjack' }))
  fireEvent.click(screen.getByTestId('start-session'))
  tick(100)
  if (hands > 1) fireEvent.click(screen.getByTestId(`hands-${hands}`))
  fireEvent.click(screen.getByText('+$25'))
}

/** Settlement → (review) → back to betting. */
function leaveRound() {
  for (let i = 0; i < 3 && screen.queryByTestId('next-hand'); i++) {
    fireEvent.click(screen.getByTestId('next-hand'))
    tick(500)
  }
}

const settlements = () => screen.getAllByTestId('human-settlement').map(e => e.textContent)

describe('several hands for one player', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows one box per hand while betting, and says what Deal will cost', () => {
    stack([c(Rank.Ten), c(Rank.Nine), c(Rank.Eight), c(Rank.Seven)])
    sitDown(3)
    expect(screen.getAllByTestId('human-seat')).toHaveLength(3)
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$25 × 3')
  })

  it('deals round the boxes in turn, pays each on its own, and a second box can be a blackjack', () => {
    // Deal order with two boxes: box 1, box 2, dealer up, box 1, box 2, hole.
    stack([
      c(Rank.Ten), c(Rank.Ten, Suit.Spades), c(Rank.Nine, Suit.Clubs),
      c(Rank.Nine), c(Rank.Ace, Suit.Spades), c(Rank.Eight, Suit.Diamonds),
    ])
    sitDown(2)
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(10_000)

    // Box 1 holds 19 and is the player's to play; box 2's blackjack is not played.
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(10_000)

    // Dealer 17: the 19 wins $25, the blackjack pays 3 to 2.
    expect(settlements()).toEqual([expect.stringContaining('+$25'), expect.stringContaining('+$37.50')])

    leaveRound()
    fireEvent.click(screen.getByTestId('cash-out'))
    const [session] = useCasinoSessionTrackerStore.getState().sessions
    expect(session.finalBankroll - useCasinoSessionTrackerStore.getState().startingBankroll).toBe(62.5)
  })

  it('plays every box that is not a blackjack, left to right', () => {
    // Two 16s against a 9; both are stood on, the dealer makes 17.
    stack([
      c(Rank.Ten), c(Rank.Ten, Suit.Spades), c(Rank.Nine, Suit.Clubs),
      c(Rank.Six), c(Rank.Six, Suit.Spades), c(Rank.Eight, Suit.Diamonds),
    ])
    sitDown(2)
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(10_000)
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(1000)
    // Still the player's turn: the second box.
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
    expect(screen.queryByTestId('next-hand')).toBeNull()
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(10_000)
    expect(settlements()).toEqual([expect.stringContaining('-$25'), expect.stringContaining('-$25')])
  })

  it('hands every bet back when the session is quit mid-round', () => {
    stack([
      c(Rank.Ten), c(Rank.Ten, Suit.Spades), c(Rank.Ten, Suit.Clubs), c(Rank.Nine, Suit.Clubs),
      c(Rank.Six), c(Rank.Six, Suit.Spades), c(Rank.Six, Suit.Clubs), c(Rank.Eight, Suit.Diamonds),
    ])
    sitDown(3)
    // One round played first, so there is a session to record.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(12_000)
    for (let i = 0; i < 3; i++) { fireEvent.click(screen.getByTestId('action-stand')); tick(1500) }
    tick(10_000)
    leaveRound()
    // Second round: three bets out, then quit from the pause panel.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(12_000)
    fireEvent.click(screen.getByTestId('pause-button'))
    fireEvent.click(screen.getByTestId('quit-session'))

    const [session] = useCasinoSessionTrackerStore.getState().sessions
    // Three 16s lost to a 17 in the round that was played; nothing for the one that was not.
    expect(session.finalBankroll - useCasinoSessionTrackerStore.getState().startingBankroll).toBe(-75)
  })
})

/**
 * Second step (Darius, 16 Nov 2026): a bet of its own on each hand, a hand
 * opened by clicking the felt, and insurance decided hand by hand.
 */
describe('each hand is a bet of its own', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const net = () => {
    const [session] = useCasinoSessionTrackerStore.getState().sessions
    return session.finalBankroll - useCasinoSessionTrackerStore.getState().startingBankroll
  }

  it('chips go on every hand until one is picked, then on that hand alone', () => {
    // 19 and 20 against a dealer 17.
    stack([
      c(Rank.Ten), c(Rank.Ten, Suit.Spades), c(Rank.Nine, Suit.Clubs),
      c(Rank.Nine), c(Rank.King, Suit.Spades), c(Rank.Eight, Suit.Diamonds),
    ])
    sitDown(2)
    expect(screen.getByTestId('bet-focus')).toHaveTextContent('All hands')
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$25 × 2')

    fireEvent.click(screen.getByTestId('box-2'))
    expect(screen.getByTestId('bet-focus')).toHaveTextContent('Hand 2')
    fireEvent.click(screen.getByText('+$25'))
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$25 + $50')

    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(10_000)
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(1000)
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(10_000)
    expect(settlements()).toEqual([expect.stringContaining('+$25'), expect.stringContaining('+$50')])

    // The bets stay where they were for the next round, each on its hand.
    leaveRound()
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$25 + $50')
    fireEvent.click(screen.getByTestId('cash-out'))
    expect(net()).toBe(75)
  })

  it('a double costs the bet of the hand that is doubled', () => {
    // Hand 1: 19 on $25. Hand 2: 11 on $50, doubled into 21 (the shoe starts over with a ten).
    stack([
      c(Rank.Ten), c(Rank.Six, Suit.Spades), c(Rank.Nine, Suit.Clubs),
      c(Rank.Nine), c(Rank.Five, Suit.Spades), c(Rank.Eight, Suit.Diamonds),
    ])
    sitDown(2)
    fireEvent.click(screen.getByTestId('box-2'))
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(10_000)
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(1000)
    fireEvent.click(screen.getByTestId('action-double'))
    tick(12_000)
    expect(settlements()).toEqual([expect.stringContaining('+$25'), expect.stringContaining('+$100')])
    leaveRound()
    fireEvent.click(screen.getByTestId('cash-out'))
    expect(net()).toBe(125)
  })

  it('a hand is opened and taken away again on the felt', () => {
    stack([c(Rank.Ten), c(Rank.Nine), c(Rank.Eight), c(Rank.Seven)])
    sitDown(1)
    expect(screen.getAllByTestId('human-seat')).toHaveLength(1)
    expect(screen.queryByTestId('box-close-1')).toBeNull()

    fireEvent.click(screen.getByTestId('box-open'))
    expect(screen.getAllByTestId('human-seat')).toHaveLength(2)
    // The new hand starts with the bet beside it.
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$25 × 2')

    fireEvent.click(screen.getByTestId('box-open'))
    expect(screen.getAllByTestId('human-seat')).toHaveLength(3)
    // Three is the table's limit.
    expect(screen.queryByTestId('box-open')).toBeNull()

    fireEvent.click(screen.getByTestId('box-close-2'))
    fireEvent.click(screen.getByTestId('box-close-1'))
    expect(screen.getAllByTestId('human-seat')).toHaveLength(1)
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$25')
    expect(screen.getByTestId('confirm-bet')).not.toHaveTextContent('×')
  })

  it('insurance is asked hand by hand, and each hand carries its own', () => {
    // Two 19s against an ace with a king under it.
    stack([
      c(Rank.Ten), c(Rank.Ten, Suit.Spades), c(Rank.Ace, Suit.Clubs),
      c(Rank.Nine), c(Rank.Nine, Suit.Spades), c(Rank.King, Suit.Diamonds),
    ])
    sitDown(2)
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(10_000)

    expect(screen.getByTestId('insurance-ask')).toHaveTextContent('Insure hand 1?')
    fireEvent.click(screen.getByTestId('insurance-yes'))
    expect(screen.getByTestId('insurance-ask')).toHaveTextContent('Insure hand 2?')
    fireEvent.click(screen.getByTestId('insurance-no'))
    tick(10_000)

    // The insured hand loses $25 and wins $25 on the side bet; the other loses $25.
    const [first, second] = settlements()
    expect(first).toContain('$0')
    expect(second).toContain('-$25')
    leaveRound()
    fireEvent.click(screen.getByTestId('cash-out'))
    expect(net()).toBe(-25)
  })
})

describe('visibleForBox — the deal goes round the table twice', () => {
  it('one hand: the first card, then the second', () => {
    expect([0, 1, 2].map(n => visibleForBox(n, 0, 1))).toEqual([0, 1, 2])
  })

  it('two hands: each gets its first card before either gets its second', () => {
    const at = (shown: number) => [visibleForBox(shown, 0, 2), visibleForBox(shown, 1, 2)]
    expect([0, 1, 2, 3, 4].map(at)).toEqual([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]])
  })
})
