import React from 'react'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * What the app does, when it opens, with a casino table left on the device.
 *
 * A table younger than a day is offered — once, by a card on the home screen.
 * One older than that is not going to be continued: it is cashed out there and
 * then, without a word, so the hands played at it are in the statistics rather
 * than lost with the tab that held them.
 */

vi.mock('../components/casino-session/CasinoSession', () => ({
  CasinoSession: () => <div data-testid="casino-stub" />,
}))
vi.mock('recharts', () => ({}))
vi.mock('../hooks/use-learner-sync', () => ({ useLearnerSync: () => {} }))
// The real home screen settles asynchronously (the training plan) and is not
// what this file is about; the card it carries is rendered in its place.
vi.mock('../components/navigation/HomeScreen', async () => {
  const { ResumeSessionCard } = await import('../components/casino-session/ResumeSessionCard')
  return { HomeScreen: () => <div data-testid="home-stub"><ResumeSessionCard /></div> }
})
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

import { TrainerApp } from './TrainerApp'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { useLiveSessionStore } from '../store/live-session-store'
import { useCasinoSessionTrackerStore } from '../store/casino-session-tracker-store'
import { ABANDONED_AFTER_MS, LIVE_SESSION_KEY, saveLiveSession } from '../services/casino-live-session'
import { savedTable } from '../components/casino-session/saved-table.fixture'

const show = () => render(<MemoryRouter><TrainerApp /></MemoryRouter>)
const casinoSessions = () => useStatsStore.getState().sessions.filter(s => s.mode === 'casinoSession')

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ currentMode: 'home' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0 })
  useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
})
afterEach(cleanup)

describe('opening the app with a table saved', () => {
  it('offers a recent one on the home screen, and records nothing', async () => {
    saveLiveSession(savedTable([25, -25, 25]))
    show()

    expect(await screen.findByTestId('resume-session-card')).toBeInTheDocument()
    expect(screen.getAllByTestId('resume-session-card')).toHaveLength(1)
    expect(casinoSessions()).toHaveLength(0)
    expect(localStorage.getItem(LIVE_SESSION_KEY)).not.toBeNull()
  })

  it('cashes out one that was left for more than a day — once, with the time of its last hand, and no card', async () => {
    const savedAt = Date.now() - ABANDONED_AFTER_MS - 3_600_000
    const saved = savedTable([25, 25, -25], { savedAt, elapsedSeconds: 480 })
    saveLiveSession(saved)
    show()

    await waitFor(() => expect(casinoSessions()).toHaveLength(1))
    const [row] = casinoSessions()
    expect(row.id).toBe(saved.id)
    expect(row.details).toMatchObject({ handsPlayed: 3, netProfit: 25 })
    expect(row.durationSeconds).toBe(480)
    expect(new Date(row.timestamp).getTime()).toBe(savedAt - 480_000)
    expect(useCasinoSessionTrackerStore.getState().sessions.map(s => s.timestamp)).toEqual([savedAt])
    expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull()
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })

  it('cashes it out once when the app is opened again, and when it is open twice', async () => {
    saveLiveSession(savedTable([25], { savedAt: Date.now() - ABANDONED_AFTER_MS - 1000 }))
    show()
    show()
    await waitFor(() => expect(casinoSessions()).toHaveLength(1))
    cleanup()
    show()
    await act(async () => { await Promise.resolve() })
    expect(casinoSessions()).toHaveLength(1)
    expect(useCasinoSessionTrackerStore.getState().sessions).toHaveLength(1)
  })

  it('throws away an old table nothing was played at', async () => {
    saveLiveSession(savedTable([], { savedAt: Date.now() - ABANDONED_AFTER_MS - 1000 }))
    show()
    await waitFor(() => expect(localStorage.getItem(LIVE_SESSION_KEY)).toBeNull())
    expect(casinoSessions()).toHaveLength(0)
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })

  it('takes the card away when another tab settles the table', async () => {
    saveLiveSession(savedTable())
    show()
    expect(await screen.findByTestId('resume-session-card')).toBeInTheDocument()

    localStorage.removeItem(LIVE_SESSION_KEY)
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: LIVE_SESSION_KEY })) })
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })
})
