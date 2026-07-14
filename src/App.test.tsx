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
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, onAnimationComplete, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
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
    renderAt('/app')
    expect(
      (await screen.findAllByRole('heading', { name: 'Blackjack Card Counting Trainer' }, T))[0]
    ).toBeInTheDocument()
  })

  it('redirects unknown routes to the landing', async () => {
    renderAt('/does-not-exist')
    expect(await screen.findByRole('heading', { name: /beats the shoe/i }, T)).toBeInTheDocument()
  })
})
