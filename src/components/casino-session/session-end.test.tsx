import React from 'react'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { Shoe } from '../../engine/shoe/shoe'
import { CasinoSessionEngine } from '../../engine/casino-session/session-engine'
import { Rank, Suit, type Card } from '../../engine/shoe/types'

/**
 * How a session ends.
 *
 * Darius on 8 Oct 2026: fifteen minutes ran out while he was mid-hand, the
 * count high and the shoe young, and the table threw him onto the summary.
 * Reaching the target must never cut a hand short: the hand is played out,
 * then the player chooses to cash out or keep playing. An unlimited session
 * has no target and ends only on a cash-out — and every session that ends
 * lands in the Casino Session Tracker.
 */
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-') || ['className', 'style', 'onClick', 'id'].includes(k)))
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
// These tests sit at the betting screen for minutes on purpose — the session's
// own clock is what they are about. The betting clock would deal a hand after
// thirty seconds; it has tests of its own (betting-clock.test.tsx).
vi.mock('./helpers', async importOriginal => ({ ...(await importOriginal<typeof import('./helpers')>()), BET_SECONDS: 1_000_000, DECISION_SECONDS: 1_000_000 }))
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

/** Every hand: the player holds 16 against a 9, so the hand waits for a decision. */
function stackHands() {
  let n = 0
  const hand = [c(Rank.Ten), c(Rank.Nine, Suit.Clubs), c(Rank.Six, Suit.Spades), c(Rank.Eight, Suit.Diamonds)]
  // Every card, not four in six. A round here is exactly these four — the
  // dealer's 17 stands — but the stack used to repeat every *six* draws and
  // hand the two in between to the real shoe, so from the second hand on the
  // deal was offset and partly random. Now and then that dealt a blackjack,
  // the Stand button never appeared, and the test failed — in CI on 13 Nov
  // 2026, and about one local run in fifteen.
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => hand[n++ % hand.length])
}

function setUp(mode: 'Time' | 'Unlimited', minutes?: number) {
  render(<CasinoSession />)
  fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Session Length' })).getByRole('button', { name: mode }))
  if (minutes !== undefined) {
    const field = screen.getByRole('spinbutton', { name: 'Minutes' })
    fireEvent.change(field, { target: { value: String(minutes) } })
    fireEvent.blur(field)
  }
  // Plain blackjack: no count checks between hands.
  fireEvent.click(screen.getByRole('button', { name: 'Just Blackjack' }))
  fireEvent.click(screen.getByTestId('start-session'))
  tick(100)
}

function playHandToStand() {
  fireEvent.click(screen.getByText('+$25'))
  fireEvent.click(screen.getByTestId('confirm-bet'))
  tick(8000)
  fireEvent.click(screen.getByTestId('action-stand'))
  tick(8000)
}

/** Settlement → (review) → back to betting. */
function leaveHand() {
  for (let i = 0; i < 3 && screen.queryByTestId('next-hand'); i++) {
    fireEvent.click(screen.getByTestId('next-hand'))
    tick(500)
  }
}

describe('a timed session', () => {
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

  it('lets the hand in play be finished when the minutes run out, then asks', () => {
    setUp('Time', 1)
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()

    // The minute runs out with the decision still open.
    tick(60_000)
    expect(screen.getByTestId('time-up-notice')).toHaveTextContent('1 minute played')
    expect(screen.queryByTestId('play-again')).toBeNull()            // not thrown onto the summary
    expect(screen.getByTestId('action-stand')).toBeEnabled()         // the hand is still the player's

    fireEvent.click(screen.getByTestId('action-stand'))
    tick(8000)
    leaveHand()
    expect(screen.getByTestId('session-end-prompt')).toHaveTextContent('Your minute is up')

    // Enter must not deal past the question.
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
    tick(1000)
    expect(screen.getByTestId('session-end-prompt')).toBeInTheDocument()
  })

  it('plays on after "keep playing", with no further prompt', () => {
    setUp('Time', 1)
    tick(61_000)
    expect(screen.getByTestId('session-end-prompt')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('end-keep-playing'))
    expect(screen.queryByTestId('session-end-prompt')).toBeNull()

    playHandToStand()
    leaveHand()
    tick(120_000)
    expect(screen.queryByTestId('session-end-prompt')).toBeNull()
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
  })

  it('cashes out from the prompt onto the summary, saved in the tracker', () => {
    setUp('Time', 1)
    playHandToStand()
    leaveHand()
    tick(61_000)
    fireEvent.click(screen.getByTestId('end-cash-out'))
    expect(screen.getByTestId('play-again')).toBeInTheDocument()
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(1)
  })
})

