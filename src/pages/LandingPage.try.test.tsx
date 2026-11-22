import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The hero's second button.
 *
 * The other landing tests run with Supabase unconfigured, where the page
 * treats everyone as signed in. The trial round is for the visitor who is
 * not — so here there are accounts, and the auth store says who is looking.
 */
const auth = vi.hoisted(() => ({ status: 'signedOut' as string }))
vi.mock('../store/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { status: string }) => unknown) => selector({ status: auth.status }),
    { getState: () => ({ status: auth.status, user: null }), setState: vi.fn() },
  ),
  isSupabaseConfigured: true,
}))
vi.mock('../services/supabase/billing', () => ({ startCheckout: vi.fn(), setPendingCheckout: vi.fn() }))
vi.mock('../components/landing/HeroCanvas', () => ({ HeroCanvas: () => null }))
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

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

beforeEach(() => { auth.status = 'signedOut' })
afterEach(cleanup)

describe('the landing hero, for a visitor without an account', () => {
  it('offers a round of the trainer next to the sign-up, and nothing third', () => {
    renderPage()
    const tryLink = screen.getByTestId('hero-try')
    expect(tryLink).toHaveAttribute('href', '/try')
    expect(tryLink).toHaveTextContent('Try a round — no account')
    // Two actions in the hero: the primary one and this.
    const actions = tryLink.parentElement!
    expect(actions.querySelectorAll('a, button')).toHaveLength(2)
    expect(actions.querySelector('button')).toHaveTextContent('Start free')
  })

  it('appears once on the page', () => {
    renderPage()
    expect(document.querySelectorAll('a[href="/try"]')).toHaveLength(1)
  })
})

describe('the landing hero, signed in', () => {
  it('has no trial to offer and keeps the way to the prices', () => {
    auth.status = 'signedIn'
    renderPage()
    expect(screen.queryByTestId('hero-try')).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/try"]')).toBeNull()
    expect(screen.getByText('See what Pro unlocks')).toHaveAttribute('href', '#pricing')
  })
})
