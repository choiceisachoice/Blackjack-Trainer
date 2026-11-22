import React from 'react'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The casino table's door for an account without Pro.
 *
 * Open while trial hands remain; open for as long as a trial table is still
 * on screen, the last hand included; the paywall otherwise — and then about
 * the hands that were played. A trial table left on the device with no hands
 * to go back to is cashed out, not offered.
 */

vi.mock('../components/casino-session/CasinoSession', () => ({
  CasinoSession: () => <div data-testid="casino-stub" />,
}))
vi.mock('recharts', () => ({}))
vi.mock('../hooks/use-learner-sync', () => ({ useLearnerSync: () => {} }))
vi.mock('../components/navigation/HomeScreen', async () => {
  const { ResumeSessionCard } = await import('../components/casino-session/ResumeSessionCard')
  return { HomeScreen: () => <div data-testid="home-stub"><ResumeSessionCard /></div> }
})
vi.mock('../components/navigation/NavBar', () => ({ NavBar: () => <div data-testid="nav-stub" /> }))
vi.mock('../components/pro/UpgradePanel', () => ({
  UpgradePanel: ({ atTable }: { atTable?: boolean }) => <div data-testid="paywall-stub" data-at-table={String(atTable === true)} />,
}))
vi.mock('framer-motion', () => {
  const motion = new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
        const { initial, animate, exit, transition, whileHover, whileTap, layout, variants, ...rest } = props
        void initial; void animate; void exit; void transition; void whileHover; void whileTap; void layout; void variants
        return React.createElement(tag, rest, children)
      },
  })
  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => true,
  }
})
vi.mock('../services/supabase/profiles-sync', () => ({ pushProfileScalars: () => {} }))

const pro = { is: false }
vi.mock('../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../store/entitlement-store')>()),
  useIsPro: () => pro.is,
}))

import { TrainerApp } from './TrainerApp'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { useLiveSessionStore } from '../store/live-session-store'
import { useEntitlementStore } from '../store/entitlement-store'
import { useCasinoSessionTrackerStore } from '../store/casino-session-tracker-store'
import { useCasinoTrialStore } from '../store/casino-trial-store'
import { TRIAL_HANDS, setTrialHandsUsed } from '../services/casino-trial'
import { LIVE_SESSION_KEY, saveLiveSession } from '../services/casino-live-session'
import { savedTable } from '../components/casino-session/saved-table.fixture'
import { trialTableConfig } from '../components/casino-session/trial-table'

const show = () => render(<MemoryRouter><TrainerApp /></MemoryRouter>)
const tableSessions = () => useStatsStore.getState().sessions.filter(s => s.mode === 'casinoSession')

function leaveATrialTable() {
  const base = savedTable([25, -25, 25])
  const config = { ...trialTableConfig(), numBots: 0, casinoAmbience: false }
  saveLiveSession({ ...base, config, snapshot: { ...base.snapshot, config } })
  return base
}

beforeEach(() => {
  localStorage.clear()
  pro.is = false
  useAppStore.setState({ currentMode: 'casinoSession' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
  useEntitlementStore.setState({ status: 'free', currentPeriodEnd: null, cancelAtPeriodEnd: false, loaded: true })
  useCasinoTrialStore.getState().refresh()
  useCasinoTrialStore.getState().setSeated(false)
})
afterEach(cleanup)

describe('the casino table without Pro', () => {
  it('is open while trial hands remain', () => {
    setTrialHandsUsed(4)
    show()
    expect(screen.getByTestId('casino-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('paywall-stub')).toBeNull()
  })

  it('is the paywall once they are used up — the paywall about the table', () => {
    setTrialHandsUsed(TRIAL_HANDS)
    show()
    expect(screen.queryByTestId('casino-stub')).toBeNull()
    expect(screen.getByTestId('paywall-stub')).toHaveAttribute('data-at-table', 'true')
  })

  it('is the paywall while the account\'s count is unknown on this device', () => {
    show()
    expect(screen.queryByTestId('casino-stub')).toBeNull()
    expect(screen.getByTestId('paywall-stub')).toBeInTheDocument()
  })

  it('stays on screen through the last hand and its summary', () => {
    setTrialHandsUsed(TRIAL_HANDS - 1)
    show()
    // Seated at the table; the tenth hand is settled and counted.
    act(() => {
      useCasinoTrialStore.getState().setSeated(true)
      useLiveSessionStore.getState().beginSession('casinoSession')
      useCasinoTrialStore.getState().countHand()
    })
    expect(screen.getByTestId('casino-stub')).toBeInTheDocument()
    expect(screen.queryByTestId('paywall-stub')).toBeNull()
    // The session it reported is still protected: the guard was not switched off under it.
    expect(useLiveSessionStore.getState().activeMode).toBe('casinoSession')

    // The summary is left.
    act(() => {
      useLiveSessionStore.getState().endSession()
      useCasinoTrialStore.getState().setSeated(false)
    })
    expect(screen.queryByTestId('casino-stub')).toBeNull()
    expect(screen.getByTestId('paywall-stub')).toBeInTheDocument()
  })

  it('opens nothing else: another Pro mode is the paywall, and not about the table', () => {
    setTrialHandsUsed(0)
    useAppStore.setState({ currentMode: 'betSpread' })
    show()
    expect(screen.getByTestId('paywall-stub')).toHaveAttribute('data-at-table', 'false')
  })

  it('does not end the session a trial table has just begun', () => {
    // The table reports its session from a child effect, which runs before
    // this component's own: ending "any session of an account without Pro"
    // there switched the leave-guard off under a table that had just started.
    setTrialHandsUsed(0)
    useLiveSessionStore.getState().beginSession('casinoSession')
    show()
    expect(useLiveSessionStore.getState().activeMode).toBe('casinoSession')
  })
})

describe('a trial table left on the device', () => {
  it('is cashed out, not offered, once the trial is used up', async () => {
    const saved = leaveATrialTable()
    setTrialHandsUsed(TRIAL_HANDS)
    useAppStore.setState({ currentMode: 'home' })
    show()

    await waitFor(() => expect(tableSessions()).toHaveLength(1))
    expect(tableSessions()[0].id).toBe(saved.id)
    expect(tableSessions()[0].details).toMatchObject({ handsPlayed: 3, trial: true })
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })

  it('is left alone, and offered, while hands remain', async () => {
    leaveATrialTable()
    setTrialHandsUsed(3)
    useAppStore.setState({ currentMode: 'home' })
    show()

    expect(await screen.findByTestId('resume-card-continue')).toBeInTheDocument()
    expect(tableSessions()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).not.toBeNull()
  })

  it('is left alone until the server has said the account has no Pro', async () => {
    leaveATrialTable()
    setTrialHandsUsed(TRIAL_HANDS)
    useEntitlementStore.setState({ loaded: false })
    useAppStore.setState({ currentMode: 'home' })
    show()

    await screen.findByTestId('resume-session-card')
    await act(async () => { await Promise.resolve() })
    expect(tableSessions()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).not.toBeNull()
  })

  it('is left alone for an account that has Pro now', async () => {
    leaveATrialTable()
    setTrialHandsUsed(TRIAL_HANDS)
    pro.is = true
    useAppStore.setState({ currentMode: 'home' })
    show()

    expect(await screen.findByTestId('resume-card-continue')).toBeInTheDocument()
    expect(tableSessions()).toHaveLength(0)
  })
})
