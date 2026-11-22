import React from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { useCasinoTrialStore } from '../../store/casino-trial-store'
import { TRIAL_HANDS, readTrialHandsUsed, setTrialHandsUsed } from '../../services/casino-trial'
import { loadLiveSession, saveLiveSession } from '../../services/casino-live-session'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { savedTable } from './saved-table.fixture'
import { trialTableConfig } from './trial-table'

/**
 * The free trial of the casino table, from the seat.
 *
 * Ten hands per account, counted when they are settled; a quiet label that
 * says how many are left; the ordinary summary after the last one, with the
 * way to Pro where "play again" would be. And nothing a reload, a saved table
 * or a second sitting can do hands any of them back.
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
vi.mock('./helpers', async importOriginal => ({ ...(await importOriginal<typeof import('./helpers')>()), BET_SECONDS: 1_000_000, DECISION_SECONDS: 1_000_000 }))
vi.mock('../../services/casino-ambient', () => ({
  casinoAmbient: { start: vi.fn(), stop: vi.fn(), playing: false, volume: 0.15 },
}))
vi.mock('../table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))
vi.mock('../training/TrainingBackdrop', () => ({ TrainingBackdrop: () => null }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({ enabled: false, volume: 0 }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) }),
}))
vi.mock('../../store/level-store', () => ({
  useLevelStore: { getState: () => ({ addSessionXP: vi.fn(), addChallengeXP: vi.fn(), addAchievementXP: vi.fn(), addAchievementsXP: vi.fn(), dismissXpAward: vi.fn() }) },
}))
const pushProfileScalars = vi.fn()
vi.mock('../../services/supabase/profiles-sync', () => ({ pushProfileScalars: () => pushProfileScalars() }))

const pro = { is: false }
vi.mock('../../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../store/entitlement-store')>()),
  useIsPro: () => pro.is,
}))

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/** No aces in the shoe: nobody is dealt a blackjack, so every hand waits for the player. */
function stackShoe() {
  let n = 0
  const cards = [c(Rank.Ten), c(Rank.Nine, Suit.Clubs), c(Rank.Six, Suit.Spades), c(Rank.Eight, Suit.Diamonds), c(Rank.Seven, Suit.Clubs)]
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => cards[n++ % cards.length])
}

function playHand() {
  fireEvent.click(screen.getByText('+$25'))
  fireEvent.click(screen.getByTestId('confirm-bet'))
  tick(30_000)
  // Stand until the hand is over (a pair could have been dealt; standing is always allowed).
  for (let i = 0; i < 4 && screen.queryByTestId('action-stand'); i++) {
    fireEvent.click(screen.getByTestId('action-stand'))
    tick(30_000)
  }
}

/** Settlement → review → back to betting (or on to the summary). */
function leaveHand() {
  for (let i = 0; i < 3 && screen.queryByTestId('next-hand'); i++) {
    fireEvent.click(screen.getByTestId('next-hand'))
    tick(1000)
  }
}

