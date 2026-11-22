import React, { StrictMode } from 'react'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { LIVE_SESSION_KEY, RECORDED_IDS_KEY, loadLiveSession } from '../../services/casino-live-session'
import { runBeforeSignOut } from '../../services/storage/before-sign-out'
import { LOCAL_OWNER_KEY } from '../../services/storage/local-owner'
import { formatDollar } from './helpers'

/**
 * A table that outlives its tab.
 *
 * The whole path, on the real table: play hands, lose the page, come back.
 * "Losing the page" cannot be done to a test — unmounting is the orderly way
 * out, and the orderly way records the session. So the saved copy is taken
 * from storage the way a dead tab leaves it, the page is torn down, and the
 * copy is put back as if nothing had run after it was written.
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
// The betting and decision clocks have tests of their own; here they would
// deal and stand on their own while the test is looking at something else.
vi.mock('./helpers', async importOriginal => ({ ...(await importOriginal<typeof import('./helpers')>()), BET_SECONDS: 1_000_000, DECISION_SECONDS: 1_000_000 }))
vi.mock('../../services/casino-ambient', () => ({
  casinoAmbient: { start: vi.fn(), stop: vi.fn(), playing: false, volume: 0.15 },
}))
vi.mock('../table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({ enabled: false, volume: 0 }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) }),
}))
vi.mock('../../store/level-store', () => ({
  useLevelStore: { getState: () => ({ addSessionXP: vi.fn(), addChallengeXP: vi.fn(), addAchievementXP: vi.fn(), addAchievementsXP: vi.fn(), dismissXpAward: vi.fn() }) },
}))

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
/** Let a promise chain run (the cash-out of a saved table waits for the statistics). */
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

/** Every hand: 16 against a 9; the dealer turns a ten-less 17. Standing loses $25. */
function stackHands() {
  let n = 0
  const hand = [c(Rank.Ten), c(Rank.Nine, Suit.Clubs), c(Rank.Six, Suit.Spades), c(Rank.Eight, Suit.Diamonds)]
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => hand[n++ % hand.length])
}

function startTable(ui: React.ReactElement = <CasinoSession />) {
  const view = render(ui)
  fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
  fireEvent.click(within(screen.getByRole('group', { name: 'Session Length' })).getByRole('button', { name: 'Unlimited' }))
  fireEvent.click(screen.getByRole('button', { name: 'Just Blackjack' }))
  fireEvent.click(screen.getByTestId('start-session'))
  tick(100)
  return view
}

function playHandToStand() {
  if (!screen.getByTestId('confirm-bet').hasAttribute('disabled')) fireEvent.click(screen.getByTestId('confirm-bet'))
  else { fireEvent.click(screen.getByText('+$25')); fireEvent.click(screen.getByTestId('confirm-bet')) }
  tick(8000)
  fireEvent.click(screen.getByTestId('action-stand'))
  tick(8000)
}

function leaveHand() {
  for (let i = 0; i < 3 && screen.queryByTestId('next-hand'); i++) {
    fireEvent.click(screen.getByTestId('next-hand'))
    tick(500)
  }
}

/** The page dies: whatever is saved stays exactly as it is, and nothing else survives. */
function killPage() {
  const left = localStorage.getItem(LIVE_SESSION_KEY)
  cleanup()
  localStorage.clear()
  if (left !== null) localStorage.setItem(LIVE_SESSION_KEY, left)
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
}

/** The app loads again and the player presses "Continue" on the home screen. */
function comeBackAndContinue(ui: React.ReactElement = <CasinoSession />) {
  useLiveSessionStore.getState().refreshSaved()
  useLiveSessionStore.getState().requestResume()
  const view = render(ui)
  tick(100)
  return view
}

