import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionButtons } from './ActionButtons'
import { useGameStore } from '../../store/game-store'
import { Action } from '../../types'

describe('ActionButtons', () => {
  beforeEach(() => {
    useGameStore.setState({
      availableActions: [],
      gameState: null,
    })
  })

  it('shows only available actions', () => {
    useGameStore.setState({
      availableActions: [Action.Hit, Action.Stand],
      gameState: { isRoundOver: false, phase: 'playerTurn' } as never,
    })

    render(<ActionButtons />)

    const hitBtn = screen.getByText(/Hit/i)
    const standBtn = screen.getByText(/Stand/i)
    const doubleBtn = screen.getByText(/Double/i)

    expect(hitBtn).not.toBeDisabled()
    expect(standBtn).not.toBeDisabled()
    expect(doubleBtn).toBeDisabled()
  })

  it('shows New Round button when round is over', () => {
    useGameStore.setState({
      availableActions: [],
      gameState: { isRoundOver: true } as never,
    })

    render(<ActionButtons />)
    expect(screen.getByText(/New Round/i)).toBeInTheDocument()
  })
})
