import React, { useEffect } from 'react'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A running Casino Session has to survive a mode change.
 *
 * Its engine, shoe, hands and clock live in refs inside `useGameLoop`. React
 * throws refs away when a component unmounts, so rendering the session with
 * `{currentMode === 'casinoSession' && <CasinoSession />}` meant one click on
 * the wordmark destroyed a session that had been running for half an hour —
 * and `initSession()` dealt a fresh shoe on the way back.
 *
 * The fix is structural, not cosmetic: the session is mounted outside the mode
 * switch and merely hidden. These tests hold that structure in place, because
 * the obvious "tidy-up" — moving it back in with the other modes — silently
 * reintroduces the bug.
 */

/** How often the real component would have been constructed. */
let mounts = 0

vi.mock('../components/casino-session/CasinoSession', () => ({
  CasinoSession: ({ backgrounded }: { backgrounded?: boolean }) => {
    useEffect(() => { mounts += 1 }, [])
    return <div data-testid="casino-stub" data-backgrounded={String(Boolean(backgrounded))} />
  },
}))

// Everything else in the shell is irrelevant here and expensive to render.
// The home screen is stubbed as well: the training plan inside it settles
// asynchronously and floods this file with act() warnings that have nothing to
// do with what it checks — and a test whose output is noise stops being read.
vi.mock('recharts', () => ({}))
vi.mock('../hooks/use-learner-sync', () => ({ useLearnerSync: () => {} }))
vi.mock('../components/navigation/HomeScreen', () => ({ HomeScreen: () => <div data-testid="home-stub" /> }))
vi.mock('../components/learn/LearnPage', () => ({ LearnPage: () => <div data-testid="learn-stub" /> }))
vi.mock('framer-motion', () => {
  const motion = new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
        const { initial, animate, exit, transition, whileHover, whileTap, layout, variants, ...rest } = props
        void initial; void animate; void exit; void transition; void whileHover; void whileTap; void layout; void variants
        return React.createElement(tag, rest, children)
      },
  })
  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => true,
  }
})

import { TrainerApp } from './TrainerApp'
import { useAppStore } from '../store/app-store'
import { useLiveSessionStore } from '../store/live-session-store'

const show = () => render(<MemoryRouter><TrainerApp /></MemoryRouter>)
const mount = () => screen.queryByTestId('casino-session-mount')

beforeEach(() => {
  mounts = 0
  useAppStore.setState({ currentMode: 'casinoSession' })
  useLiveSessionStore.setState({ activeMode: 'casinoSession', pending: null })
})

afterEach(cleanup)

describe('a running session and a mode change', () => {
  it('keeps the same instance alive instead of building a new one', () => {
    show()
    expect(mounts).toBe(1)

    act(() => { useAppStore.setState({ currentMode: 'home' }) })

    // The decisive assertion. A remount here means a new engine and a new shoe,
    // which is the bug this whole structure exists to prevent.
    expect(mounts).toBe(1)
    expect(screen.getByTestId('casino-stub')).toBeInTheDocument()
  })

  it('hides it rather than removing it', () => {
    show()
    act(() => { useAppStore.setState({ currentMode: 'home' }) })

    expect(mount()).toBeInTheDocument()
    expect(mount()).toHaveClass('hidden')
    expect(mount()).toHaveAttribute('aria-hidden', 'true')
  })

  it('tells the session it is off screen, so its clock stops', () => {
    // Left running, a time-limited session could expire while the player reads
    // another page — and the elapsed time on the summary would be a fiction.
    show()
    act(() => { useAppStore.setState({ currentMode: 'learn' }) })

    expect(screen.getByTestId('casino-stub')).toHaveAttribute('data-backgrounded', 'true')
  })

  it('shows it again on return, still without rebuilding it', () => {
    show()
    act(() => { useAppStore.setState({ currentMode: 'home' }) })
    act(() => { useAppStore.setState({ currentMode: 'casinoSession' }) })

    expect(mounts).toBe(1)
    expect(mount()).not.toHaveClass('hidden')
    expect(screen.getByTestId('casino-stub')).toHaveAttribute('data-backgrounded', 'false')
  })
})

describe('when there is no session', () => {
  it('does not keep an empty one mounted', () => {
    useLiveSessionStore.setState({ activeMode: null, pending: null })
    useAppStore.setState({ currentMode: 'home' })
    show()

    expect(mount()).toBeNull()
    expect(mounts).toBe(0)
  })

  it('still mounts it when the mode is opened', () => {
    useLiveSessionStore.setState({ activeMode: null, pending: null })
    show()
    expect(mount()).toBeInTheDocument()
  })
})
