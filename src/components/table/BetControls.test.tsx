import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { BetControls } from './BetControls'
import { useGameStore } from '../../store/game-store'

describe('BetControls', () => {
  beforeEach(() => {
    useGameStore.setState({
      currentBet: 0,
      balance: 10000,
    })
  })

  it('disables Deal when bet is 0', () => {
    render(<BetControls />)
    const dealBtn = screen.getByText(/Deal/i)
    expect(dealBtn.closest('button')).toBeDisabled()
  })

  it('enables Deal when bet is placed', () => {
    useGameStore.setState({ currentBet: 100, balance: 9900 })

    render(<BetControls />)
    const dealBtn = screen.getByText(/Deal/i)
    expect(dealBtn.closest('button')).not.toBeDisabled()
  })
})
