import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App'
import { useAppStore } from './store/app-store'

describe('App', () => {
  beforeEach(() => {
    useAppStore.setState({ currentMode: 'home' })
  })

  it('renders home screen by default', () => {
    render(<App />)
    expect(screen.getByText('Blackjack Card Counting Trainer')).toBeInTheDocument()
  })

  it('renders coming soon for unimplemented modes', () => {
    useAppStore.setState({ currentMode: 'deckEstimation' })
    render(<App />)
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
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
})
