import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { BetSpread } from './BetSpread'
import { useLevelStore } from '../../store/level-store'
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

/**
 * Puts a bet down as a player would at the table: the chips that make it,
 * largest first, then the bet button. Every bet the drill asks for is a sum
 * of the rack's chips.
 */
function placeBet(amount: number) {
  let left = amount
  for (const chip of [1000, 500, 100, 25, 5]) {
    while (left >= chip) {
      fireEvent.click(screen.getByTestId(`chip-${chip}`))
      left -= chip
    }
  }
  expect(left).toBe(0)
  fireEvent.click(screen.getByTestId('place-bet'))
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

  it('"Bet from TC" shows the True Count, table minimum and a rack that can build every ramp bet', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from TC'))
    fireEvent.click(screen.getByTestId('start-training'))

    expect(screen.getByTestId('true-count')).toBeInTheDocument()
    expect(screen.getByTestId('table-min')).toBeInTheDocument()
    expect(screen.queryByTestId('running-count')).not.toBeInTheDocument()

    const tableMin = num('table-min')
    // All five ramp bets can be put down exactly with the rack's chips.
    const chips = [1000, 500, 100, 25, 5]
    for (const c of chips) expect(screen.getByTestId(`chip-${c}`)).toBeInTheDocument()
    for (const m of [1, 2, 4, 8, 16]) {
      let left = m * tableMin
      for (const c of chips) left %= c
      expect(left).toBe(0)
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

    placeBet(correctBet)
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

    placeBet(wrongBet)
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
      placeBet(tableMin) // one unit can always be put down
      fireEvent.click(screen.getByTestId('next-question'))
    }

    // The shared round summary since 24 Nov 2026. This used to look for the
    // old stat boxes (`summary-accuracy`); the accuracy is the summary's score now.
    expect(screen.getByTestId('round-summary')).toBeInTheDocument()
    expect(screen.getByTestId('summary-title')).toBeInTheDocument()
    expect(screen.getByTestId('summary-score')).toHaveTextContent('%')
  })

  it('ends on the round summary: wrong bets with the right ones, XP shown in place, Again starts clean', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from TC'))
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Wrong on the first three, right on the rest.
    const wrongs: { tc: number; tableMin: number; bet: number; right: number }[] = []
    for (let i = 0; i < 10; i++) {
      const tc = num('true-count')
      const tableMin = num('table-min')
      const right = expectedMultiplier(tc) * tableMin
      const bet = i < 3 ? (right === tableMin * 16 ? tableMin : tableMin * 16) : right
      if (i < 3) wrongs.push({ tc, tableMin, bet, right })
      placeBet(bet)
      fireEvent.click(screen.getByTestId('next-question'))
    }

    expect(screen.getByTestId('summary-score')).toHaveTextContent('70%')
    const rows = screen.getAllByTestId('summary-miss')
    expect(rows).toHaveLength(3)
    const usd = (n: number) => `$${n.toLocaleString('en')}`
    wrongs.forEach((w, i) => {
      // The spot as the panel's "previous bets" words it, then bet → right bet.
      expect(rows[i]).toHaveTextContent(`TC ${w.tc >= 0 ? '+' : ''}${w.tc} · ${usd(w.tableMin)} table`)
      expect(within(rows[i]).getByText(usd(w.bet)).tagName).toBe('S')
      expect(rows[i]).toHaveTextContent(usd(w.right))
    })
    // Neither mode can deal only its misses.
    expect(screen.queryByTestId('drill-misses')).toBeNull()
    // The summary shows the XP itself, so the toast is held back.
    expect(useLevelStore.getState().awardInPlace).toBe(true)
    expect(screen.getByTestId('summary-xp')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('summary-again'))
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 1/10')
    expect(screen.queryByTestId('round-summary')).toBeNull()
    // Nothing of the last round is carried over: finish it clean.
    for (let i = 0; i < 10; i++) {
      placeBet(expectedMultiplier(num('true-count')) * num('table-min'))
      fireEvent.click(screen.getByTestId('next-question'))
    }
    expect(screen.getByTestId('summary-score')).toHaveTextContent('100%')
    expect(screen.getByTestId('summary-no-misses')).toBeInTheDocument()
  })

  it('goes back to the settings from the summary', () => {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-training'))
    for (let i = 0; i < 10; i++) {
      placeBet(num('table-min'))
      fireEvent.click(screen.getByTestId('next-question'))
    }
    fireEvent.click(screen.getByTestId('back-to-settings'))
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
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

    placeBet(num('table-min'))
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

/**
 * The bet is built in chips, as at the casino table, and can be corrected
 * before it is placed; the keyboard reaches all of it.
 */
describe('BetSpread — building the bet', () => {
  function start() {
    render(<BetSpread />)
    fireEvent.click(screen.getByText('Bet from TC'))
    fireEvent.click(screen.getByTestId('start-training'))
  }

  it('cannot be placed before a chip is down', () => {
    start()
    expect(screen.getByTestId('place-bet')).toBeDisabled()
    fireEvent.click(screen.getByTestId('chip-25'))
    expect(screen.getByTestId('place-bet')).toBeEnabled()
    expect(screen.getByTestId('place-bet')).toHaveTextContent('$25')
  })

  it('takes the last chip back, and clears all of them', () => {
    start()
    fireEvent.click(screen.getByTestId('chip-100'))
    fireEvent.click(screen.getByTestId('chip-25'))
    expect(screen.getByTestId('place-bet')).toHaveTextContent('$125')
    fireEvent.click(screen.getByTestId('undo-chip'))
    expect(screen.getByTestId('place-bet')).toHaveTextContent('$100')
    fireEvent.click(screen.getByTestId('clear-bet'))
    expect(screen.getByTestId('place-bet')).toBeDisabled()
  })

  it('answers from the keyboard: 1–5 chips, Backspace undoes, Enter bets and goes on', () => {
    start()
    const tc = num('true-count')
    const tableMin = num('table-min')
    const correctBet = expectedMultiplier(tc) * tableMin
    // A wrong chip first, taken back with Backspace.
    fireEvent.keyDown(window, { key: '5' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    let left = correctBet
    const keys: Record<number, string> = { 1000: '5', 500: '4', 100: '3', 25: '2', 5: '1' }
    for (const chip of [1000, 500, 100, 25, 5]) {
      while (left >= chip) { fireEvent.keyDown(window, { key: keys[chip] }); left -= chip }
    }
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 2/')
  })

  it('a wrong bet puts the right one beside it and lights the right step of the ramp', () => {
    start()
    const tc = num('true-count')
    const tableMin = num('table-min')
    const correctBet = expectedMultiplier(tc) * tableMin
    const wrongBet = correctBet === tableMin * 16 ? tableMin : tableMin * 16
    placeBet(wrongBet)
    expect(screen.getByTestId('your-bet')).toHaveTextContent(`$${wrongBet.toLocaleString('en-US')}`)
    expect(screen.getByTestId('right-bet')).toHaveTextContent(`$${correctBet.toLocaleString('en-US')}`)
    const ramp = screen.getByTestId('bet-ramp')
    expect(ramp.getAttribute('data-revealed')).toBe('true')
    const lit = ramp.querySelector('[data-lit="true"]')
    expect(lit?.textContent).toContain(`${expectedMultiplier(tc)}×`)
    expect(ramp.querySelector('[data-chosen="true"]')).not.toBeNull()
  })
})
