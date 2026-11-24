import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BetSpread } from './BetSpread'
import { getMultiplier, getCorrectBet, buildBracketSequence } from './bet-spread-math'

/** Expected 1–16 bet multiplier for a given TC (mirrors the component). */
function expectedMultiplier(tc: number): number {
  const t = Math.floor(tc)
  // The ramp the Learn chapter teaches: one unit until the edge exists.
  if (t <= 1) return 1
  if (t === 2) return 2
  if (t === 3) return 4
  if (t === 4) return 8
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
    // +1 is about even: no raise yet. It was two units until 15 Nov 2026,
    // against what the Learn chapter teaches.
    expect(getMultiplier(1)).toBe(1)
    expect(getMultiplier(2)).toBe(2)
    expect(getMultiplier(3)).toBe(4)
    expect(getMultiplier(4)).toBe(8)
    expect(getMultiplier(5)).toBe(16)
    expect(getMultiplier(9)).toBe(16)
  })

  it('getCorrectBet scales the multiplier by the table minimum', () => {
    expect(getCorrectBet(0, 25)).toBe(25)   // 1× $25
    expect(getCorrectBet(3, 25)).toBe(100)  // 4× $25
    expect(getCorrectBet(5, 100)).toBe(1600) // 16× $100
  })

  it('buildBracketSequence never repeats adjacent and covers evenly', () => {
    for (let run = 0; run < 25; run++) {
      const seq = buildBracketSequence(20)
      expect(seq).toHaveLength(20)
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).not.toBe(seq[i - 1]) // no two identical questions in a row
      }
      // Every one of the five bet levels appears (good coverage)
      expect(new Set(seq).size).toBe(5)
    }
  })
})

describe('BetSpread — UI', () => {
  it('renders settings screen with the new controls', () => {
    render(<BetSpread />)
    expect(screen.getByText('Bet Spread')).toBeInTheDocument()
    expect(screen.getByText('Bet Spread Reference')).toBeInTheDocument()
    expect(screen.getByText('Random')).toBeInTheDocument()
    expect(screen.getByText('Bet from RC')).toBeInTheDocument()
    expect(screen.getByText('Bet from TC')).toBeInTheDocument()
    expect(screen.getByText('TC + bet')).toBeInTheDocument()
    // New: number-of-questions selector
    expect(screen.getByRole('group', { name: 'Number of questions' })).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('"Bet from TC" shows the True Count, table minimum and a full bet ramp', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from TC'))
    fireEvent.click(screen.getByTestId('start-training'))

    expect(screen.getByTestId('true-count')).toBeInTheDocument()
    expect(screen.getByTestId('table-min')).toBeInTheDocument()
    expect(screen.queryByTestId('running-count')).not.toBeInTheDocument()

    const tableMin = num('table-min')
    // All five ramp options are present and scale by the table minimum
    for (const m of [1, 2, 4, 8, 16]) {
      expect(screen.getByTestId(`bet-${m * tableMin}`)).toBeInTheDocument()
    }
  })

  it('"Bet from RC" shows RC and remaining decks but not the TC', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from RC'))
    fireEvent.click(screen.getByTestId('start-training'))

    expect(screen.getByTestId('running-count')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-decks')).toBeInTheDocument()
    expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
  })

  it('picking the correct bet shows Correct', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from TC'))
    fireEvent.click(screen.getByTestId('start-training'))

    const tc = num('true-count')
    const tableMin = num('table-min')
    const correctBet = expectedMultiplier(tc) * tableMin

    fireEvent.click(screen.getByTestId(`bet-${correctBet}`))
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
  })

  it('picking a wrong bet shows Wrong with an explanation', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from TC'))
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
    fireEvent.click(screen.getByText('Bet from TC'))
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

/**
 * `data-drill-run` is what tells the back bar to give up its row on a phone
 * held sideways (see `BackToMenu`). It has to be there for the whole run and
 * must not be there on the setup screen, which keeps the arrow home.
 */
describe('BetSpread — marks a running drill for the sideways-phone layout', () => {
  it('is unmarked on the setup screen and marked on question and feedback', () => {
    const { container } = render(<BetSpread />)
    expect(container.querySelector('[data-drill-run]')).toBeNull()

    fireEvent.click(screen.getByTestId('start-training'))
    expect(container.querySelector('[data-drill-run]')).not.toBeNull()

    fireEvent.click(container.querySelector('button[data-testid^="bet-"]')!)
    expect(screen.getByTestId('next-question')).toBeInTheDocument()
    expect(container.querySelector('[data-drill-run]')).not.toBeNull()
  })
})

/**
 * The setup screen is taller than a short laptop window (683px of panel in a
 * 595px box at 2000×720), and the app shell does not scroll for this mode. It
 * was centred inside `overflow-hidden`, so the title went under the back bar
 * and the start button 19px off the screen, unreachable. jsdom has no layout:
 * what is pinned is the structure that makes it reachable.
 */
describe('BetSpread — the setup screen can always reach its start button', () => {
  it('puts the panel in its own scrolling box inside a frame that may shrink', () => {
    render(<BetSpread />)
    const scroller = screen.getByTestId('bet-settings-scroller')
    expect(scroller.className).toMatch(/\boverflow-y-auto\b/)
    expect(scroller.className).toMatch(/\bmin-h-0\b/)
    // The frame around it must be allowed to be shorter than its content, or
    // the scroller never gets a height to scroll within.
    expect(scroller.parentElement!.className).toMatch(/\bmin-h-0\b/)
    // Centred with auto margins, not `justify-center`, which overflows at
    // both ends and leaves the top out of reach.
    expect(scroller.className).not.toMatch(/\bjustify-center\b/)
    expect(scroller.contains(screen.getByTestId('start-training'))).toBe(true)
    expect(scroller.contains(screen.getByText('Bet Spread Reference'))).toBe(true)
  })
})
