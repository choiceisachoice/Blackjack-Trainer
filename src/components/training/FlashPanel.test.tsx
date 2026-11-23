import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Action } from '../../engine/rules/types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'
import {
  FlashChartRow, FlashHistory, FlashMisses, FlashNext, FlashProgress, FlashSituation, FlashVerdict, ResultTrail,
  type AnsweredHand,
} from './FlashPanel'
import { chartRowFor } from './flash-teach'

const Q16v7: FlashQuestion = {
  handKind: 'hard', hand: '16', dealer: '7', trueCount: null, correctAction: Action.Hit,
  basicAction: Action.Hit, isDeviation: false, noSurrender: false,
}
const DEV_16v10: FlashQuestion = {
  handKind: 'hard', hand: '16', dealer: '10', trueCount: 2, correctAction: Action.Stand,
  basicAction: Action.Hit, isDeviation: true, deviationName: '16 vs 10', noSurrender: true,
}

describe('FlashProgress', () => {
  it('says which question this is, how many were right and the streak', () => {
    render(<FlashProgress index={3} total={10} results={[true, false, true]} streak={1} />)
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 4/10')
    expect(screen.getByTestId('flash-progress')).toHaveTextContent('2/3')
    expect(screen.getByTestId('flash-progress')).toHaveTextContent('67%')
    expect(screen.getByTestId('streak')).toHaveAccessibleName('Streak: 1')
  })
})

describe('ResultTrail', () => {
  it('draws one segment per question: right, wrong, the one being asked, the rest', () => {
    render(<ResultTrail total={5} results={[true, false]} index={2} />)
    const segments = [...screen.getByTestId('result-trail').children].map(s => s.className)
    expect(segments).toHaveLength(5)
    expect(segments[0]).toContain('bg-success')
    expect(segments[1]).toContain('bg-error')
    expect(segments[2]).toContain('bg-gold-bright')
    expect(segments[3]).toContain('bg-contrast')
  })
})

describe('FlashSituation', () => {
  it('names the spot in words', () => {
    render(<FlashSituation question={{ ...Q16v7, handKind: 'soft', hand: 'A,7', dealer: '9' }} />)
    expect(screen.getByTestId('spot')).toHaveTextContent('Soft 18 vs. 9')
  })
})

describe('FlashChartRow', () => {
  const row = chartRowFor(Q16v7, false)!

  it('asks with a blank row and a question mark in the dealer’s column', () => {
    render(<FlashChartRow row={row} revealed={false} rules="S17" deviation={false} />)
    const box = screen.getByTestId('chart-row')
    expect(box).toHaveAttribute('data-revealed', 'false')
    expect(within(box).getByText('?')).toBeInTheDocument()
    expect(within(box).queryByText('H')).not.toBeInTheDocument()
    expect(screen.getByText('Your answer fills this cell.')).toBeInTheDocument()
  })

  it('answered, shows the chart’s cells for the row', () => {
    render(<FlashChartRow row={row} revealed rules="S17" deviation={false} />)
    const box = screen.getByTestId('chart-row')
    expect(within(box).getAllByText('S')).toHaveLength(5)
    expect(within(box).getAllByText('H')).toHaveLength(2)
    expect(within(box).getAllByText('SU')).toHaveLength(3)
    expect(within(box).queryByText('?')).not.toBeInTheDocument()
  })

  it('says when the row is shown without surrender', () => {
    render(<FlashChartRow row={chartRowFor(DEV_16v10, false)!} revealed rules="S17" deviation />)
    expect(screen.getByText('Without late surrender:')).toBeInTheDocument()
  })
})

describe('FlashVerdict', () => {
  it('right: says so, names the play and gives the reason', () => {
    render(<FlashVerdict question={Q16v7} isCorrect selected={Action.Hit} />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
    expect(screen.getByTestId('right-play')).toHaveTextContent('Hit')
    expect(screen.getByTestId('feedback-explanation')).toHaveTextContent('The dealer’s card is strong (7 to ace)')
  })

  it('wrong: says what was chosen and what was right', () => {
    render(<FlashVerdict question={Q16v7} isCorrect={false} selected={Action.Stand} />)
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByText(/You chose/)).toHaveTextContent('You chose Stand, correct was Hit.')
  })

  it('on a count question gives the count and the index', () => {
    render(<FlashVerdict question={DEV_16v10} isCorrect selected={Action.Stand} />)
    expect(screen.getByTestId('feedback-explanation')).toHaveTextContent('At TC +2, Stand — a deviation from the basic play (Hit).')
    expect(screen.getByTestId('deviation-rule')).toHaveTextContent('At True Count 0 or higher → Stand (below: Hit)')
  })
})

describe('FlashNext', () => {
  it('goes on, and leads to the results after the last question', () => {
    const onNext = vi.fn()
    const { rerender } = render(<FlashNext onNext={onNext} last={false} />)
    fireEvent.click(screen.getByTestId('next-question'))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('next-question')).toHaveTextContent('Next')
    rerender(<FlashNext onNext={onNext} last />)
    expect(screen.getByTestId('next-question')).toHaveTextContent('See Results')
  })
})

const ANSWERS: AnsweredHand[] = [
  { question: Q16v7, chosen: Action.Hit, correct: true },
  { question: DEV_16v10, chosen: Action.Hit, correct: false },
]

describe('FlashHistory', () => {
  it('says where the answers will appear before there are any', () => {
    render(<FlashHistory answers={[]} />)
    expect(screen.getByText('Your answers appear here, newest first.')).toBeInTheDocument()
  })

  it('lists the hands answered, newest first, with the right play and a wrong pick struck through', () => {
    render(<FlashHistory answers={ANSWERS} />)
    const rows = within(screen.getByTestId('flash-history')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Hard 16 vs. 10')
    expect(rows[0]).toHaveTextContent('TC +2')
    expect(rows[0].querySelector('s')).toHaveTextContent('Hit')
    expect(rows[1]).toHaveTextContent('Hard 16 vs. 7')
    expect(rows[1].querySelector('s')).toBeNull()
  })
})

describe('FlashMisses', () => {
  it('lists only the misses', () => {
    render(<FlashMisses answers={ANSWERS} />)
    const rows = within(screen.getByTestId('flash-misses')).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Hard 16 vs. 10')
  })

  it('draws nothing for a round without a miss', () => {
    const { container } = render(<FlashMisses answers={[ANSWERS[0]]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows five and counts the rest', () => {
    const many = Array.from({ length: 7 }, () => ANSWERS[1])
    render(<FlashMisses answers={many} />)
    expect(within(screen.getByTestId('flash-misses')).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('And 2 more.')).toBeInTheDocument()
  })
})