describe('an unlimited session', () => {
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

  it('never asks, and ends on the cash-out with the session in the tracker', () => {
    setUp('Unlimited')
    for (let h = 0; h < 3; h++) { playHandToStand(); leaveHand() }
    tick(3 * 3600 * 1000)
    expect(screen.queryByTestId('session-end-prompt')).toBeNull()

    fireEvent.click(screen.getByTestId('cash-out'))
    expect(screen.getByTestId('play-again')).toBeInTheDocument()
    const tracker = useCasinoSessionTrackerStore.getState()
    expect(tracker.sessions).toHaveLength(1)
    expect(tracker.sessions[0].handsPlayed).toBe(3)
    expect(tracker.startingBankroll).toBeGreaterThan(0)
  })

  it('keeps the cash-out closed while a hand is in play', () => {
    setUp('Unlimited')
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.getByTestId('cash-out')).toBeDisabled()
  })
})

/**
 * Enter at the count check. Found by reading, 13 Nov 2026: a second Enter —
 * the natural way to get past the feedback — submitted the count again and
 * scheduled a second "next hand" two seconds behind the first. By then the
 * next hand was bet and dealt, and the late callback wiped it.
 */
describe('the count check', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
    stackHands()
    vi.spyOn(CasinoSessionEngine.prototype, 'shouldCheckCount').mockReturnValue(true)
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function start() {
    render(<CasinoSession />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByTestId('start-session'))
    tick(100)
  }

  it('is submitted once, however often Enter is pressed', () => {
    start()
    playHandToStand()
    fireEvent.click(screen.getByTestId('next-hand'))
    tick(100)
    expect(screen.getByTestId('count-check')).toBeInTheDocument()

    const record = vi.spyOn(CasinoSessionEngine.prototype, 'validateCountInput')
    fireEvent.keyDown(window, { key: 'Enter' })
    tick(1000)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(record).toHaveBeenCalledTimes(1)

    // The first submission moves on after its two seconds...
    tick(1100)
    leaveHand()
    // ...and the next hand, bet and dealt, is still there after the moment a
    // second submission would have come back for it.
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
  })

  it('takes a held key as one press', () => {
    start()
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    // Auto-repeat on H used to draw card after card onto a 16.
    const hit = vi.spyOn(Shoe.prototype, 'deal')
    hit.mockClear()
    fireEvent.keyDown(window, { key: 'h', repeat: true })
    fireEvent.keyDown(window, { key: 'h', repeat: true })
    tick(200)
    expect(hit).not.toHaveBeenCalled()
  })
})

/**
 * The bet stays on the spot between hands. It used to return to $0 with the
 * Deal button disabled, so flat betting took a chip click and a Deal click
 * for every hand.
 */
describe('the bet between hands', () => {
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

  it('offers the last bet again, so the next hand is one click', () => {
    setUp('Unlimited')
    playHandToStand()
    leaveHand()

    const deal = screen.getByTestId('confirm-bet')
    expect(deal).toBeEnabled()
    fireEvent.click(deal)
    tick(8000)
    // A hand is in play without a chip having been touched.
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
  })

  it('reserves the result line from the deal on, so settling moves nothing', () => {
    setUp('Unlimited')
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    const seat = screen.getByTestId('human-seat')
    const slot = seat.querySelector('[data-testid="seat-result"]')
    expect(slot).not.toBeNull()
    expect(slot!.textContent).toBe('')

    fireEvent.click(screen.getByTestId('action-stand'))
    tick(8000)
    // Same element, now holding the result.
    expect(seat.querySelector('[data-testid="seat-result"]')).toBe(slot)
    expect(slot!.textContent).not.toBe('')
  })
})

/**
 * Ending a session while a hand is open. Cash out is disabled mid-hand, but
 * Quit in the pause overlay is not, and neither is navigating away. The bets
 * of the open hand had already left the bankroll, so they were booked as lost.
 */
describe('a session that ends mid-hand', () => {
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

  it('hands the open bet back instead of booking it as a loss', () => {
    setUp('Unlimited')
    // One finished hand: 16 against the dealer's 17, stood on — minus $25.
    playHandToStand()
    leaveHand()

    // A second hand, bet placed and dealt, then quit before it is played.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pause-button'))
    fireEvent.click(screen.getByTestId('quit-session'))

    const [session] = useCasinoSessionTrackerStore.getState().sessions
    expect(session.handsPlayed).toBe(1)
    // The one hand that was played, and nothing for the one that was not.
    expect(session.finalBankroll - useCasinoSessionTrackerStore.getState().startingBankroll).toBe(-25)
  })

  it('does the same when the player simply walks away from the table', () => {
    const { unmount } = (() => { setUp('Unlimited'); return { unmount: cleanup } })()
    playHandToStand()
    leaveHand()
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    unmount()

    const [session] = useCasinoSessionTrackerStore.getState().sessions
    expect(session.finalBankroll - useCasinoSessionTrackerStore.getState().startingBankroll).toBe(-25)
  })
})
