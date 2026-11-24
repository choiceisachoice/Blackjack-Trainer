import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * "Go Pro" with and without an account.
 *
 * The public strategy chart opens this panel for visitors who are not signed
 * in, and a checkout needs an account: sent straight to Stripe's Edge Function
 * the request failed and the visitor read an error at the moment they wanted
 * to pay. Signed out, the panel now keeps the intent and goes to sign-up —
 * the landing page's and the guest trial's way — and `App.tsx` resumes the
 * checkout after sign-in. Signed in, nothing changed.
 */
vi.mock('../../store/auth-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../store/auth-store')>()),
  isSupabaseConfigured: true,
}))
vi.mock('../../services/supabase/billing', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/supabase/billing')>()),
  startCheckout: vi.fn(async () => 'redirecting'),
}))
vi.mock('../../services/supabase/plan-prices', () => ({
  fetchPlanPrices: vi.fn(async () => []),
}))
vi.mock('../../services/analytics/events', () => ({ trackEvent: vi.fn(async () => {}) }))

import { UpgradeModalHost } from './UpgradeModalHost'
import { startCheckout, consumePendingCheckout } from '../../services/supabase/billing'
import { useAuthStore } from '../../store/auth-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { useStatsStore } from '../../store/stats-store'

function chartPage() {
  return render(
    <MemoryRouter initialEntries={['/strategy-chart']}>
      <Routes>
        <Route path="/strategy-chart" element={<UpgradeModalHost subject="deviations" />} />
        <Route path="/login" element={<div data-testid="login-page" />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  vi.mocked(startCheckout).mockClear()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useUpgradePrompt.getState().hide()
})
afterEach(() => vi.restoreAllMocks())

describe('UpgradePanel — buying without an account', () => {
  it('keeps the chosen plan, closes the paywall and goes to sign-up instead of failing at checkout', () => {
    useAuthStore.setState({ status: 'signedOut', user: null, session: null })
    chartPage()
    act(() => useUpgradePrompt.getState().show())
    fireEvent.click(screen.getByTestId('billing-monthly'))
    fireEvent.click(screen.getByTestId('upgrade-monthly'))

    expect(startCheckout).not.toHaveBeenCalled()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(useUpgradePrompt.getState().open).toBe(false)
    expect(consumePendingCheckout()).toBe('monthly')
  })

  it('starts the checkout as before for a signed-in account', () => {
    useAuthStore.setState({ status: 'signedIn' })
    chartPage()
    act(() => useUpgradePrompt.getState().show())
    fireEvent.click(screen.getByTestId('upgrade-yearly'))

    expect(startCheckout).toHaveBeenCalledWith('yearly')
    expect(screen.queryByTestId('login-page')).toBeNull()
    expect(consumePendingCheckout()).toBeNull()
  })

  it('does not treat a session that is still loading as signed out', () => {
    useAuthStore.setState({ status: 'loading' })
    chartPage()
    act(() => useUpgradePrompt.getState().show())
    fireEvent.click(screen.getByTestId('upgrade-yearly'))
    expect(startCheckout).toHaveBeenCalledWith('yearly')
  })
})
