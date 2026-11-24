import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BetHistory, BetKeys, BetRamp, BetSpot } from './BetPanel'
import type { BetAnswer, BetQuestion } from './bet-model'

const RC_Q: BetQuestion = { type: 'A', tableMin: 25, rc: 6, remainingDecks: 2, shoeDecks: 2, tc: 3, correctBet: 100 }
const TC_Q: BetQuestion = { type: 'B', tableMin: 10, rc: 0, remainingDecks: 1, shoeDecks: 3, tc: 4, correctBet: 80 }

describe('BetSpot', () => {
  it('says the spot as the question gives it, and the table', () => {
    const { rerender } = render(<BetSpot question={RC_Q} />)
    expect(screen.getByTestId('bet-spot')).toHaveTextContent('RC +6 · 2 decks')
    expect(screen.getByTestId('bet-spot')).toHaveTextContent('$25')
    rerender(<BetSpot question={TC_Q} />)
    expect(screen.getByTestId('bet-spot')).toHaveTextContent('True Count +4')
  })
})

describe('BetRamp', () => {
  it('is blank while the question is open — it never prints the answer', () => {
    render(<BetRamp question={RC_Q} placed={null} />)
    const ramp = screen.getByTestId('bet-ramp')
    expect(ramp.getAttribute('data-revealed')).toBe('false')
    expect(ramp.textContent).not.toContain('4×')
    expect(ramp.textContent).not.toContain('$100')
    // The true count is the learner's to work out: no column is marked.
    expect(ramp.textContent).not.toContain('?')
  })

  it('marks the column with a question mark when the true count is given', () => {
    render(<BetRamp question={TC_Q} placed={null} />)
    expect(screen.getByTestId('bet-ramp').textContent).toContain('?')
  })

  it('placed, fills in, lights the right step and rings a wrong one', () => {
    render(<BetRamp question={RC_Q} placed={400} />)
    const ramp = screen.getByTestId('bet-ramp')
    expect(ramp.querySelector('[data-lit="true"]')?.textContent).toBe('4×$100')
    expect(ramp.querySelector('[data-chosen="true"]')?.textContent).toBe('16×$400')
  })

  it('placed right, rings nothing', () => {
    render(<BetRamp question={RC_Q} placed={100} />)
    expect(screen.getByTestId('bet-ramp').querySelector('[data-chosen="true"]')).toBeNull()
  })
})

describe('BetHistory', () => {
  it('says where the answers will appear before the first one', () => {
    render(<BetHistory answers={[]} />)
    expect(screen.getByTestId('bet-history')).toHaveTextContent('Your answers appear here')
  })

  it('lists bets newest first, a wrong one struck through beside the right one', () => {
    const answers: BetAnswer[] = [
      { question: RC_Q, bet: 100, tcAnswer: null, correct: true },
      { question: TC_Q, bet: 160, tcAnswer: null, correct: false },
    ]
    render(<BetHistory answers={answers} />)
    const rows = screen.getByTestId('bet-history').querySelectorAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('TC +4 · $10 table')
    expect(rows[0].querySelector('s')?.textContent).toBe('$160')
    expect(rows[1].querySelector('s')).toBeNull()
  })

  it('strikes the true count when the bet was right but the count was not', () => {
    render(<BetHistory answers={[{ question: { ...RC_Q, type: 'C' }, bet: 100, tcAnswer: 2, correct: false }]} />)
    expect(screen.getByTestId('bet-history').querySelector('s')?.textContent).toBe('TC +2')
  })
})

describe('BetKeys', () => {
  it('names the keys', () => {
    render(<BetKeys />)
    expect(screen.getByTestId('bet-keys')).toHaveTextContent('1–5 chips')
  })
})
