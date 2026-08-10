import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Billing failures on `/account` have to be said out loud.
 *
 * `openBillingPortal` and `startCheckout` both call an Edge Function and only
 * then redirect. On failure the page reset `busy` and wrote to `console.error`
 * — so the button spun, stopped, and the page looked exactly as before. Someone
 * trying to *cancel* a subscription is then told nothing, which turns a billing
 * problem into a support ticket or a chargeback.
 */

const signOutAndClearLocal = vi.fn<() => Promise<void>>()
vi.mock('../services/supabase/cloud-sync', () => ({
  signOutAndClearLocal: () => signOutAndClearLocal(),
}))

const openBillingPortal = vi.fn<() => Promise<void>>()
const startCheckout = vi.fn<(plan: string) => Promise<'redirecting' | 'already-subscribed'>>()

vi.mock('../services/supabase/billing', () => ({
  openBillingPortal: () => openBillingPortal(),
  startCheckout: (plan: string) => startCheckout(plan),
}))

import { AccountPage } from './AccountPage'
import { useEntitlementStore } from '../store/entitlement-store'

/** Supabase is unconfigured under test, so everything is unlocked and the
 *  Pro "Manage subscription" path is the one on screen. */
const renderPage = () => render(<MemoryRouter><AccountPage /></MemoryRouter>)
const manageButton = () => screen.getByRole('button', { name: /Manage subscription/i })

const T = { timeout: 5000 }

beforeEach(() => {
  cleanup()
  openBillingPortal.mockReset()
  startCheckout.mockReset()
  signOutAndClearLocal.mockReset()
  signOutAndClearLocal.mockResolvedValue(undefined)
  useEntitlementStore.setState({
    status: 'free',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    loaded: true,
  })
})

describe('AccountPage', () => {
  it('renders the plan and sign-out (no backend → treated as Pro)', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByText(/Sign out/i)).toBeInTheDocument()
    expect(screen.getByText(/Manage subscription/i)).toBeInTheDocument()
  })
})

describe('when the billing portal will not open', () => {
  it('says so instead of silently returning to normal', async () => {
    openBillingPortal.mockRejectedValue(new Error('Billing is temporarily unavailable.'))
    renderPage()

    fireEvent.click(manageButton())

    const alert = await screen.findByRole('alert', {}, T)
    expect(alert).toHaveTextContent('Billing is temporarily unavailable.')
  })

  it('re-enables the button so the attempt can be repeated', async () => {
    openBillingPortal.mockRejectedValue(new Error('nope'))
    renderPage()

    fireEvent.click(manageButton())
    await screen.findByRole('alert', {}, T)

    expect(manageButton()).toBeEnabled()
  })

  it('clears the previous message when a retry begins', async () => {
    openBillingPortal.mockRejectedValueOnce(new Error('first failure'))
    renderPage()

    fireEvent.click(manageButton())
    await screen.findByRole('alert', {}, T)

    // The retry hangs, so only the click itself can remove the message.
    openBillingPortal.mockImplementation(() => new Promise<void>(() => {}))
    fireEvent.click(manageButton())

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), T)
  })

  it('does not offer a second attempt while the first is still in flight', async () => {
    // Two portal sessions is not as costly as two checkouts, but a button that
    // looks pressable while it is working is the same lie either way.
    openBillingPortal.mockImplementation(() => new Promise<void>(() => {}))
    renderPage()

    fireEvent.click(manageButton())
    await waitFor(() => expect(manageButton()).toBeDisabled(), T)

    fireEvent.click(manageButton())
    expect(openBillingPortal).toHaveBeenCalledTimes(1)
  })
})

describe('signing out from the account page', () => {
  it('goes through the same wipe the nav bar uses', async () => {
    // It used to call the auth store's bare `signOut`, which revokes the session
    // and leaves every local cache behind for the next account to inherit.
    renderPage()
    fireEvent.click(screen.getByTestId('account-sign-out'))
    await waitFor(() => expect(signOutAndClearLocal).toHaveBeenCalledOnce(), T)
  })

  it('cannot be fired twice', async () => {
    signOutAndClearLocal.mockImplementation(() => new Promise<void>(() => {}))
    renderPage()

    fireEvent.click(screen.getByTestId('account-sign-out'))
    await waitFor(() => expect(screen.getByTestId('account-sign-out')).toBeDisabled(), T)

    fireEvent.click(screen.getByTestId('account-sign-out'))
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
  })
})

/**
 * Telling someone their cancellation worked.
 *
 * The Stripe portal cancels at period end — correct, the customer paid for the
 * period and keeps it. Stripe expresses that by leaving `status` as `active`
 * and setting `cancel_at_period_end`. The page read only the status, so after
 * cancelling it went on saying "Pro — active … Renews on <date>".
 *
 * The access was right and the sentence was a lie, which is the worse half:
 * someone who cancels and is then promised a renewal concludes it did not work,
 * and the next thing they contact is their bank.
 */
describe('a subscription that has been cancelled', () => {
  const IN_A_MONTH = new Date('2026-09-10T12:00:00Z').getTime()

  it('is not described as active', () => {
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: true })
    renderPage()

    expect(screen.getByText('Pro — cancelled')).toBeInTheDocument()
    expect(screen.queryByText('Pro — active')).toBeNull()
  })

  it('says when access ends instead of promising a renewal', () => {
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: true })
    renderPage()

    expect(screen.getByText(/Access ends on/i)).toBeInTheDocument()
    expect(screen.queryByText(/Renews on/i)).toBeNull()
  })

  it('still promises a renewal while the subscription really is renewing', () => {
    // The counter-case. Without it, a change that always shows "Access ends on"
    // would pass every test above and be just as wrong in the other direction.
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: false })
    renderPage()

    expect(screen.getByText(/Renews on/i)).toBeInTheDocument()
    expect(screen.queryByText(/Access ends on/i)).toBeNull()
    expect(screen.getByText('Pro — active')).toBeInTheDocument()
  })

  it('reports a failed payment ahead of a scheduled ending', () => {
    // Both can be true at once. One needs the customer to act today; the other
    // is already settled and merely running out.
    useEntitlementStore.setState({ status: 'past_due', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: true })
    renderPage()

    expect(screen.getByText('Pro — payment due')).toBeInTheDocument()
    expect(screen.getByText(/Payment due by/i)).toBeInTheDocument()
  })

  it('warns that the Pro modes close, including a paused session', () => {
    // A paused Casino Session is kept alive in the browser, which makes it easy
    // to assume it survives the subscription. It does not: the mode goes behind
    // the paywall on the end date with whatever is in it.
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: true })
    renderPage()

    const notice = screen.getByTestId('pro-ends-notice')
    expect(notice).toHaveTextContent(/casino table/i)
    expect(notice).toHaveTextContent(/paused/i)
  })

  it('says nothing of the sort while the subscription is renewing', () => {
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: false })
    renderPage()
    expect(screen.queryByTestId('pro-ends-notice')).toBeNull()
  })

  it('keeps the portal reachable so the cancellation can be undone', () => {
    // Stripe lets a customer resume a subscription cancelled at period end. If
    // this page hid the button once cancelled, changing your mind would need an
    // email to support.
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: IN_A_MONTH, cancelAtPeriodEnd: true })
    renderPage()

    expect(manageButton()).toBeEnabled()
  })
})
