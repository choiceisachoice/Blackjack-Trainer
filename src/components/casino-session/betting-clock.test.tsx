import React from 'react'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { BET_SECONDS } from './helpers'

/**
 * The betting clock (Darius, 16 Nov 2026): between rounds the table waits a
 * fixed time for a bet, like an online table, and then deals. Enter deals at
 * once. It deals one round on its own and no more — the player's turn waits.
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

/** Every hand: 16 against a 9, so the hand waits for a decision. */
function stackHands() {
  let n = 0
  const hand = [c(Rank.Ten), c(Rank.Nine, Suit.Clubs), c(Rank.Six, Suit.Spades), c(Rank.Eight, Suit.Diamonds)]
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => hand[n++ % hand.length])
}

function sitDown() {
  render(<CasinoSession />)
  fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Session Length' })).getByRole('button', { name: 'Unlimited' }))
  fireEvent.click(screen.getByRole('button', { name: 'Just Blackjack' }))
  fireEvent.click(screen.getByTestId('start-session'))
  tick(100)
}

describe('the betting clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
    stackHands()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('starts at thirty seconds and counts down', () => {
    sitDown()
    expect(BET_SECONDS).toBe(30)
    expect(screen.getByTestId('bet-clock')).toHaveTextContent('0:30')
    tick(10_000)
    expect(screen.getByTestId('bet-clock')).toHaveTextContent('0:20')
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
  })

  it('deals when the time is up, and then waits for the player', () => {
    sitDown()
    tick(31_000)
    expect(screen.queryByTestId('betting-controls')).toBeNull()
    tick(8000)
    // The hand is the player's to play — for as long as they take.
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
    tick(10 * 60_000)
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
  })

  it('stops while the session is paused', () => {
    sitDown()
    tick(10_000)
    fireEvent.click(screen.getByTestId('pause-button'))
    tick(5 * 60_000)
    expect(screen.queryByTestId('action-stand')).toBeNull()
  })

  it('starts over for the next round', () => {
    sitDown()
    tick(20_000)
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(8000)
    for (let i = 0; i < 3 && screen.queryByTestId('next-hand'); i++) {
      fireEvent.click(screen.getByTestId('next-hand'))
      tick(500)
    }
    expect(screen.getByTestId('bet-clock')).toHaveTextContent(/0:(30|29)/)
  })
})
