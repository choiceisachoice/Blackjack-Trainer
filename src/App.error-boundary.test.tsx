import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A public route that throws must not leave a blank page.
 *
 * `ErrorBoundary` only ever wrapped the trainer's modes, so a render error on
 * the landing page, `/login`, `/account` or the legal pages unmounted the tree
 * to nothing — a white screen with no way back, on the routes a first-time
 * visitor actually arrives at.
 *
 * Its own file rather than a case in `App.test.tsx`, because `vi.mock` is
 * hoisted to the whole module: a landing page that throws cannot coexist with
 * the tests that expect it to render.
 */

vi.mock('recharts', () => ({
  LineChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Line: () => <div />, XAxis: () => <div />, YAxis: () => <div />,
  Tooltip: () => <div />, Legend: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

vi.mock('framer-motion', () => {
  const motion = new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children }: React.PropsWithChildren) => React.createElement(tag, null, children),
  })
  return {
    motion,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
  }
})

vi.mock('./components/landing/HeroCanvas', () => ({ HeroCanvas: () => null }))

// The loading screen holds a frame loop open for its whole run and would only
// delay what this file is checking. Covered in `IntroGate.test.tsx`.
vi.mock('./components/common/IntroGate', () => ({
  IntroGate: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

vi.mock('./pages/LandingPage', () => ({
  LandingPage: () => { throw new Error('the landing page fell over') },
}))

import App from './App'

describe('a route that throws', () => {
  beforeEach(() => {
    // The boundary logs what it catches; keep the run readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows the recoverable fallback instead of a blank page', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

    expect(await screen.findByText('Something went wrong', {}, { timeout: 5000 }))
      .toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-reset')).toBeInTheDocument()
  })
})
