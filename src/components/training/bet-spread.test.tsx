import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BetSpread } from './BetSpread'
import { getMultiplier, getCorrectBet, buildBracketSequence } from './bet-spread-math'

/** Expected 1–16 bet multiplier for a given TC (mirrors the component). */
function expectedMultiplier(tc: number): number {
  const t = Math.floor(tc)
  if (t <= 0) return 1
  if (t === 1) return 2
  if (t === 2) return 4
  if (t === 3) return 8
  if (t === 4) return 12
  return 16
}

/** Reads the numeric value out of a `$123` / `+2` style testid element. */
function num(testId: string): number {
  return parseFloat((screen.getByTestId(testId).textContent ?? '').replace(/[$+]/g, ''))
}

describe('BetSpread — pure helpers', () => {
  it('getMultiplier follows the 1–16 ladder', () => {
    expect(getMultiplier(-1)).toBe(1)
    expect(getMultiplier(0)).toBe(1)
    expect(getMultiplier(1)).toBe(2)
    expect(getMultiplier(2)).toBe(4)
    expect(getMultiplier(3)).toBe(8)
    expect(getMultiplier(4)).toBe(12)
    expect(getMultiplier(5)).toBe(16)
    expect(getMultiplier(9)).toBe(16)
  })

  it('getCorrectBet scales the multiplier by the table minimum', () => {
    expect(getCorrectBet(0, 25)).toBe(25)   // 1× $25
    expect(getCorrectBet(3, 25)).toBe(200)  // 8× $25
    expect(getCorrectBet(5, 100)).toBe(1600) // 16× $100
  })

  it('buildBracketSequence never repeats adjacent and covers evenly', () => {
    for (let run = 0; run < 25; run++) {
      const seq = buildBracketSequence(20)
      expect(seq).toHaveLength(20)
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1]) // no two identical questions in a row
      }
      // Every one of the six bet levels appears (good coverage)
      expect(new Set(seq).size).toBe(6)
    }
  })
})

describe('BetSpread — UI', () => {
  it('renders settings screen with the new controls', () => {
    render(<BetSpread />)
    expect(screen.getByText('Bet Spread')).toBeInTheDocument()
    expect(screen.getByText('Bet Spread Reference')).toBeInTheDocument()
    expect(screen.getByText('Random')).toBeInTheDocument()
    expect(screen.getByText('Type A')).toBeInTheDocument()
    expect(screen.getByText('Type B')).toBeInTheDocument()
    expect(screen.getByText('Type C')).toBeInTheDocument()
    // New: number-of-questions selector
    expect(screen.getByRole('group', { name: 'Number of questions' })).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('Type B shows the True Count, table minimum and a full bet ramp', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    expect(screen.getByTestId('true-count')).toBeInTheDocument()
    expect(screen.getByTestId('table-min')).toBeInTheDocument()
    expect(screen.queryByTestId('running-count')).not.toBeInTheDocument()

    const tableMin = num('table-min')
    // All six ramp options are present and scale by the table minimum
    for (const m of [1, 2, 4, 8, 12, 16]) {
      expect(screen.getByTestId(`bet-${m * tableMin}`)).toBeInTheDocument()
    }
  })

  it('Type A shows RC and remaining decks but not the TC', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type A'))
    fireEvent.click(screen.getByTestId('start-training'))

    expect(screen.getByTestId('running-count')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-decks')).toBeInTheDocument()
    expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
  })

  it('picking the correct bet shows Correct', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    const tc = num('true-count')
    const tableMin = num('table-min')
    const correctBet = expectedMultiplier(tc) * tableMin

    fireEvent.click(screen.getByTestId(`bet-${correctBet}`))
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
  })

  it('picking a wrong bet shows Wrong with an explanation', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    const tc = num('true-count')
    const tableMin = num('table-min')
    const correctBet = expectedMultiplier(tc) * tableMin
    // Choose a definitely-different option
    const wrongBet = correctBet === tableMin * 16 ? tableMin * 1 : tableMin * 16

    fireEvent.click(screen.getByTestId(`bet-${wrongBet}`))
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('feedback-explanation')).toBeInTheDocument()
  })

  it('runs a finite session and ends in a summary', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByText('10')) // shortest session
    fireEvent.click(screen.getByTestId('start-training'))

    for (let i = 0; i < 10; i++) {
      expect(screen.getByTestId('question-progress')).toHaveTextContent(`Question ${i + 1}/10`)
      const tableMin = num('table-min')
      fireEvent.click(screen.getByTestId(`bet-${tableMin}`)) // 1× option always exists
      fireEvent.click(screen.getByTestId('next-question'))
    }

    expect(screen.getByTestId('summary-title')).toBeInTheDocument()
    expect(screen.getByTestId('summary-accuracy')).toBeInTheDocument()
  })
})
