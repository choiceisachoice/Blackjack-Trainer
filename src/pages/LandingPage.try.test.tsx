import React from 'react'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

vi.mock('../services/sound-engine', () => ({
  soundEngine: new Proxy({}, { get: () => () => {} }),
}))

import { LandingPage } from './LandingPage'
import { guestRoundSince } from '../services/guest-trial'

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

const renderPage = () => render(
  <MemoryRouter>
    <LandingPage />
    <Where />
  </MemoryRouter>,
)

const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>()

beforeEach(() => {
  auth.status = 'signedOut'
  localStorage.clear()
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(cleanup)

describe('the landing hero, for a visitor without an account', () => {
  it('offers a round of the trainer next to the sign-up, and nothing third', () => {
    renderPage()
    const tryLink = screen.getByTestId('hero-try')
    // Until 22 Nov 2026 this was a link to `/try`. The round is on this page
    // now; the link points at its section, so it works before any script.
    expect(tryLink).toHaveAttribute('href', '#play')
    expect(document.getElementById('play')).toBe(screen.getByTestId('play-section'))
    expect(tryLink).toHaveTextContent('Try a round — no account')
    // Two actions in the hero: the primary one and this.
    const actions = tryLink.parentElement!
    expect(actions.querySelectorAll('a, button')).toHaveLength(2)
    expect(actions.querySelector('button')).toHaveTextContent('Start free')
  })

  it('starts the round on this page: the section comes up, the first hand is dealt, nobody is sent anywhere', async () => {
    renderPage()
    expect(screen.queryByTestId('question-progress')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('hero-try'))
    const progress = await screen.findByTestId('question-progress')
    expect(progress).toHaveTextContent('Question 1/10')
    expect(screen.getByTestId('play-stage')).toContainElement(progress)
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
    expect(screen.getByTestId('play-stage')).toHaveFocus()
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/)
    expect(guestRoundSince()).not.toBeNull()
  })

  it('puts the round directly under the hero, under a heading of its own, and keeps one h1', () => {
    renderPage()
    const section = screen.getByTestId('play-section')
    expect(section.previousElementSibling).toBe(document.querySelector('h1')?.closest('section'))
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Play a round of blackjack basic strategy')
    expect(within(section).getByTestId('try-start')).toBeInTheDocument()
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('does not send the visitor to the separate trial page from anywhere', () => {
    // The old assertion was "exactly one link to /try" (the hero's). The
    // round is here; a link away from it would be a second way to the same thing.
    renderPage()
    expect(document.querySelectorAll('a[href="/try"]')).toHaveLength(0)
  })
})

describe('the landing, signed in', () => {
  it('has no trial to offer — no button, no section — and keeps the way to the prices', () => {
    auth.status = 'signedIn'
    renderPage()
    expect(screen.queryByTestId('hero-try')).not.toBeInTheDocument()
    expect(screen.queryByTestId('play-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('try-start')).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/try"]')).toBeNull()
    expect(screen.getByText('See what Pro unlocks')).toHaveAttribute('href', '#pricing')
    // And nobody is redirected: this is still the landing.
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/)
  })

  it('takes a round off the screen when the session turns out to be signed in, without filing it', async () => {
    const view = renderPage()
    fireEvent.click(screen.getByTestId('hero-try'))
    await screen.findByTestId('question-progress')
    auth.status = 'signedIn'
    view.rerender(<MemoryRouter><LandingPage /><Where /></MemoryRouter>)
    expect(screen.queryByTestId('play-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('question-progress')).not.toBeInTheDocument()
  })
})
