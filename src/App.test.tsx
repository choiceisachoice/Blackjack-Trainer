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
    useAppStore.setState({ currentMode: 'deviationTraining' })
    render(<App />)
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })
})
