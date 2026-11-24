import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { HandReview, ReviewNext, SessionTrail } from './HandReview'
import type { HandReviewModel } from './hand-review-model'
import { Action } from '../../engine/rules/types'

const ROW = { hand: '16', cells: ['S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'] as const, column: 8, noSurrender: true }

function model(over: Partial<HandReviewModel> = {}): HandReviewModel {
  return {
    handNumber: 7,
    rows: [{
      kind: 'play', hand: null, spot: { hand: '16', dealer: '10' }, chosen: Action.Hit, correct: Action.Stand,
      isCorrect: false, trueCount: 2, index: { name: '16 vs 10', basic: Action.Hit, rule: { threshold: 0, above: Action.Stand, below: Action.Hit } },
    }],
    bet: { amount: 25, trueCount: 2, right: 100, isCorrect: false },
    verdict: 'wrong',
    mistakes: 2,
    nothing: null,
    chart: { spot: { hand: '16', dealer: '10' }, row: { ...ROW, cells: [...ROW.cells] }, deviation: true },
    severalHands: false,
    split: false,
    deviation: true,
    ...over,
  }
}

describe('HandReview', () => {
  it('leads with the verdict and the hand', () => {
    render(<HandReview review={model()} rules="S17" trail={['right', 'wrong']} placement="side" />)
    expect(screen.getByTestId('review-verdict')).toHaveTextContent('2 mistakes')
    expect(screen.getByTestId('hand-review')).toHaveAttribute('data-verdict', 'wrong')
    expect(screen.getByTestId('hand-review')).toHaveAccessibleName('Hand 7')
  })

  it('lists the bet against the count, then each play with what was right', () => {
    render(<HandReview review={model()} rules="S17" trail={['wrong']} placement="side" />)
    const bet = screen.getByTestId('review-bet')
    expect(bet).toHaveTextContent('Bet at TC +2')
    expect(bet).toHaveTextContent('$25')
    expect(bet).toHaveTextContent('$100')
    const list = screen.getByTestId('review-play')
    expect(list).toHaveAttribute('data-correct', 'false')
    expect(list).toHaveTextContent('Hard 16 vs. 10')
    // Labelled answers: "You … · Bet Spread …", "You … · Deviation …".
    expect(bet).toHaveTextContent('You$25')
    expect(bet).toHaveTextContent('Bet Spread$100')
    // The index play: the count it was graded at, the chart's play, and the rule.
    expect(within(list).getByText('TC +2')).toBeInTheDocument()
    expect(list).toHaveTextContent('DeviationStand')
    expect(list).toHaveTextContent('Basic strategy: Hit')
    expect(list).toHaveTextContent('At True Count 0 or higher → Stand')
    expect(list).toHaveTextContent('(below: Hit)')
    // You hit; the right play was to stand.
    expect(within(list).getByText('Hit', { selector: 's' })).toBeInTheDocument()
    expect(list).toHaveTextContent('Stand')
  })

  it('shows the chart row of the hand, with the dealer’s cell marked', () => {
    render(<HandReview review={model()} rules="S17" trail={[]} placement="side" />)
    expect(screen.getByTestId('chart-row')).toHaveAttribute('data-revealed', 'true')
    expect(screen.getByTestId('chart-row')).toHaveTextContent('S17')
  })

  it('says why there was nothing to decide', () => {
    render(<HandReview review={model({ rows: [], bet: null, verdict: 'none', mistakes: 0, nothing: 'blackjack', chart: null })} rules="S17" trail={['none']} placement="sheet" />)
    expect(screen.getByTestId('review-verdict')).toHaveTextContent('Nothing to grade')
    expect(screen.getByTestId('review-nothing')).toHaveTextContent('Blackjack — nothing to decide.')
    expect(screen.queryByTestId('chart-row')).toBeNull()
  })

  it('names the hand of each row after a split', () => {
    const rows: HandReviewModel['rows'] = [
      { kind: 'play', hand: 1, spot: { hand: '8,8', dealer: '6' }, chosen: Action.Split, correct: Action.Split, isCorrect: true, trueCount: null, index: null },
      { kind: 'play', hand: 2, spot: { hand: '18', dealer: '6' }, chosen: Action.Stand, correct: Action.Stand, isCorrect: true, trueCount: null, index: null },
    ]
    render(<HandReview review={model({ rows, bet: null, verdict: 'right', mistakes: 0, severalHands: true, split: true, deviation: false })} rules="S17" trail={['right']} placement="side" />)
    expect(screen.getByTestId('review-verdict')).toHaveTextContent('All right')
    expect(screen.getByTestId('review-play')).toHaveTextContent('Pair of 8s vs. 6')
    expect(screen.getByText('Hand 2')).toBeInTheDocument()
  })

  it('holds its own way on where it is given one', () => {
    const onNext = vi.fn()
    render(<HandReview review={model()} rules="S17" trail={[]} placement="sheet" next={<ReviewNext onNext={onNext} />} />)
    fireEvent.click(screen.getByTestId('next-hand'))
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.getByTestId('next-hand')).toHaveTextContent('Next hand')
  })
})

describe('SessionTrail', () => {
  it('counts the hands that were graded, and right', () => {
    render(<SessionTrail trail={['right', 'wrong', 'none', 'right']} />)
    // Short on screen, whole for a screen reader.
    expect(screen.getByTestId('review-trail-count')).toHaveTextContent('2/3 right')
    expect(screen.getByTestId('review-trail-count')).toHaveTextContent('2 of 3 hands right')
  })

  it('shows the hands still to come when the session has a target', () => {
    render(<SessionTrail trail={['right', 'right']} target={12} />)
    expect(screen.getByTestId('result-trail').children).toHaveLength(12)
  })

  it('draws at least ten segments, so two hands are not two wide bars', () => {
    render(<SessionTrail trail={['right', 'wrong']} />)
    const segments = [...screen.getByTestId('result-trail').children]
    expect(segments).toHaveLength(10)
    expect(segments[0].className).toContain('bg-success')
    expect(segments[1].className).toContain('bg-error')
  })

  it('keeps to the latest twenty hands in a long session', () => {
    render(<SessionTrail trail={Array.from({ length: 80 }, () => 'right' as const)} target={200} />)
    expect(screen.getByTestId('result-trail').children).toHaveLength(20)
    expect(screen.getByTestId('review-trail-count')).toHaveTextContent('80/80 right')
  })
})
