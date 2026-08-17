import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Buying Pro from `/account`.
 *
 * ## Why this is a separate file
 *
 * It needs a *configured* backend. `selectIsPro` short-circuits to `true`
 * whenever there is no Supabase — right for unlocking features in local
 * development, but it means the upgrade button never renders under test. Which
 * is exactly why the checkout this page used to start had no coverage at all:
 * the button that triggered it was never on screen.
 *
 * Mocking that module for the whole of `AccountPage.test.tsx` would flip its
 * cases from the Pro path to the free one, so the free path lives here.
 *
 * ## What is being held
 *
 * The button used to call `startCheckout('yearly')` directly: one click from
 * "Go Pro" to a 69 CHF annual subscription, with no price, no term and no
 * choice shown on the page — and no route to the monthly plan the landing page
 * advertises. Stripe shows the amount before payment, so nothing was charged
 * unseen; but "Go Pro" meant something different here than anywhere else in
 * the product, and the decision belongs on the paywall that already asks it.
 */

const openBillingPortal = vi.fn<() => Promise<void>>()
const startCheckout = vi.fn<(plan: string) => Promise<'redirecting' | 'already-subscribed'>>()

vi.mock('../services/supabase/billing', () => ({
  openBillingPortal: () => openBillingPortal(),
  startCheckout: (plan: string) => startCheckout(plan),
}))

vi.mock('../services/supabase/cloud-sync', () => ({
  signOutAndClearLocal: vi.fn(async () => {}),
}))

vi.mock('../services/supabase/client', () => ({
  supabase: null,
  isSupabaseConfigured: true,
  requireSupabase: () => { throw new Error('no backend needed in these tests') },
}))

import { AccountPage } from './AccountPage'
import { useEntitlementStore } from '../store/entitlement-store'
import { useUpgradePrompt } from '../store/upgrade-prompt-store'

const T = { timeout: 5000 }
const renderPage = () => render(<MemoryRouter><AccountPage /></MemoryRouter>)
const goPro = () => screen.getByTestId('account-go-pro')

beforeEach(() => {
  startCheckout.mockReset()
  openBillingPortal.mockReset()
  useUpgradePrompt.getState().hide()
  useEntitlementStore.setState({
    status: 'free',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    loaded: true,
  })
})

afterEach(cleanup)

describe('upgrading from the account page', () => {
  it('offers the upgrade at all while the account is on the free plan', () => {
    renderPage()
    expect(goPro()).toBeInTheDocument()
  })

  it('opens the paywall instead of starting a checkout', async () => {
    renderPage()
    fireEvent.click(goPro())

    await waitFor(() => expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument(), T)
    expect(startCheckout).not.toHaveBeenCalled()
  })

  it('shows both plans and their prices before anything is bought', async () => {
    renderPage()
    fireEvent.click(goPro())

    const modal = await screen.findByTestId('upgrade-modal', {}, T)
    expect(modal).toHaveTextContent(/Monthly/i)
    expect(modal).toHaveTextContent(/Yearly/i)
    // The figures someone is agreeing to, on screen before the click that charges.
    expect(modal.textContent).toMatch(/8[.,]90/)
    expect(modal.textContent).toMatch(/69/)
  })

  it('never offers to buy a second subscription to a paying account', () => {
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: Date.now() + 2_592_000_000 })
    renderPage()
    expect(screen.queryByTestId('account-go-pro')).toBeNull()
  })
})
