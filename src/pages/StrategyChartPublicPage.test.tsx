import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StrategyChartPublicPage } from './StrategyChartPublicPage'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
}))

afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><StrategyChartPublicPage /></MemoryRouter>)

describe('StrategyChartPublicPage', () => {
  it('shows the chart without a login, with its own head', () => {
    renderPage()
    expect(screen.getByTestId('strategy-chart-public')).toBeInTheDocument()
    // The chart's rows: hard totals down to soft hands and pairs.
    expect(document.body.textContent).toMatch(/16/)
    expect(document.body.textContent).toMatch(/A,8|A-8|A8/)
    expect(document.title).toMatch(/strategy chart/i)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://black-jack-training.com/strategy-chart')
  })

  it('links to the chapters that explain it', () => {
    renderPage()
    expect(screen.getByTestId('chart-to-basic')).toHaveAttribute('href', '/learn/basic-strategy')
    expect(screen.getByTestId('chart-to-deviations')).toHaveAttribute('href', '/learn/illustrious-18-fab-4')
  })

  it('keeps the way in and the way home of every public page', () => {
    renderPage()
    expect(screen.getByTestId('learn-start')).toHaveAttribute('href', '/login')
    expect(screen.getByTestId('learn-home')).toHaveAttribute('href', '/')
  })
})
