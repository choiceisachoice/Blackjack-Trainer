import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/**
 * The line about the learner at the top of the paywall, and the two steps on
 * the path to purchase this panel reports.
 *
 * The line has to be true or absent. Each case below is a learner the app
 * really has: placed on a stage Pro gates, placed on a free one, brand new,
 * and sent here by a locked feature that already said what it was.
 */
vi.mock('../../services/supabase/billing', () => ({
  startCheckout: vi.fn(async () => 'redirecting'),
}))
vi.mock('../../services/supabase/plan-prices', () => ({
  fetchPlanPrices: vi.fn(async () => []),
}))
const trackEvent = vi.fn<(name: string) => Promise<void>>()
vi.mock('../../services/analytics/events', () => ({ trackEvent: (name: string) => trackEvent(name) }))

import { UpgradePanel } from './UpgradePanel'
import { UpgradeModalHost } from './UpgradeModalHost'
import { paywallLine } from './paywall-line'
import { useStatsStore } from '../../store/stats-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { setPlacement, setReadStages } from '../../services/curriculum'
import { computeLifetimeStats } from '../../services/storage/storage-service'

const SYSTEM = CountingSystemId.HiLo

const GENERIC = 'Unlock the advanced modes and the full picture of your card-counting edge.'

/** `n` speed drills at 95%, one per day — enough to finish the Hi-Lo stage. */
function hiLoSessions(n: number): TrainingSessionResult[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    mode: 'speedDrill',
    timestamp: new Date(Date.UTC(2026, 10, 1 + i, 12)).toISOString(),
    countingSystem: SYSTEM,
    durationSeconds: 300,
    totalQuestions: 40,
    correctAnswers: 38,
    accuracy: 0.95,
    bestStreak: 20,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [0] },
  } satisfies TrainingSessionResult))
}

function learner(sessions: TrainingSessionResult[]) {
  useStatsStore.setState({ sessions, lifetimeStats: computeLifetimeStats(sessions), isLoading: false })
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  trackEvent.mockReset()
  trackEvent.mockResolvedValue()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useUpgradePrompt.getState().hide()
})
afterEach(() => vi.restoreAllMocks())

describe('paywallLine — the cases', () => {
  const base = { sessions: [] as TrainingSessionResult[], placement: null, readStages: [], claimed: [], goal: null }

  it('says nothing about a learner with no placement and no session', () => {
    expect(paywallLine(base)).toBeNull()
  })

  it('names the finished stage and the Pro stage after it', () => {
    expect(paywallLine({ ...base, placement: 'hi-lo', sessions: hiLoSessions(10) })).toEqual({
      lead: { key: 'paywall.personalFinished', stageTitleKey: 'curriculum.hi-lo.title' },
      support: { key: 'paywall.personalNextIsPro', stageTitleKey: 'curriculum.true-count.title' },
    })
  })

  it('does not call a stage finished that the placement merely skipped', () => {
    expect(paywallLine({ ...base, placement: 'true-count' })).toEqual({
      lead: { key: 'paywall.personalAt', stageTitleKey: 'curriculum.true-count.title' },
      support: { key: 'paywall.personalThisIsPro' },
    })
  })

  it('names the stage in progress and the Pro stage further along', () => {
    expect(paywallLine({ ...base, placement: 'basic-strategy' })).toEqual({
      lead: { key: 'paywall.personalAt', stageTitleKey: 'curriculum.basic-strategy.title' },
      support: { key: 'paywall.personalLaterIsPro', stageTitleKey: 'curriculum.true-count.title' },
    })
  })

  it('treats a learner with sessions and no placement as starting at the beginning, like the plan does', () => {
    expect(paywallLine({ ...base, sessions: hiLoSessions(2) })?.lead)
      .toEqual({ key: 'paywall.personalAt', stageTitleKey: 'curriculum.rules.title' })
  })

  it('skips Pro stages already finished under an earlier subscription', () => {
    // True count done and paid; the free deviations stage is where they are,
    // and the next Pro stage on a serious path is the bet spread.
    expect(paywallLine({ ...base, placement: 'true-count', claimed: ['true-count'] })).toEqual({
      lead: { key: 'paywall.personalAt', stageTitleKey: 'curriculum.deviations.title' },
      support: { key: 'paywall.personalLaterIsPro', stageTitleKey: 'curriculum.bet-spread.title' },
    })
  })

  it('never names a stage beyond the learner’s goal', () => {
    // "Stop losing" ends at deviations: with the true count behind them there
    // is no Pro stage left on their path, so nothing is claimed.
    expect(paywallLine({ ...base, placement: 'true-count', claimed: ['true-count'], goal: 'stop-losing' })).toBeNull()
    // And a learner already past their goal is not sold the stage after it.
    expect(paywallLine({ ...base, placement: 'bet-spread', goal: 'curious' })).toBeNull()
  })
})

