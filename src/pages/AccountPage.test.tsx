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
const startCheckout = vi.fn<(plan: string) => Promise<void>>()

vi.mock('../services/supabase/billing', () => ({
  openBillingPortal: () => openBillingPortal(),
  startCheckout: (plan: string) => startCheckout(plan),
}))

import { AccountPage } from './AccountPage'

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
