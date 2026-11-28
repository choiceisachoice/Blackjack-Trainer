import React from 'react'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Where the landing's ways in lead a visitor without an account.
 *
 * Until 28 Nov 2026 every "Start free" and the signed-out "Go Pro" opened
 * `/login` on the Sign in tab — a new visitor pressed "Start free" and was
 * asked for a password they did not have. Only the trial summary opened the
 * register side.
 */
const auth = vi.hoisted(() => ({ status: 'signedOut' as string }))
vi.mock('../store/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { status: string }) => unknown) => selector({ status: auth.status }),
    { getState: () => ({ status: auth.status, user: null }), setState: vi.fn(), subscribe: () => () => {} },
  ),
  isSupabaseConfigured: true,
}))
const setPendingCheckout = vi.fn()
vi.mock('../services/supabase/billing', () => ({
  startCheckout: vi.fn(),
  setPendingCheckout: (plan: string) => setPendingCheckout(plan),
}))
const heroCanvas = vi.fn(() => null)
vi.mock('../components/landing/HeroCanvas', () => ({ HeroCanvas: () => heroCanvas() }))
vi.mock('../components/landing/PlaySection', () => ({ PlaySection: () => null, PLAY_SECTION_ID: 'play' }))
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
import { usePlanPriceStore } from '../store/plan-price-store'

/** Stands in for `/login`: shows the mode the link carried. */
function Login() {
  const { state } = useLocation()
  return <div data-testid="login" data-mode={(state as { mode?: string } | null)?.mode ?? 'none'} />
}

const renderPage = () => render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { auth.status = 'signedOut'; setPendingCheckout.mockReset(); heroCanvas.mockClear() })
afterEach(() => {
  cleanup()
  usePlanPriceStore.setState({ status: 'idle', plans: [] })
})

describe('the landing, signed out', () => {
  it('opens the sign-up side from the hero\'s "Start free"', () => {
    renderPage()
    fireEvent.click(within(document.querySelector('h1')!.closest('section')!).getByRole('button', { name: /start free/i }))
    expect(screen.getByTestId('login').dataset.mode).toBe('signup')
  })

  it('opens the sign-up side from the bar\'s "Start free" too', () => {
    renderPage()
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: /start free/i }))
    expect(screen.getByTestId('login').dataset.mode).toBe('signup')
  })

  it('remembers the plan and opens sign-up from "Go Pro"', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /go pro/i }))
    expect(setPendingCheckout).toHaveBeenCalledWith('yearly')
    expect(screen.getByTestId('login').dataset.mode).toBe('signup')
  })

  it('links to the free strategy chart from the page and its footer', () => {
    renderPage()
    expect(screen.getByTestId('strip-strategy-chart')).toHaveAttribute('href', '/strategy-chart')
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: /strategy chart/i })).toHaveAttribute('href', '/strategy-chart')
  })

  it('makes no popularity claim on the Pro card', () => {
    renderPage()
    expect(screen.queryByText(/most popular/i)).toBeNull()
  })

  it('shows the yearly saving: the struck monthly total, labelled, and the amount saved', () => {
    // The owner asked for the struck-through figure back (28 Nov 2026). It
    // may only appear with the words that say what it is — twelve monthly
    // payments, not a former price — and only from real Stripe prices.
    usePlanPriceStore.setState({
      status: 'ready',
      plans: [
        { id: 'monthly', amount: 890, currency: 'chf', interval: 'month' },
        { id: 'yearly', amount: 6900, currency: 'chf', interval: 'year' },
      ],
    } as never)
    renderPage()
    const struck = screen.getByTestId('pricing-struck')
    expect(struck.textContent).toMatch(/106[.,']80/)
    expect(struck).toHaveClass('line-through')
    expect(screen.getByTestId('pricing-compare').textContent).toMatch(/if paid monthly/i)
    expect(screen.getByTestId('pricing-saving').textContent).toMatch(/you save .*37[.,']80/i)
  })

  it('shows no struck figure without real prices', () => {
    usePlanPriceStore.setState({ status: 'error', plans: [] })
    renderPage()
    expect(document.querySelector('.line-through')).toBeNull()
    expect(screen.queryByTestId('pricing-saving')).toBeNull()
  })

  it('does not load the three.js hero where the screen cannot be read (no matchMedia)', () => {
    renderPage()
    expect(heroCanvas).not.toHaveBeenCalled()
  })
})
