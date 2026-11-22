import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/**
 * The paywall after the free trial of the casino table: one line about the
 * hands that were just played, where the table would be — and nowhere else.
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
import { trialPaywallLine } from './paywall-line'
import { useStatsStore } from '../../store/stats-store'
import { computeLifetimeStats } from '../../services/storage/storage-service'

/** A casino session as the table records it. */
function tableSession(id: string, hands: number, correct: number, decisions: number, trial = true): TrainingSessionResult {
  return {
    id,
    mode: 'casinoSession',
    timestamp: new Date(Date.UTC(2026, 10, 20, 12)).toISOString(),
    countingSystem: CountingSystemId.HiLo,
    durationSeconds: 240,
    totalQuestions: decisions,
    correctAnswers: correct,
    accuracy: decisions > 0 ? correct / decisions : 0,
    bestStreak: 0,
    details: {
      type: 'casinoSession',
      handsPlayed: hands,
      netProfit: -75,
      overallScore: 80,
      grade: 'B',
      betAccuracy: 0,
      playAccuracy: decisions > 0 ? (correct / decisions) * 100 : 0,
      countAccuracy: 0,
      deviationAccuracy: 0,
      playStyle: 'basic',
      numBots: 2,
      hadBlackjack: false,
      longestWinStreak: 1,
      splitAces: false,
      maxSplitHands: 1,
      ...(trial ? { trial: true } : {}),
    },
  }
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
})
afterEach(() => vi.restoreAllMocks())

describe('trialPaywallLine', () => {
  it('says nothing when no trial was played', () => {
    expect(trialPaywallLine([])).toBeNull()
    // A Pro table played while the account had Pro is not the trial.
    expect(trialPaywallLine([tableSession('a', 30, 40, 44, false)])).toBeNull()
  })

  it('names the hands and the share of decisions that were right', () => {
    expect(trialPaywallLine([tableSession('a', 10, 12, 14)])).toEqual({
      lead: { key: 'paywall.trialLead', values: { count: 10, pct: 86 } },
      support: { key: 'paywall.trialSupport' },
    })
  })

  it('adds up a trial that was played in more than one sitting', () => {
    const line = trialPaywallLine([tableSession('a', 4, 5, 5), tableSession('b', 6, 4, 7)])
    expect(line?.lead.values).toEqual({ count: 10, pct: 75 })
  })

  it('prints no percentage of nothing', () => {
    // Ten hands, not one decision in them: blackjacks and dealer blackjacks.
    expect(trialPaywallLine([tableSession('a', 10, 0, 0)])).toBeNull()
  })
})

describe('the paywall where the table would be', () => {
  it('opens with what the trial hands came to', () => {
    learner([tableSession('a', 10, 12, 14)])
    render(<UpgradePanel atTable />)

    expect(screen.getByTestId('paywall-personal-lead'))
      .toHaveTextContent('Your 10 hands at the table: 86% of your decisions followed basic strategy.')
    expect(screen.getByTestId('paywall-personal-support'))
      .toHaveTextContent('With Pro the table stays open: as many hands as you like, with the count and your own rules.')
  })

  it('still reports the view to the funnel, once', () => {
    learner([tableSession('a', 10, 12, 14)])
    render(<UpgradePanel atTable />)
    expect(trackEvent).toHaveBeenCalledTimes(1)
    expect(trackEvent).toHaveBeenCalledWith('paywall_view')
  })

  it('keeps the generic line for someone who never played the trial', () => {
    render(<UpgradePanel atTable />)
    expect(screen.queryByTestId('paywall-personal')).toBeNull()
    expect(screen.getByTestId('paywall-sub')).toBeInTheDocument()
  })

  it('does not bring the trial up on another locked screen', () => {
    learner([tableSession('a', 10, 12, 14)])
    render(<UpgradePanel />)
    expect(screen.queryByText(/hands at the table/)).toBeNull()
  })
})
