import React from 'react'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The landing page's checkout button.
 *
 * This is the public front door's money path, and the only one of the three
 * checkout entry points that had no feedback at all: no disabled state while
 * the Edge Function was being called, and a failure that went to the console
 * and nowhere else. A visitor clicked, saw nothing change, and clicked again —
 * which starts a second Stripe Checkout session.
 */

const startCheckout = vi.fn<(plan: string) => Promise<'redirecting' | 'already-subscribed'>>()
const setPendingCheckout = vi.fn()

vi.mock('../services/supabase/billing', () => ({
  startCheckout: (plan: string) => startCheckout(plan),
  setPendingCheckout: (plan: string) => setPendingCheckout(plan),
}))

const navigate = vi.fn<(to: string) => void>()
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

// Three.js behind a lazy import — irrelevant here and enormous.
vi.mock('../components/landing/HeroCanvas', () => ({ HeroCanvas: () => null }))

// A passthrough for every `motion.*` tag, matching App.test.tsx: listing them
// by hand means a component reaching for an unlisted one fails with an
// unrelated-looking render error.
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) => {
    const {
      initial, animate, exit, transition, onAnimationComplete,
      whileInView, viewport, whileHover, whileTap, layout, layoutId, variants,
      ...rest
    } = props
    return rest
  }
  const motion = new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(props), children),
  })
  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
  }
})

import { LandingPage } from './LandingPage'
import { useEntitlementStore } from '../store/entitlement-store'

/** Supabase is unconfigured under test, so the page treats the visitor as signed in. */
function renderPage() {
  return render(<MemoryRouter><LandingPage /></MemoryRouter>)
}

const goPro = () => screen.getByRole('button', { name: /go pro/i })

/**
 * The landing page is a large tree — hero, three sections, pricing, FAQ — and
 * under full-suite CPU load a render plus a state flush can take well past the
 * one-second default. Same reasoning as `App.test.tsx`, and the same fix: this
 * is slow, not broken, and a timeout that assumes otherwise is a test that
 * fails for a reason unrelated to what it is checking.
 */
const T = { timeout: 5000 }

beforeEach(() => {
  cleanup()
  startCheckout.mockReset()
  setPendingCheckout.mockReset()
  navigate.mockReset()
  useEntitlementStore.setState({ status: 'free', currentPeriodEnd: null, loaded: true })
})

describe('the landing page checkout', () => {
  it('cannot be fired twice while the first attempt is still in flight', async () => {
    // The consequence of getting this wrong is not cosmetic: two clicks create
    // two Stripe Checkout sessions.
    let release: (outcome: 'redirecting') => void = () => {}
    startCheckout.mockImplementation(() => new Promise<'redirecting'>(resolve => { release = resolve }))

    renderPage()

    fireEvent.click(goPro())
    await waitFor(() => expect(goPro()).toBeDisabled(), T)

    fireEvent.click(goPro())
    expect(startCheckout).toHaveBeenCalledTimes(1)

    release('redirecting')
  })

  it('tells the visitor when checkout could not be started', async () => {
    // It used to `console.error` and nothing else, so a failed checkout was
    // indistinguishable from a button that does not work.
    startCheckout.mockRejectedValue(new Error('Billing is temporarily unavailable.'))

    renderPage()
    fireEvent.click(goPro())

    const alert = await screen.findByRole('alert', {}, T)
    expect(alert).toHaveTextContent('Billing is temporarily unavailable.')
  })

  it('re-enables the button after a failure so the visitor can retry', async () => {
    startCheckout.mockRejectedValue(new Error('nope'))

    renderPage()
    fireEvent.click(goPro())

    await screen.findByRole('alert', {}, T)
    expect(goPro()).toBeEnabled()
  })

  it('clears a previous error when a retry begins', async () => {
    startCheckout.mockRejectedValueOnce(new Error('first failure'))
    renderPage()

    fireEvent.click(goPro())
    await screen.findByRole('alert', {}, T)

    // The retry hangs, so the only thing that can remove the message is the
    // click itself clearing it.
    startCheckout.mockImplementation(() => new Promise<'redirecting'>(() => {}))
    fireEvent.click(goPro())

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), T)
  })
})

describe('the price shown on the public page', () => {
  it('states that it is the final amount, VAT included', () => {
    // Swiss consumer price rules want an all-in figure, and a visitor who reads
    // one number on the page and meets a larger one at checkout does not come
    // back. The note is part of the price, not decoration.
    renderPage()
    expect(screen.getByTestId('pricing-vat-note')).toHaveTextContent(/final price/i)
    expect(screen.getByTestId('pricing-vat-note')).toHaveTextContent(/8\.1%/)
    expect(screen.getByTestId('pricing-vat-note')).toHaveTextContent(/Switzerland/i)
  })

  it('keeps the note when the visitor switches to monthly', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^Monthly$/i }))
    expect(screen.getByTestId('pricing-vat-note')).toBeInTheDocument()
  })
})

/**
 * Selling the same person a second subscription.
 *
 * The landing page stays reachable after someone subscribes — it is the site's
 * front door, and a paying customer lands on it whenever they type the domain.
 * Clicking the price there used to start checkout again: two subscriptions on
 * one Stripe customer, two charges, and an app that looked entirely normal
 * because the webhook writes both into the same profile row. The customer finds
 * out on their card statement.
 */
describe('a visitor who already subscribes', () => {
  it('is sent to their account instead of into checkout', async () => {
    useEntitlementStore.setState({ status: 'active', currentPeriodEnd: null, loaded: true })

    renderPage()
    fireEvent.click(goPro())

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/account'), T)
    expect(startCheckout).not.toHaveBeenCalled()
  })

  it('is still protected when the page thinks they are on the free plan', async () => {
    // The entitlement can be stale, or simply never loaded — this is the page a
    // signed-out visitor sees first. The client guard therefore cannot be the
    // one that protects the customer; the Edge Function asks Stripe and refuses.
    // What this page owes the user is to act on that answer rather than leave
    // them looking at a button that did nothing.
    startCheckout.mockResolvedValue('already-subscribed')

    renderPage()
    fireEvent.click(goPro())

    await waitFor(() => expect(startCheckout).toHaveBeenCalledTimes(1), T)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/account'), T)
  })

  it('treats past_due as subscribed rather than as a chance to sell again', async () => {
    // A failed renewal is a subscription in trouble, not an absent one. Selling
    // a second one here would bill someone whose first payment just bounced.
    useEntitlementStore.setState({ status: 'past_due', currentPeriodEnd: null, loaded: true })

    renderPage()
    fireEvent.click(goPro())

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/account'), T)
    expect(startCheckout).not.toHaveBeenCalled()
  })
})
