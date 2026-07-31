import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'
import { useAppStore } from './store/app-store'

// App imports the trainer (which imports AnalyticsDashboard / DeckEstimation), so
// their heavy deps need the same mocks even for routing tests.
vi.mock('recharts', () => ({
  LineChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))
// A passthrough for every `motion.*` tag rather than a hand-listed few. Listing
// them means a component that reaches for `motion.span` fails here with an
// unrelated-looking render error, which is how this mock broke when the intro
// sequence was added.
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) => {
    const {
      initial, animate, exit, transition, onAnimationComplete,
      // The landing's scroll reveals add these — keep them off the DOM node.
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
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
  }
})

// The landing lazy-loads the WebGL hero, which pulls in Three.js — a huge module
// graph that makes this routing test slow/flaky. Stub it (routing is what we test).
vi.mock('./components/landing/HeroCanvas', () => ({ HeroCanvas: () => null }))

// Same reasoning as the hero, for the same reason. The loading screen holds a
// requestAnimationFrame loop open for the whole of its ~5.5s run, and these
// tests find their heading *underneath* it anyway — so the sequence is pure
// contention here, three times over, and it is what pushed these two past their
// timeout under full-suite load once the fill was slowed down.
//
// Nothing is lost by stubbing it: that the app is present and reachable behind
// the overlay from the first frame is asserted in `IntroGate.test.tsx`, where it
// is the actual subject rather than a side effect.
vi.mock('./components/common/IntroGate', () => ({
  IntroGate: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

describe('App routing', () => {
  beforeEach(() => {
    useAppStore.setState({ currentMode: 'home' })
  })

  // Routes are lazy-loaded (code-split), so assertions await the chunk. The
  // dynamic import can take a beat under full-suite CPU load, so allow more than
  // the 1s default.
  const T = { timeout: 5000 }

  it('renders the public landing at /', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /beats the shoe/i }, T)).toBeInTheDocument()
  })

  it('renders the trainer at /app (no backend → gate open)', async () => {
    // A placement keeps the shell on the dashboard; without one it opens the
    // training plan, which is covered in TrainerApp's own tests.
    localStorage.setItem('bjt_placement', 'hi-lo')
    renderAt('/app')
    // The home screen is the signed-in dashboard; its headline is the user's
    // level title, so assert a stable landmark instead.
    expect(await screen.findByRole('heading', { name: 'Training Modes' }, T)).toBeInTheDocument()
  })

  it('redirects unknown routes to the landing', async () => {
    renderAt('/does-not-exist')
    expect(await screen.findByRole('heading', { name: /beats the shoe/i }, T)).toBeInTheDocument()
  })
})