const hud = () => screen.getByTestId('session-hud').textContent ?? ''
const casinoSessions = () => useStatsStore.getState().sessions.filter(s => s.mode === 'casinoSession')
const tracked = () => useCasinoSessionTrackerStore.getState().sessions

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useAppStore.getState().setMode('casinoSession')
  useAppStore.setState({ dealingSpeed: 'normal' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
  stackHands()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a table is saved as it is played', () => {
  it('from the moment it starts', () => {
    startTable()
    const saved = loadLiveSession()
    expect(saved).not.toBeNull()
    expect(saved!.snapshot.handHistory).toHaveLength(0)
    expect(saved!.snapshot.humanBankroll).toBe(5000)
    expect(saved!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('after every settled hand, under the same id', () => {
    startTable()
    const id = loadLiveSession()!.id
    for (let hand = 1; hand <= 3; hand++) {
      playHandToStand()
      // At the settlement already — before "next hand" is pressed.
      expect(loadLiveSession()!.snapshot.handHistory).toHaveLength(hand)
      expect(loadLiveSession()!.snapshot.humanBankroll).toBe(5000 - 25 * hand)
      leaveHand()
      expect(loadLiveSession()!.id).toBe(id)
    }
  })

  // Turned around in one respect: this used to pin that NOTHING was written
  // during a hand. The bankroll, the history and the hand number still read
  // as before the bet — but the shoe has moved on, or a reload would deal the
  // same hand again.
  it('in the middle of a hand: the bet back in the bankroll, the cards out of the shoe', () => {
    startTable()
    playHandToStand()
    leaveHand()
    const before = loadLiveSession()!.snapshot
    fireEvent.click(screen.getByTestId('confirm-bet'))
    // Written with the deal itself, before a single card has been shown.
    // (The shoe itself is stubbed in this file, so its index does not move;
    // the engine's own count of cards out of the shoe does. The shoe index is
    // pinned on a real shoe in session-snapshot.test.ts.)
    const dealt = loadLiveSession()!.snapshot
    expect(dealt.cardsDealt).toBe(before.cardsDealt + 4)
    tick(8000)
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
    // $25 is on the felt and has left the bankroll on screen...
    expect(hud()).toContain(formatDollar(4950))
    // ...and the saved table holds it returned, with no hand recorded for it.
    expect(loadLiveSession()!.snapshot.humanBankroll).toBe(4975)
    expect(loadLiveSession()!.snapshot.handHistory).toHaveLength(1)
    expect(loadLiveSession()!.snapshot.currentHandNumber).toBe(1)
  })

  it('burns every card drawn during the hand, not only the deal', () => {
    startTable()
    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    const afterDeal = loadLiveSession()!.snapshot.cardsDealt
    fireEvent.click(screen.getByTestId('action-hit'))
    expect(loadLiveSession()!.snapshot.cardsDealt).toBe(afterDeal + 1)
    // Still a hand without a result: the bet is in the bankroll.
    expect(loadLiveSession()!.snapshot.humanBankroll).toBe(5000)
    expect(loadLiveSession()!.snapshot.currentHandNumber).toBe(0)
  })

  it('is removed when the session is cashed out, and the session is recorded under its id', () => {
    startTable()
    const id = loadLiveSession()!.id
    playHandToStand()
    leaveHand()
    fireEvent.click(screen.getByTestId('cash-out'))

    expect(screen.getByTestId('play-again')).toBeInTheDocument()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(casinoSessions().map(s => s.id)).toEqual([id])
    expect(tracked().map(s => s.id)).toEqual([id])
  })

  it('is removed when the player walks away with hands played — recorded, not left behind', () => {
    startTable()
    playHandToStand()
    leaveHand()
    cleanup()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(casinoSessions()).toHaveLength(1)
  })

  it('is removed, unrecorded, when the session is thrown away for a new one', () => {
    const { rerender } = startTable()
    playHandToStand()
    leaveHand()
    // Away to another mode and back: the panel offers a fresh start.
    rerender(<CasinoSession backgrounded />)
    rerender(<CasinoSession />)
    fireEvent.click(screen.getByTestId('resume-restart'))

    expect(screen.getByTestId('start-session')).toBeInTheDocument()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(casinoSessions()).toHaveLength(0)
    // And the setup screen it leads to does not offer the table just thrown away.
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })

  it('is removed when the table is left without a hand played — nothing to come back to', () => {
    startTable()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).not.toBeNull()
    cleanup()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(casinoSessions()).toHaveLength(0)
  })

  it('costs the table nothing when the device refuses the write', () => {
    startTable()
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    playHandToStand()
    leaveHand()
    playHandToStand()
    leaveHand()
    expect(hud()).toContain(formatDollar(4950))
    expect(screen.getByTestId('confirm-bet')).toBeEnabled()
    full.mockRestore()
  })
})

describe('coming back after the page died', () => {
  it('opens the same table at the betting step: hand number, bankroll, clock, last bet', () => {
    startTable()
    for (let h = 0; h < 3; h++) { playHandToStand(); leaveHand() }
    tick(42_000)
    expect(hud()).toMatch(/Hand:\s*3/)
    expect(hud()).toContain(formatDollar(4925))
    const before = loadLiveSession()!
    killPage()

    comeBackAndContinue()
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
    expect(hud()).toMatch(/Hand:\s*3/)
    expect(hud()).toContain(formatDollar(4925))
    // The clock goes on from the saved time, not from zero and not from the
    // 42 idle seconds after the last save.
    const seconds = before.elapsedSeconds
    expect(seconds).toBeGreaterThan(20)
    expect(screen.getByTestId('session-clock')).toHaveTextContent(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
    tick(3000)
    expect(screen.getByTestId('session-clock')).toHaveTextContent(`${Math.floor((seconds + 3) / 60)}:${String((seconds + 3) % 60).padStart(2, '0')}`)
    // The last bet is on the spot: the next hand is one click.
    expect(screen.getByTestId('confirm-bet')).toBeEnabled()
    // And the request has been taken up.
    expect(useLiveSessionStore.getState().resumeRequested).toBe(false)
  })

  it('plays on: a fourth hand, and a cash-out that records all four once', () => {
    startTable()
    for (let h = 0; h < 3; h++) { playHandToStand(); leaveHand() }
    const id = loadLiveSession()!.id
    killPage()

    comeBackAndContinue()
    playHandToStand()
    expect(hud()).toMatch(/Hand:\s*4/)
    expect(hud()).toContain(formatDollar(4900))
    leaveHand()
    fireEvent.click(screen.getByTestId('cash-out'))

    expect(screen.getByTestId('play-again')).toBeInTheDocument()
    expect(casinoSessions()).toHaveLength(1)
    expect(casinoSessions()[0].id).toBe(id)
    expect(casinoSessions()[0].details).toMatchObject({ handsPlayed: 4, netProfit: -100, finalBankroll: 4900 })
    expect(tracked()).toHaveLength(1)
    expect(tracked()[0]).toMatchObject({ id, handsPlayed: 4, finalBankroll: 4900 })
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('does not replay a hand that was in progress, and does not lose its bet', () => {
    startTable()
    playHandToStand()
    leaveHand()
    // Second hand: bet placed, cards dealt, the decision open — and the page dies.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
    killPage()

    comeBackAndContinue()
    // At the betting step of the next hand, not in the middle of that one...
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
    expect(screen.queryByTestId('action-stand')).toBeNull()
    // ...one hand played, and the $25 that was on the felt back in the bankroll.
    expect(hud()).toMatch(/Hand:\s*1/)
    expect(hud()).toContain(formatDollar(4975))
  })

  it('does not get the cards of that hand back: the shoe goes on from after them', () => {
    startTable()
    playHandToStand()
    leaveHand()
    const beforeDeal = loadLiveSession()!.snapshot.cardsDealt
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    killPage()

    comeBackAndContinue()
    // The table that came back has those four cards behind it...
    expect(loadLiveSession()!.snapshot.cardsDealt).toBe(beforeDeal + 4)
    // ...and the next hand is the second one, dealt from further down.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    expect(loadLiveSession()!.snapshot.cardsDealt).toBe(beforeDeal + 8)
    tick(8000)
    expect(hud()).toMatch(/Hand:\s*2/)
  })

  it('keeps the pause, the decision and the cash-out rules working', () => {
    startTable()
    playHandToStand()
    leaveHand()
    killPage()
    comeBackAndContinue()

    // Pause freezes the clock.
    fireEvent.click(screen.getByTestId('pause-button'))
    const frozen = screen.getByTestId('session-clock').textContent
    tick(30_000)
    expect(screen.getByTestId('session-clock').textContent).toBe(frozen)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    tick(2000)
    expect(screen.getByTestId('session-clock').textContent).not.toBe(frozen)

    // A hand in play closes the cash-out, as before.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.getByTestId('cash-out')).toBeDisabled()
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(8000)
    leaveHand()
    expect(screen.getByTestId('cash-out')).toBeEnabled()
  })

  it('pauses when it is sent to the background, like any running table', () => {
    startTable()
    playHandToStand()
    leaveHand()
    killPage()
    const { rerender } = comeBackAndContinue()
    rerender(<CasinoSession backgrounded />)
    const frozen = screen.getByTestId('session-clock').textContent
    tick(60_000)
    expect(screen.getByTestId('session-clock').textContent).toBe(frozen)
    rerender(<CasinoSession />)
    expect(screen.getByTestId('resume-session-panel')).toBeInTheDocument()
  })

  it('stays saved, unrecorded, when the player continues and leaves again without playing', () => {
    startTable()
    playHandToStand()
    leaveHand()
    killPage()
    comeBackAndContinue()
    cleanup()

    expect(casinoSessions()).toHaveLength(0)
    expect(tracked()).toHaveLength(0)
    expect(loadLiveSession()!.snapshot.handHistory).toHaveLength(1)
    expect(useLiveSessionStore.getState().saved).toMatchObject({ handNumber: 1, bankroll: 4975 })
  })

  it('is not recorded by React\'s development double-mount — "Continue" opens the table, not the summary', () => {
    startTable()
    for (let h = 0; h < 2; h++) { playHandToStand(); leaveHand() }
    killPage()

    comeBackAndContinue(<StrictMode><CasinoSession /></StrictMode>)
    expect(screen.queryByTestId('play-again')).toBeNull()
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
    expect(hud()).toMatch(/Hand:\s*2/)
    expect(casinoSessions()).toHaveLength(0)
    expect(loadLiveSession()).not.toBeNull()
  })

  it('opens the setup screen when the saved table cannot be read after all', () => {
    startTable()
    playHandToStand()
    leaveHand()
    killPage()
    localStorage.setItem(LIVE_SESSION_KEY, '{"version":1,"id":"x"')

    comeBackAndContinue()
    expect(screen.getByTestId('start-session')).toBeInTheDocument()
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })
})

describe('the setup screen, with a table saved', () => {
  function leaveTwoHandsBehind() {
    startTable()
    for (let h = 0; h < 2; h++) { playHandToStand(); leaveHand() }
    const id = loadLiveSession()!.id
    killPage()
    useLiveSessionStore.getState().refreshSaved()
    return id
  }

  it('offers the same card as the home screen', () => {
    leaveTwoHandsBehind()
    render(<CasinoSession />)
    expect(screen.getByTestId('resume-session-card')).toHaveTextContent(`Hand 2 · Bankroll ${formatDollar(4950)}`)
    expect(screen.getByTestId('start-session')).toBeInTheDocument()
  })

  it('"Continue" opens the saved table', () => {
    leaveTwoHandsBehind()
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('resume-card-continue'))
    tick(100)
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
    expect(hud()).toMatch(/Hand:\s*2/)
    expect(hud()).toContain(formatDollar(4950))
  })

  it('"Cash out now" records it and leaves the player on the setup screen', async () => {
    const id = leaveTwoHandsBehind()
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('resume-card-cash-out'))
    await settle()

    expect(screen.queryByTestId('resume-session-card')).toBeNull()
    expect(screen.getByTestId('start-session')).toBeInTheDocument()
    expect(casinoSessions().map(s => s.id)).toEqual([id])
    expect(casinoSessions()[0].details).toMatchObject({ handsPlayed: 2, netProfit: -50 })
    expect(tracked()).toHaveLength(1)
  })

  it('cashes the saved table out before a new session takes its place', async () => {
    const id = leaveTwoHandsBehind()
    render(<CasinoSession />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByTestId('start-session'))
    await settle()
    tick(100)

    // The old table is in the statistics, not gone...
    expect(casinoSessions().map(s => s.id)).toEqual([id])
    // ...and the new one is being played and saved under an id of its own.
    expect(screen.getByTestId('betting-controls')).toBeInTheDocument()
    expect(hud()).toContain(formatDollar(5000))
    expect(loadLiveSession()!.id).not.toBe(id)
    expect(loadLiveSession()!.snapshot.handHistory).toHaveLength(0)
  })
})

describe('the same table in two tabs', () => {
  // Turned around: this used to let the second tab play on to a cash-out and a
  // summary of hands that were written down nowhere. Now the table closes the
  // moment it learns it was cashed out, and says so.
  it('is recorded by the first to cash out; the other closes and says why', () => {
    startTable()
    playHandToStand()
    leaveHand()
    const id = loadLiveSession()!.id
    // Another tab cashes the table out from its resume card.
    localStorage.setItem(RECORDED_IDS_KEY, JSON.stringify([id]))
    localStorage.removeItem(LIVE_SESSION_KEY)
    expect(screen.queryByTestId('table-closed-elsewhere')).toBeNull()

    // This tab deals the next hand — and learns of it with the first write.
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    const notice = screen.getByTestId('table-closed-elsewhere')
    expect(notice).toHaveTextContent('This table was cashed out in another tab, so it is closed here too.')
    // A session already recorded is not saved again, and nothing more is played.
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(screen.queryByTestId('action-stand')).toBeNull()

    // The way out is the menu; nothing is recorded a second time on the way.
    fireEvent.click(screen.getByTestId('closed-elsewhere-menu'))
    expect(useAppStore.getState().currentMode).toBe('home')
    expect(useLiveSessionStore.getState().activeMode).toBeNull()
    cleanup()
    expect(casinoSessions()).toHaveLength(0)
    expect(tracked()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('plays on when the write is refused for another reason — a full device is not a cash-out', () => {
    startTable()
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    playHandToStand()
    const closed = screen.queryByTestId('table-closed-elsewhere')
    const next = screen.queryByTestId('next-hand')
    // Before the teardown records the session: that write must not meet the stub.
    full.mockRestore()
    expect(closed).toBeNull()
    expect(next).not.toBeNull()
  })
})

/**
 * Signing out wipes the device. The table has to be written down before that,
 * and must write nothing after it.
 */
describe('signing out with a table in play', () => {
  /** What `clearLocalAppData` does to this test's world. */
  function wipe() {
    localStorage.clear()
    useStatsStore.setState({ sessions: [], lifetimeStats: null })
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  }

  /**
   * What the device holds — which is what the wipe is about to take, and what
   * the sync layer uploads from. (Read from storage rather than from the
   * store: a statistics load still in flight from the setup screen lands
   * during the wait and replaces the list in memory.)
   */
  const onDevice = () => (JSON.parse(localStorage.getItem('bjt_sessions') ?? '[]') as
    { id: string; mode: string; details: Record<string, unknown> }[]).filter(s => s.mode === 'casinoSession')

  it('records the session before the wipe, like a cash-out without a summary', async () => {
    startTable()
    const id = loadLiveSession()!.id
    playHandToStand()
    leaveHand()
    playHandToStand()
    leaveHand()

    await act(async () => { await runBeforeSignOut() })
    expect(onDevice()).toHaveLength(1)
    expect(onDevice()[0].id).toBe(id)
    expect(onDevice()[0].details).toMatchObject({ handsPlayed: 2, finalBankroll: 4950 })
    expect(tracked()).toHaveLength(1)
    expect(tracked()[0]).toMatchObject({ id, handsPlayed: 2 })
    expect(JSON.parse(localStorage.getItem(RECORDED_IDS_KEY)!)).toEqual([id])
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    // No summary screen: the player is signing out.
    expect(screen.queryByTestId('play-again')).toBeNull()
  })

  it('writes nothing after the wipe: the unmount that follows is a no-op', async () => {
    startTable()
    playHandToStand()
    leaveHand()
    await act(async () => { await runBeforeSignOut() })
    wipe()

    cleanup()
    expect(casinoSessions()).toHaveLength(0)
    expect(tracked()).toHaveLength(0)
    expect(localStorage.getItem(RECORDED_IDS_KEY)).toBeNull()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(localStorage.getItem('bjt_sessions')).toBeNull()
  })

  it('hands back the bet of a hand that was open, as a cash-out does', async () => {
    startTable()
    playHandToStand()
    leaveHand()
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    await act(async () => { await runBeforeSignOut() })
    expect(onDevice()[0].details).toMatchObject({ handsPlayed: 1, finalBankroll: 4975 })
  })

  it('takes no more input once it has ended the table', async () => {
    startTable()
    playHandToStand()
    leaveHand()
    await act(async () => { await runBeforeSignOut() })
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(8000)
    expect(screen.queryByTestId('action-stand')).toBeNull()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  // The belt: even if nothing ran before the wipe, a table whose device has
  // changed hands writes nothing into it.
  it('does not record into a device that was wiped under it', () => {
    localStorage.setItem(LOCAL_OWNER_KEY, 'user-a')
    startTable()
    playHandToStand()
    leaveHand()
    wipe()

    cleanup()
    expect(casinoSessions()).toHaveLength(0)
    expect(tracked()).toHaveLength(0)
    expect(localStorage.getItem(RECORDED_IDS_KEY)).toBeNull()
  })

  it('does not save into a device that was wiped under it, or that belongs to someone else now', () => {
    localStorage.setItem(LOCAL_OWNER_KEY, 'user-a')
    startTable()
    playHandToStand()
    wipe()
    leaveHand()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    localStorage.setItem(LOCAL_OWNER_KEY, 'user-b')
    playHandToStand()
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
  })

  it('keeps saving through a first sign-in: an owner appearing is not a change of hands', () => {
    startTable()
    localStorage.setItem(LOCAL_OWNER_KEY, 'user-a')
    playHandToStand()
    expect(loadLiveSession()!.owner).toBe('user-a')
    expect(loadLiveSession()!.snapshot.handHistory).toHaveLength(1)
  })
})