const tableSessions = () => useStatsStore.getState().sessions.filter(s => s.mode === 'casinoSession')

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  pro.is = false
  pushProfileScalars.mockClear()
  useAppStore.getState().setMode('casinoSession')
  useAppStore.setState({ dealingSpeed: 'fast' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
  useCasinoTrialStore.getState().refresh()
  useCasinoTrialStore.getState().setSeated(false)
  stackShoe()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('an account without Pro at the casino table', () => {
  it('is offered its free hands instead of the setup screen', () => {
    setTrialHandsUsed(0)
    render(<CasinoSession />)

    expect(screen.getByTestId('trial-intro-title')).toHaveTextContent('10 free hands at the table')
    expect(screen.queryByTestId('start-session')).toBeNull()
    // Reading the offer is not sitting down.
    expect(useLiveSessionStore.getState().activeMode).toBeNull()
    expect(useCasinoTrialStore.getState().seated).toBe(false)
  })

  it('sits down at the trial table: basic strategy, other players, no setup', () => {
    setTrialHandsUsed(0)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('trial-start'))
    tick(100)

    expect(screen.getByTestId('session-hud')).toBeInTheDocument()
    expect(screen.getByTestId('trial-hands-left')).toHaveTextContent('Trial: 10 hands left')
    // On a phone the label takes the place of the session figure, so the bar keeps its two rows.
    expect(screen.getByTestId('hud-session-net')).toHaveClass('max-sm:hidden')
    expect(useCasinoTrialStore.getState().seated).toBe(true)
    const saved = loadLiveSession()
    expect(saved?.config).toMatchObject(trialTableConfig())
  })

  it('counts a hand when it is settled, not when it is dealt', () => {
    setTrialHandsUsed(7)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('trial-start'))
    tick(100)
    expect(screen.getByTestId('trial-hands-left')).toHaveTextContent('Trial: 3 hands left')

    fireEvent.click(screen.getByText('+$25'))
    fireEvent.click(screen.getByTestId('confirm-bet'))
    tick(30_000)
    // Cards are out, the decision is open: nothing is used yet.
    expect(screen.getByTestId('action-stand')).toBeInTheDocument()
    expect(readTrialHandsUsed()).toBe(7)

    fireEvent.click(screen.getByTestId('action-stand'))
    tick(30_000)
    expect(readTrialHandsUsed()).toBe(8)
    expect(screen.getByTestId('trial-hands-left')).toHaveTextContent('Trial: 2 hands left')
    // And the account is told.
    expect(pushProfileScalars).toHaveBeenCalledTimes(1)
  })

  it('plays the last hand out, shows the summary, and then leads to Pro', () => {
    setTrialHandsUsed(TRIAL_HANDS - 2)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('trial-start'))
    tick(100)

    playHand()
    leaveHand()
    expect(screen.getByTestId('trial-hands-left')).toHaveTextContent('Trial: 1 hand left')

    playHand()
    // The tenth hand is counted, and still on the felt with its result.
    expect(readTrialHandsUsed()).toBe(TRIAL_HANDS)
    expect(screen.getByTestId('trial-hands-left')).toHaveTextContent('Trial: last hand')
    expect(screen.getByTestId('next-hand')).toBeInTheDocument()
    expect(useCasinoTrialStore.getState().seated).toBe(true)

    leaveHand()
    // No next bet: the summary, as after any session.
    expect(screen.queryByTestId('confirm-bet')).toBeNull()
    expect(screen.getByTestId('trial-summary-note')).toHaveTextContent('Those were your 10 free hands.')
    expect(screen.getByTestId('play-again')).toHaveTextContent('Keep playing with Pro')
    expect(useCasinoTrialStore.getState().seated).toBe(true)

    // Recorded like any other session, and marked as the trial's.
    const [session] = tableSessions()
    expect(session.details).toMatchObject({ type: 'casinoSession', handsPlayed: 2, trial: true, playStyle: 'basic' })
    expect(loadLiveSession()).toBeNull()

    // The way on gives the place up: nothing of the table is left to show.
    fireEvent.click(screen.getByTestId('play-again'))
    expect(useCasinoTrialStore.getState().seated).toBe(false)
    expect(screen.queryByTestId('trial-intro')).toBeNull()
    expect(screen.queryByTestId('session-hud')).toBeNull()
  })

  it('cashing out early keeps the hands that are left, and says how many', () => {
    setTrialHandsUsed(4)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('trial-start'))
    tick(100)
    playHand()
    leaveHand()
    fireEvent.click(screen.getByTestId('cash-out'))

    expect(screen.getByTestId('trial-summary-note')).toHaveTextContent('You have 5 free hands left.')
    expect(screen.getByTestId('play-again')).toHaveTextContent('Play Again')
    fireEvent.click(screen.getByTestId('play-again'))
    expect(screen.getByTestId('trial-intro-title')).toHaveTextContent('5 free hands at the table')
  })

  it('cashing out before a hand was played shows no summary of nothing', () => {
    setTrialHandsUsed(0)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('trial-start'))
    tick(100)
    fireEvent.click(screen.getByTestId('cash-out'))

    expect(screen.getByTestId('trial-intro')).toBeInTheDocument()
    expect(tableSessions()).toHaveLength(0)
    expect(loadLiveSession()).toBeNull()
  })
})

