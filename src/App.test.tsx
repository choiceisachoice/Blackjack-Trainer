import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'
import { useAppStore } from './store/app-store'

// Mock framer-motion for DeckEstimation's ShoeVisual
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

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState({ currentMode: 'home' })
  })

  it('renders home screen by default', () => {
    render(<App />)
    expect(screen.getByText('Blackjack Card Counting Trainer')).toBeInTheDocument()
  })

  it('renders DeviationTraining for deviationTraining mode', () => {
    useAppStore.setState({ currentMode: 'deviationTraining' })
    render(<App />)
    expect(screen.getByText('Deviation Set')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders BetSpread for betSpread mode', () => {
    useAppStore.setState({ currentMode: 'betSpread' })
    render(<App />)
    expect(screen.getByText('Bet Spread Reference')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('renders DeckEstimation for deckEstimation mode', () => {
    useAppStore.setState({ currentMode: 'deckEstimation' })
    render(<App />)
    expect(screen.getByText('Decks in Shoe')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('all 5 training modes are routed (no Coming Soon)', () => {
    const modes = ['speedDrill', 'tableCounting', 'deviationTraining', 'betSpread', 'deckEstimation'] as const
    for (const mode of modes) {
      useAppStore.setState({ currentMode: mode })
      const { unmount } = render(<App />)
      // No mode should show "Coming soon" anymore
      expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
      unmount()
    }
  })
})
