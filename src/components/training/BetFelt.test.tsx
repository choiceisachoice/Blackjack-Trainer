import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BetFelt, type BetFeltProps } from './BetFelt'
import type { BetQuestion } from './bet-model'

const RC_Q: BetQuestion = { type: 'C', tableMin: 25, rc: 6, remainingDecks: 2, shoeDecks: 2, tc: 3, correctBet: 100 }
const TC_Q: BetQuestion = { type: 'B', tableMin: 15, rc: 0, remainingDecks: 1, shoeDecks: 3, tc: 2, correctBet: 30 }

function props(over: Partial<BetFeltProps> = {}): BetFeltProps {
  return {
    question: RC_Q, bet: 0, placed: [],
    onChip: vi.fn(), onUndo: vi.fn(), onClear: vi.fn(), onPlace: vi.fn(),
    tcAnswer: 0, onTcAnswer: vi.fn(), answer: null, onNext: vi.fn(), last: false,
    ...over,
  }
}

describe('BetFelt — the open question', () => {
  it('shows what the question gives, the table minimum and the shoe', () => {
    render(<BetFelt {...props()} />)
    expect(screen.getByTestId('running-count')).toHaveTextContent('+6')
    expect(screen.getByTestId('remaining-decks')).toHaveTextContent('~2')
    expect(screen.queryByTestId('true-count')).toBeNull()
    expect(screen.getByTestId('table-min')).toHaveTextContent('$25')
    expect(screen.getByTestId('discard-stack')).toBeInTheDocument()
    expect(screen.getByTestId('bet-felt')).toBeInTheDocument()
  })

  it('asks for the true count on a type-C question, and only there', () => {
    const onTc = vi.fn()
    const { rerender } = render(<BetFelt {...props({ onTcAnswer: onTc })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Increase true count' }))
    expect(onTc).toHaveBeenCalledWith(0.5)
    rerender(<BetFelt {...props({ question: TC_Q })} />)
    expect(screen.queryByTestId('tc-input')).toBeNull()
    expect(screen.getByTestId('true-count')).toHaveTextContent('+2')
  })

  it('hands chips, undo, clear and the bet to its owner', () => {
    const p = props({ bet: 125, placed: [100, 25] })
    render(<BetFelt {...p} />)
    fireEvent.click(screen.getByTestId('chip-500'))
    expect(p.onChip).toHaveBeenCalledWith(500)
    fireEvent.click(screen.getByTestId('undo-chip'))
    fireEvent.click(screen.getByTestId('clear-bet'))
    fireEvent.click(screen.getByTestId('place-bet'))
    expect(p.onUndo).toHaveBeenCalled()
    expect(p.onClear).toHaveBeenCalled()
    expect(p.onPlace).toHaveBeenCalled()
    expect(screen.getByTestId('your-bet')).toHaveTextContent('$125')
  })

  it('has nothing to undo or place before a chip is down', () => {
    render(<BetFelt {...props()} />)
    expect(screen.getByTestId('undo-chip')).toBeDisabled()
    expect(screen.getByTestId('clear-bet')).toBeDisabled()
    expect(screen.getByTestId('place-bet')).toBeDisabled()
  })
})

describe('BetFelt — the answer', () => {
  it('a right bet: one circle, the reason, the way on; the felt is outlined green', () => {
    const onNext = vi.fn()
    render(<BetFelt {...props({ answer: { question: RC_Q, bet: 100, tcAnswer: 3, correct: true }, onNext })} />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
    expect(screen.queryByTestId('right-bet')).toBeNull()
    expect(screen.getByTestId('tc-revealed')).toHaveTextContent('+3')
    expect(screen.getByTestId('feedback-explanation')).toHaveTextContent('TC +3: 4 units × $25 = $100')
    expect(screen.queryByTestId('bet-rack')).toBeNull()
    fireEvent.click(screen.getByTestId('next-question'))
    expect(onNext).toHaveBeenCalled()
  })

  it('a wrong bet: the bet and the right one side by side, the miscounted true count worked out', () => {
    render(<BetFelt {...props({ answer: { question: RC_Q, bet: 400, tcAnswer: 2, correct: false } })} />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('your-bet')).toHaveTextContent('$400')
    expect(screen.getByTestId('right-bet')).toHaveTextContent('$100')
    expect(screen.getByTestId('tc-result')).toHaveTextContent('You said +2 · RC +6 ÷ 2 decks = +3')
  })
})