describe('a trial table that was left open', () => {
  /** A trial table with three hands played is on the device; the account has used `used` hands. */
  function leaveTrialTable(used: number) {
    const base = savedTable([25, -25, 25])
    const config = { ...trialTableConfig(), numBots: 0, casinoAmbience: false }
    saveLiveSession({ ...base, config, snapshot: { ...base.snapshot, config } })
    setTrialHandsUsed(used)
    useLiveSessionStore.getState().refreshSaved()
  }

  it('is continued with the hands that are left — a reload hands out none', () => {
    leaveTrialTable(3)
    render(<CasinoSession />)
    // The same count as before the reload, where the table is offered again —
    // and that table alone, not a new one beside it…
    expect(screen.getByTestId('trial-intro-left')).toHaveTextContent('Trial: 7 hands left')
    expect(screen.queryByTestId('trial-start')).toBeNull()
    fireEvent.click(screen.getByTestId('resume-card-continue'))
    tick(100)
    // …and at the table.
    expect(screen.getByTestId('trial-hands-left')).toHaveTextContent('Trial: 7 hands left')
    expect(readTrialHandsUsed()).toBe(3)
  })

  it('closes at the next bet when the hands were used up somewhere else', () => {
    leaveTrialTable(3)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('resume-card-continue'))
    tick(100)
    expect(screen.getByTestId('confirm-bet')).toBeInTheDocument()

    // Another device played the rest; the merge lands here.
    act(() => { setTrialHandsUsed(TRIAL_HANDS) })

    expect(screen.queryByTestId('confirm-bet')).toBeNull()
    expect(screen.getByTestId('trial-summary-note')).toHaveTextContent('Those were your 10 free hands.')
    expect(tableSessions()).toHaveLength(1)
  })

  it('loses its limit when the account gets Pro in the middle of it', () => {
    leaveTrialTable(9)
    render(<CasinoSession />)
    fireEvent.click(screen.getByTestId('resume-card-continue'))
    tick(100)
    expect(screen.getByTestId('trial-hands-left')).toBeInTheDocument()

    pro.is = true
    playHand()
    expect(screen.queryByTestId('trial-hands-left')).toBeNull()
    expect(screen.getByTestId('hud-session-net')).not.toHaveClass('max-sm:hidden')
    // Not counted against a trial that no longer applies, and the table deals on.
    expect(readTrialHandsUsed()).toBe(9)
    leaveHand()
    expect(screen.getByTestId('confirm-bet')).toBeInTheDocument()
  })
})

describe('a Pro table left by an account that has no Pro any more', () => {
  it('is not continued on trial hands: its result can be cashed out, nothing else', () => {
    saveLiveSession(savedTable([25, 25]))
    setTrialHandsUsed(0)
    useLiveSessionStore.getState().refreshSaved()
    render(<CasinoSession />)

    expect(screen.getByTestId('resume-session-card')).toBeInTheDocument()
    expect(screen.queryByTestId('resume-card-continue')).toBeNull()
    expect(screen.getByTestId('resume-card-cash-out')).toBeInTheDocument()
  })

  it('is not opened by a resume request either', () => {
    saveLiveSession(savedTable([25, 25]))
    setTrialHandsUsed(0)
    useLiveSessionStore.getState().refreshSaved()
    useLiveSessionStore.getState().requestResume()
    render(<CasinoSession />)

    expect(screen.queryByTestId('session-hud')).toBeNull()
    expect(screen.getByTestId('trial-intro')).toBeInTheDocument()
  })
})
