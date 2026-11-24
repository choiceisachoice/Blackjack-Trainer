import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeckAsk, DeckHistory, DeckProgress, DeckStats, DeckVerdict } from './DeckPanel'

describe('DeckProgress', () => {
  it('names the round and draws one segment per round', () => {
    render(<DeckProgress round={3} total={10} results={[true, false]} streak={0} avgError={0.4} />)
    expect(screen.getByText('Round 3/10')).toBeInTheDocument()
    expect(screen.getByTestId('result-trail').children).toHaveLength(10)
  })

  it('carries the accuracy and the mean error on the phone strip', () => {
    render(<DeckProgress round={3} total={10} results={[true, false]} streak={0} avgError={0.4} />)
    expect(screen.getByTestId('deck-progress').textContent).toMatch(/50%.*±0\.4/)
  })
})

describe('DeckAsk', () => {
  it('asks the question, with the clock only in Quick Fire', () => {
    const { rerender } = render(<DeckAsk seconds={null} />)
    expect(screen.getByText('How many decks remain?')).toBeInTheDocument()
    expect(screen.queryByTestId('qf-timer')).not.toBeInTheDocument()
    rerender(<DeckAsk seconds={2} />)
    expect(screen.getByTestId('qf-timer')).toHaveTextContent('2')
  })
})

describe('DeckStats', () => {
  it('shows accuracy, mean error and best streak', () => {
    render(<DeckStats results={[true, true, false, true]} avgError={0.35} bestStreak={2} />)
    expect(screen.getByText('Avg Error')).toBeInTheDocument()
    expect(screen.getByTestId('panel-avg-error')).toHaveTextContent('±0.4')
    expect(screen.getByTestId('deck-stats').textContent).toMatch(/75%/)
  })

  it('shows dashes before the first answer', () => {
    render(<DeckStats results={[]} avgError={null} bestStreak={0} />)
    expect(screen.getByTestId('panel-avg-error')).toHaveTextContent('–')
  })
})

describe('DeckHistory', () => {
  it('lists the answers newest first with the signed difference', () => {
    render(<DeckHistory answers={[
      { actual: 3.6, estimated: 2.5, correct: false },
      { actual: 2.4, estimated: 2.5, correct: true },
    ]} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toMatch(/Actual 2\.4.*You 2\.5.*\+0\.1/)
    expect(rows[1].textContent).toMatch(/Actual 3\.6.*You 2\.5.*−1\.1/)
  })

  it('says where the answers will appear before there are any', () => {
    render(<DeckHistory answers={[]} />)
    expect(screen.getByText('Your answers appear here, newest first.')).toBeInTheDocument()
  })
})

describe('DeckVerdict', () => {
  it('says wrong, what was left, the guess, the gap and the true-count share', () => {
    render(<DeckVerdict actual={3.6} guess={2.5} correct={false} />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('feedback-explanation')).toHaveTextContent('~3.6 decks remaining (you said 2.5)')
    expect(screen.getByTestId('tc-line')).toHaveTextContent('Off by 1.1 decks → Your true counts would read 44% too high (÷ 2.5 instead of ÷ 3.6).')
  })

  it('calls a near answer close enough and the skew too low when the guess is high', () => {
    render(<DeckVerdict actual={2.4} guess={2.5} correct />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Close enough!')
    expect(screen.getByTestId('tc-line')).toHaveTextContent(/too low/)
  })

  it('has no true-count line when the clock ran out', () => {
    render(<DeckVerdict actual={3} guess={null} correct={false} />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Time’s up!')
    expect(screen.queryByTestId('tc-line')).not.toBeInTheDocument()
  })
})