describe('UpgradePanel — the line about the learner', () => {
  it('a learner who finished Hi-Lo reads that, and that the true count is next and part of Pro', () => {
    setPlacement('hi-lo')
    setReadStages(['hi-lo'])
    learner(hiLoSessions(10))
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-personal-lead')).toHaveTextContent('You have finished “The Hi-Lo count”.')
    expect(screen.getByTestId('paywall-personal-support')).toHaveTextContent('Next on your plan: “True count” — it is part of Pro.')
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it('a learner placed on a Pro stage reads where the plan is and that practising it is Pro', () => {
    setPlacement('true-count')
    learner([])
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-personal-lead')).toHaveTextContent('Your plan is at “True count”.')
    expect(screen.getByTestId('paywall-personal-support')).toHaveTextContent('Practising it is part of Pro.')
  })

  it('a learner placed on a free stage reads where they are and which later stage Pro opens', () => {
    setPlacement('basic-strategy')
    learner([])
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-personal-lead')).toHaveTextContent('Your plan is at “Basic strategy”.')
    expect(screen.getByTestId('paywall-personal-support')).toHaveTextContent('Further along your plan, “True count” is part of Pro.')
  })

  it('a learner with no history reads the generic line', async () => {
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-sub')).toHaveTextContent(GENERIC)
    // Still generic once the (empty) history has been read.
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('paywall-sub')).toHaveTextContent(GENERIC)
    expect(screen.queryByTestId('paywall-personal')).toBeNull()
  })

  it('a caller’s headline wins over the personal line', () => {
    setPlacement('basic-strategy')
    learner([])
    render(<UpgradePanel headline="Deviations on the chart are part of Pro." />)
    expect(screen.getByTestId('paywall-sub')).toHaveTextContent('Deviations on the chart are part of Pro.')
    expect(screen.queryByTestId('paywall-personal')).toBeNull()
    expect(screen.queryByText(GENERIC)).toBeNull()
  })

  it('the modal passes a headline given to show(), and falls back to the personal line without one', () => {
    setPlacement('basic-strategy')
    learner([])
    render(<UpgradeModalHost />)
    act(() => useUpgradePrompt.getState().show('“True count” is part of Pro.'))
    expect(screen.getByTestId('paywall-sub')).toHaveTextContent('“True count” is part of Pro.')
    act(() => useUpgradePrompt.getState().hide())
    act(() => useUpgradePrompt.getState().show())
    expect(screen.getByTestId('paywall-personal-lead')).toHaveTextContent('Your plan is at “Basic strategy”.')
  })

  it('says the generic thing until the history has been read, then the personal one', async () => {
    // A paywall opened by a deep link: placement known, sessions not loaded.
    setPlacement('basic-strategy')
    let finish: () => void = () => {}
    const loadStats = vi.fn(() => new Promise<void>(resolve => {
      finish = () => { useStatsStore.setState({ sessions: [], lifetimeStats: computeLifetimeStats([]) }); resolve() }
    }))
    useStatsStore.setState({ loadStats })
    render(<UpgradePanel />)
    expect(loadStats).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('paywall-sub')).toHaveTextContent(GENERIC)
    await act(async () => { finish(); await Promise.resolve() })
    expect(screen.getByTestId('paywall-personal-lead')).toHaveTextContent('Your plan is at “Basic strategy”.')
  })

  it('keeps the heading, the plan toggle and the buy button exactly where they were', () => {
    setPlacement('basic-strategy')
    learner([])
    render(<UpgradePanel />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Go Pro')
    expect(screen.getByTestId('billing-monthly')).toBeInTheDocument()
    expect(screen.getByTestId('billing-yearly')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('upgrade-yearly')).toBeInTheDocument()
    // No price is invented for the personal line: none loaded, none shown.
    expect(screen.getByTestId('paywall-price-pending')).toBeInTheDocument()
  })

  it('reads in German too, with the stage titles of that language', async () => {
    const { setLocale } = await import('../../i18n')
    setPlacement('hi-lo')
    learner(hiLoSessions(10))
    await act(async () => { await setLocale('de') })
    try {
      render(<UpgradePanel />)
      expect(screen.getByTestId('paywall-personal-lead')).toHaveTextContent('Du hast „Der Hi-Lo-Count“ abgeschlossen.')
      expect(screen.getByTestId('paywall-personal-support')).toHaveTextContent('Als Nächstes in deinem Plan: „True Count“ – das gehört zu Pro.')
    } finally {
      await act(async () => { await setLocale('en') })
    }
  })
})

describe('UpgradePanel — the path to purchase', () => {
  it('reports paywall_view once when it is shown, not on every re-render', () => {
    const { rerender } = render(<UpgradePanel />)
    rerender(<UpgradePanel />)
    fireEvent.click(screen.getByTestId('billing-monthly'))
    expect(trackEvent.mock.calls.filter(c => c[0] === 'paywall_view')).toHaveLength(1)
  })

  it('reports paywall_view when the modal opens, and again when it is opened again', () => {
    render(<UpgradeModalHost />)
    expect(trackEvent).not.toHaveBeenCalled()
    act(() => useUpgradePrompt.getState().show())
    expect(trackEvent.mock.calls.filter(c => c[0] === 'paywall_view')).toHaveLength(1)
    act(() => useUpgradePrompt.getState().hide())
    act(() => useUpgradePrompt.getState().show('x'))
    // The server keeps one per visitor and half hour; the client does not guess.
    expect(trackEvent.mock.calls.filter(c => c[0] === 'paywall_view')).toHaveLength(2)
  })
})
