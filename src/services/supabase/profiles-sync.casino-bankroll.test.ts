import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same supabase-js shape as profiles-sync.test.ts: reads with
// `from().select().eq().maybeSingle()`, writes with `from().update().eq().select()`.
const maybeSingle = vi.fn()
const selectEq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq: selectEq }))
const writeSelect = vi.fn()
const updateEq = vi.fn(() => ({ select: writeSelect }))
const update = vi.fn(() => ({ eq: updateEq }))
const from = vi.fn(() => ({ select, update }))
const getSession = vi.fn()

vi.mock('./client', () => ({
  requireSupabase: () => ({ from, auth: { getSession } }),
  isSupabaseConfigured: true,
}))

import { syncProfileOnSignIn, pushProfileScalarsNow, resetProfileSync } from './profiles-sync'
import { levelSystem } from '../level-system'
import { useCasinoSessionTrackerStore, type TrackedCasinoSession } from '../../store/casino-session-tracker-store'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'

const cloudRow = (settings: Record<string, unknown> = {}) => ({
  level_xp: 0, sim_count: 0, sim_best_edge: 0, onboarding_seen: false, settings,
})

const lastSettings = () =>
  ((update.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]).settings as Record<string, unknown>

const session = (profit: number): TrackedCasinoSession => ({
  id: 'cs-1', date: '2026-11-01', timestamp: 1, handsPlayed: 40, duration: 1800,
  startingBankroll: 5000, finalBankroll: 5000 + profit, profit,
  betAccuracy: 90, playAccuracy: 90, countAccuracy: 90, overallScore: 90, grade: 'A',
  numBots: 0, config: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
})

describe('profiles-sync: the Casino Session Tracker’s starting bankroll travels in settings.casino_starting_bankroll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    levelSystem.reload()
    resetProfileSync()
    useCasinoSessionTrackerStore.setState({ sessions: [], startingBankroll: 0, startingBankrollUpdatedAt: 0 })
    useBankrollTrackerStore.setState({ sessions: [], startingBankroll: 0, startingBankrollUpdatedAt: 0 })
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    maybeSingle.mockResolvedValue({ data: cloudRow(), error: null })
    writeSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  })

  it('a device wiped by a sign-out gets the figure back at sign-in', async () => {
    maybeSingle.mockResolvedValue({
      data: cloudRow({ casino_starting_bankroll: { amount: 5000, updatedAt: 1_700_000_000_000 } }),
      error: null,
    })
    useCasinoSessionTrackerStore.getState().hydrate([session(-1200)])

    await syncProfileOnSignIn()

    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(5000)
    expect(useCasinoSessionTrackerStore.getState().getCurrentBankroll()).toBe(3800)
  })

  it('keeps the two trackers’ figures apart', async () => {
    maybeSingle.mockResolvedValue({
      data: cloudRow({
        starting_bankroll: { amount: 2000, updatedAt: 1 },
        casino_starting_bankroll: { amount: 9000, updatedAt: 1 },
      }),
      error: null,
    })
    await syncProfileOnSignIn()
    expect(useBankrollTrackerStore.getState().startingBankroll).toBe(2000)
    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(9000)
    expect(lastSettings().starting_bankroll).toEqual({ amount: 2000, updatedAt: 1 })
    expect(lastSettings().casino_starting_bankroll).toEqual({ amount: 9000, updatedAt: 1 })
  })

  it('a figure set on this device reaches an account that has none', async () => {
    useCasinoSessionTrackerStore.setState({ startingBankroll: 2500, startingBankrollUpdatedAt: 7 })
    await syncProfileOnSignIn()
    expect(lastSettings().casino_starting_bankroll).toEqual({ amount: 2500, updatedAt: 7 })
  })

  it('setting it by hand pushes it, and the later edit wins over the cloud', async () => {
    await syncProfileOnSignIn()
    maybeSingle.mockResolvedValue({
      data: cloudRow({ casino_starting_bankroll: { amount: 5000, updatedAt: 10 } }),
      error: null,
    })
    useCasinoSessionTrackerStore.getState().setStartingBankroll(4000)
    await vi.waitFor(() => expect(writeSelect).toHaveBeenCalledTimes(2))
    expect((lastSettings().casino_starting_bankroll as { amount: number }).amount).toBe(4000)
    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(4000)
  })

  it('an older figure on a tab that fell behind does not overwrite a newer one', async () => {
    useCasinoSessionTrackerStore.setState({ startingBankroll: 1000, startingBankrollUpdatedAt: 10 })
    await syncProfileOnSignIn()
    maybeSingle.mockResolvedValue({
      data: cloudRow({ casino_starting_bankroll: { amount: 6000, updatedAt: 20 } }),
      error: null,
    })
    await pushProfileScalarsNow()
    expect(lastSettings().casino_starting_bankroll).toEqual({ amount: 6000, updatedAt: 20 })
    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(6000)
  })

  it('without a figure on either side, writes no key; a damaged value is no figure', async () => {
    await syncProfileOnSignIn()
    expect(lastSettings()).not.toHaveProperty('casino_starting_bankroll')
    resetProfileSync()
    useCasinoSessionTrackerStore.setState({ startingBankroll: 3000, startingBankrollUpdatedAt: 0 })
    maybeSingle.mockResolvedValue({ data: cloudRow({ casino_starting_bankroll: { amount: 'lots' } }), error: null })
    await syncProfileOnSignIn()
    expect(useCasinoSessionTrackerStore.getState().startingBankroll).toBe(3000)
  })
})
