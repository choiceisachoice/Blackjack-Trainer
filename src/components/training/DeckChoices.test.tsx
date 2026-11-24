import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeckChoices } from './DeckChoices'

const OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]

describe('DeckChoices', () => {
  it('offers every option in order and answers with the one tapped', () => {
    const onAnswer = vi.fn()
    render(<DeckChoices options={OPTIONS} onAnswer={onAnswer} answered={null} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(b => b.textContent)).toEqual(['0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'])
    fireEvent.click(screen.getByTestId('deck-3.5'))
    expect(onAnswer).toHaveBeenCalledWith(3.5)
  })

  it('takes no more answers once answered', () => {
    const onAnswer = vi.fn()
    render(<DeckChoices options={OPTIONS} onAnswer={onAnswer} answered={{ guess: 2.5, actual: 3.6 }} />)
    fireEvent.click(screen.getByTestId('deck-4'))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByTestId('deck-4')).toBeDisabled()
  })

  it('marks the choice and every value that would have counted', () => {
    render(<DeckChoices options={OPTIONS} onAnswer={() => {}} answered={{ guess: 2.5, actual: 3.6 }} />)
    expect(screen.getByTestId('deck-2.5')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('deck-2.5').className).toMatch(/text-error/)
    // 3.5 and 4 lie within half a deck of 3.6; 3 does not.
    expect(screen.getByTestId('deck-3.5').className).toMatch(/border-success/)
    expect(screen.getByTestId('deck-4').className).toMatch(/border-success/)
    expect(screen.getByTestId('deck-3').className).not.toMatch(/success/)
  })

  it('marks a right choice green', () => {
    render(<DeckChoices options={OPTIONS} onAnswer={() => {}} answered={{ guess: 3.5, actual: 3.6 }} />)
    expect(screen.getByTestId('deck-3.5').className).toMatch(/text-success/)
  })
})
