import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'

/**
 * The plan on a build that has an account behind it.
 *
 * Every other test of the plan runs with Supabase unconfigured, where an empty
 * device simply is a new learner. With an account there is a third state —
 * the answers are on their way — and getting it wrong is what greeted a
 * returning learner with "where are you starting from?" (17 Nov 2026).
 */
vi.mock('../../services/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: null,
  requireSupabase: () => { throw new Error('no client in this test') },
}))

const proState = { isPro: true }
vi.mock('../../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../store/entitlement-store')>()),
  useIsPro: () => proState.isPro,
}))

import { TrainingPlan } from './TrainingPlan'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useCloudSyncStore } from '../../store/cloud-sync-store'
import { writePlanState, type PlanState } from '../../services/plan-state'
import type { TrainingSessionResult } from '../../services/stats-types'

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

const upNextTitle = () =>
  within(screen.getByTestId('plan-up-next')).getByRole('heading', { level: 2 }).textContent

/** Nothing of the first-day flow is on screen. */
function expectNoFirstDayScreens() {
  expect(screen.queryByTestId('welcome-screen')).toBeNull()
  expect(screen.queryByTestId('starting-point')).toBeNull()
  expect(screen.queryByTestId('time-question')).toBeNull()
}

beforeEach(() => {
  localStorage.clear()
  proState.isPro = true
  useAppStore.setState({ currentMode: 'plan' })
  useCloudSyncStore.setState({ status: 'idle' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, loadStats: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TrainingPlan — while the account’s answers are on their way', () => {
  it('waits instead of greeting an empty device right after a sign-in', () => {
    // `idle` is the first render after a sign-in, before the sync has begun.
    render(<TrainingPlan />)
    const loading = screen.getByTestId('plan-loading')
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(loading).toHaveAccessibleName('Loading your plan')
    expectNoFirstDayScreens()
    expect(screen.queryByTestId('training-plan')).toBeNull()
  })

  it('keeps waiting while the merge is in flight', () => {
    useCloudSyncStore.setState({ status: 'syncing' })
    render(<TrainingPlan />)
    expect(screen.getByTestId('plan-loading')).toBeInTheDocument()
    expectNoFirstDayScreens()
  })

  it('keeps the page’s slots out of sight while it waits', () => {
    render(
      <TrainingPlan
        embedded
        before={<div data-testid="slot-before" />}
        after={<div data-testid="slot-after" />}
      />,
    )
    expect(screen.getByTestId('plan-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('slot-before')).toBeNull()
    expect(screen.queryByTestId('slot-after')).toBeNull()
  })

  it('goes straight from waiting to the returning learner’s plan', () => {
    // The sign-out/sign-in case, start to finish: empty device, the merge
    // writes the account's answers, the sync reports done.
    useCloudSyncStore.setState({ status: 'syncing' })
    render(<TrainingPlan />)
    expect(screen.getByTestId('plan-loading')).toBeInTheDocument()

    act(() => writePlanState(FROM_ACCOUNT))
    // The answers are enough on their own — no need for the sync to finish.
    expect(screen.queryByTestId('plan-loading')).toBeNull()
    expectNoFirstDayScreens()
    expect(upNextTitle()).toBe('True count')

    act(() => useCloudSyncStore.getState().set('done'))
    expectNoFirstDayScreens()
    expect(upNextTitle()).toBe('True count')
    expect(screen.getByTestId('plan-pace')).toHaveTextContent('4 days a week · 30 min')
  })

  it('never shows the welcome or the question at any step of that sequence', () => {
    const seen: string[] = []
    const note = () => {
      for (const id of ['welcome-screen', 'starting-point', 'time-question']) {
        if (screen.queryByTestId(id)) seen.push(id)
      }
    }
    render(<TrainingPlan />)
    note()
    act(() => useCloudSyncStore.getState().set('syncing'))
    note()
    act(() => writePlanState(FROM_ACCOUNT))
    note()
    act(() => useCloudSyncStore.getState().set('done'))
    note()
    expect(seen).toEqual([])
  })

  it('greets a genuinely new account once the merge has come back empty', () => {
    useCloudSyncStore.setState({ status: 'syncing' })
    render(<TrainingPlan />)
    act(() => useCloudSyncStore.getState().set('done'))

    expect(screen.queryByTestId('plan-loading')).toBeNull()
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
  })

  it('does not block the first-day screens when the merge failed', () => {
    // `done` means finished, successfully or not: a dead network delays the
    // greeting by one failed request and never withholds it.
    useCloudSyncStore.setState({ status: 'done' })
    render(<TrainingPlan />)
    expect(screen.queryByTestId('plan-loading')).toBeNull()
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
  })

  it('does not make a device that already holds its answers wait', () => {
    // A reload while signed in: the plan is on the device, the sync is a
    // background refresh.
    localStorage.setItem('bjt_placement', 'hi-lo')
    for (const status of ['idle', 'syncing'] as const) {
      useCloudSyncStore.setState({ status })
      const { unmount } = render(<TrainingPlan />)
      expect(screen.queryByTestId('plan-loading'), status).toBeNull()
      expect(upNextTitle(), status).toBe('The Hi-Lo count')
      unmount()
    }
  })

  it('does not make a learner who declined the question wait either', () => {
    localStorage.setItem('bjt_placement_skipped', 'true')
    useCloudSyncStore.setState({ status: 'syncing' })
    render(<TrainingPlan />)
    expect(screen.queryByTestId('plan-loading')).toBeNull()
    expect(screen.getByTestId('training-plan')).toBeInTheDocument()
  })

  it('still waits when local sessions exist but the answers have not arrived', () => {
    // Sessions on the device do not say where the account's plan starts; the
    // account's own placement may be seconds away.
    useStatsStore.setState({
      sessions: [{
        id: 'a', mode: 'speedDrill', timestamp: new Date().toISOString(), durationSeconds: 60,
        totalQuestions: 20, correctAnswers: 10, accuracy: 0.5, bestStreak: 2,
      } as unknown as TrainingSessionResult],
    })
    useCloudSyncStore.setState({ status: 'syncing' })
    render(<TrainingPlan />)
    expect(screen.getByTestId('plan-loading')).toBeInTheDocument()

    // Once the merge is over with nothing to bring, the history speaks.
    act(() => useCloudSyncStore.getState().set('done'))
    expectNoFirstDayScreens()
    expect(upNextTitle()).toBe('The game itself')
  })
})
