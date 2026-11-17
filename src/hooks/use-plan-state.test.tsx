import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

// Whether there is a cloud to wait for is decided at build time. Tests run
// without one, so the flag is the one thing stood in for here.
const cloud = vi.hoisted(() => ({ configured: true }))
vi.mock('../services/supabase/client', () => ({
  get isSupabaseConfigured() { return cloud.configured },
  supabase: null,
  requireSupabase: () => { throw new Error('no client in this test') },
}))

import { usePlanState, useAwaitingAccount } from './use-plan-state'
import { useCloudSyncStore } from '../store/cloud-sync-store'
import { setPlacement, markStageRead, setPlacementSkipped } from '../services/curriculum'
import { setProfile } from '../services/learner-profile'
import { setWelcomeSeen } from '../services/onboarding'
import { writePlanState, type PlanState } from '../services/plan-state'
import { withoutRinging } from '../services/plan-state-signal'

const FROM_ACCOUNT: PlanState = {
  placement: 'true-count',
  skipped: false,
  readStages: ['rules'],
  profile: { goal: 'profit', commitment: 'regular', daysPerWeek: 4, minutesPerDay: 30 },
  startLevel: 'counting',
  welcomeSeen: true,
  tourSeen: true,
  recommendationDone: true,
  levelIntroSeen: true,
  updatedAt: 1_700_000_000_000,
}

beforeEach(() => {
  localStorage.clear()
  cloud.configured = true
  useCloudSyncStore.setState({ status: 'idle' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('usePlanState', () => {
  it('reads "never asked" from an empty device', () => {
    const { result } = renderHook(() => usePlanState())
    expect(result.current).toMatchObject({
      placement: null, skipped: false, profile: null, welcomeSeen: false, readStages: [],
    })
  })

  it('reads what is already stored when it mounts', () => {
    setPlacement('hi-lo')
    setWelcomeSeen()
    const { result } = renderHook(() => usePlanState())
    expect(result.current).toMatchObject({ placement: 'hi-lo', welcomeSeen: true })
  })

  it('reads again when an answer is given on this device', () => {
    const { result } = renderHook(() => usePlanState())

    act(() => setPlacement('deviations'))
    expect(result.current.placement).toBe('deviations')

    act(() => setProfile({ goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 }))
    expect(result.current.profile).toEqual({ goal: 'curious', commitment: 'light', daysPerWeek: 1, minutesPerDay: 10 })

    act(() => markStageRead('rules'))
    expect(result.current.readStages).toEqual(['rules'])

    act(() => setPlacementSkipped())
    expect(result.current.skipped).toBe(true)
  })

  it('reads again when the account’s copy lands after mount', () => {
    // The sign-in merge finishes after the plan has rendered. A hook that
    // read once stayed on "never asked" and the plan asked the first-day
    // question of a returning learner.
    const { result } = renderHook(() => usePlanState())
    expect(result.current.placement).toBeNull()

    act(() => writePlanState(FROM_ACCOUNT))

    expect(result.current).toEqual(FROM_ACCOUNT)
  })

  it('hands back the same object while nothing was written', () => {
    // The state is nine storage reads; a re-render must not repeat them, and
    // an unchanged object is what lets the screen skip work.
    setPlacement('hi-lo')
    const read = vi.spyOn(Storage.prototype, 'getItem')
    const { result, rerender } = renderHook(() => usePlanState())
    const first = result.current
    const reads = read.mock.calls.length

    rerender()
    rerender()

    expect(result.current).toBe(first)
    expect(read.mock.calls.length).toBe(reads)
  })

  it('does not notice a write that was made in silence', () => {
    // The other half of the contract: only a rung bell makes it read again.
    const { result } = renderHook(() => usePlanState())
    act(() => withoutRinging(() => setPlacement('hi-lo')))
    expect(result.current.placement).toBeNull()
  })

  it('stops listening when the screen goes away', () => {
    const { result, unmount } = renderHook(() => usePlanState())
    const last = result.current
    unmount()
    expect(() => setPlacement('table')).not.toThrow()
    expect(result.current).toBe(last)
  })

  it('keeps two screens in step', () => {
    const a = renderHook(() => usePlanState())
    const b = renderHook(() => usePlanState())
    act(() => setPlacement('bet-spread'))
    expect(a.result.current.placement).toBe('bet-spread')
    expect(b.result.current.placement).toBe('bet-spread')
  })
})

describe('useAwaitingAccount', () => {
  it('waits while the sign-in merge has not started or is in flight', () => {
    const { result } = renderHook(() => useAwaitingAccount())
    // `idle`: the first render after a sign-in, before the sync has begun.
    expect(result.current).toBe(true)

    act(() => useCloudSyncStore.getState().set('syncing'))
    expect(result.current).toBe(true)
  })

  it('stops waiting once the merge has finished, however it went', () => {
    const { result } = renderHook(() => useAwaitingAccount())
    act(() => useCloudSyncStore.getState().set('done'))
    expect(result.current).toBe(false)
  })

  it('waits again after a sign-out puts the status back to idle', () => {
    useCloudSyncStore.setState({ status: 'done' })
    const { result } = renderHook(() => useAwaitingAccount())
    expect(result.current).toBe(false)
    act(() => useCloudSyncStore.getState().set('idle'))
    expect(result.current).toBe(true)
  })

  it('never waits where there is no cloud to wait for', () => {
    // Offline build: an empty device is simply a new learner.
    cloud.configured = false
    for (const status of ['idle', 'syncing', 'done'] as const) {
      useCloudSyncStore.setState({ status })
      const { result, unmount } = renderHook(() => useAwaitingAccount())
      expect(result.current, status).toBe(false)
      unmount()
    }
  })
})
