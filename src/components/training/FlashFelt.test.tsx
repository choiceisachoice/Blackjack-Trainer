import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Rank, Suit } from '../../types'
import { Action } from '../../engine/rules/types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'
import { FlashFelt } from './FlashFelt'
import type { QuestionCards } from './flash-scene'

const HARD_16_V_10: FlashQuestion = {
  handKind: 'hard', hand: '16', dealer: '10', trueCount: null, correctAction: Action.Surrender,
  basicAction: Action.Surrender, isDeviation: false, noSurrender: false,
}
const CARDS: QuestionCards = {
  player: [{ rank: Rank.King, suit: Suit.Spades }, { rank: Rank.Six, suit: Suit.Hearts }],
  dealer: { rank: Rank.Queen, suit: Suit.Diamonds },
}

describe('FlashFelt', () => {
  it('lays the question’s cards on the felt — the real faces, picture cards included', () => {
    render(<FlashFelt question={HARD_16_V_10} cards={CARDS} deal={0} verdict={null} />)
    const player = screen.getByTestId('player-hand')
    const dealer = screen.getByTestId('dealer-card')
    expect(within(player).getByLabelText('K Spades')).toHaveAttribute('data-card', 'K-Spades')
    expect(within(player).getByLabelText('6 Hearts')).toBeInTheDocument()
    expect(within(dealer).getByLabelText('Q Diamonds')).toBeInTheDocument()
  })

  it('carries the spot in the chart’s notation, for whatever reads it', () => {
    render(<FlashFelt question={HARD_16_V_10} cards={CARDS} deal={0} verdict={null} />)
    expect(screen.getByTestId('player-hand')).toHaveAttribute('data-hand', '16')
    expect(screen.getByTestId('dealer-card')).toHaveAttribute('data-dealer', '10')
    expect(screen.getByTestId('flash-felt')).toHaveAttribute('data-hand-kind', 'hard')
  })

  it('keeps the spot’s old notation as the text of its test ids — the demo and film scripts read it', () => {
    render(<FlashFelt question={HARD_16_V_10} cards={CARDS} deal={0} verdict={null} />)
    expect(screen.getByTestId('player-hand').textContent).toBe('16')
    expect(screen.getByTestId('dealer-card').textContent).toBe('10')
  })

  it('labels the two hands and names the spot', () => {
    render(<FlashFelt question={HARD_16_V_10} cards={CARDS} deal={0} verdict={null} />)
    expect(screen.getByText('Dealer')).toBeInTheDocument()
    expect(screen.getByText('Your Hand')).toBeInTheDocument()
    expect(screen.getByTestId('spot-on-felt')).toHaveTextContent('Hard 16 vs. 10')
  })

  it('shows no count on a basic-strategy question', () => {
    render(<FlashFelt question={HARD_16_V_10} cards={CARDS} deal={0} verdict={null} />)
    expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
  })

  it('shows the true count, signed, when the answer depends on it', () => {
    const q = { ...HARD_16_V_10, trueCount: -2, isDeviation: true, deviationName: '16 vs 10' }
    render(<FlashFelt question={q} cards={CARDS} deal={0} verdict={null} />)
    expect(screen.getByTestId('true-count')).toHaveTextContent('−2')
    expect(screen.getByText('True Count')).toBeInTheDocument()
  })

  it('prints the no-surrender rule on the cloth when the question is set at such a table', () => {
    const q = { ...HARD_16_V_10, noSurrender: true }
    render(<FlashFelt question={q} cards={CARDS} deal={0} verdict={null} />)
    expect(screen.getByTestId('no-surrender')).toHaveTextContent('No surrender at this table')
  })

  it('deals two face-down cards for insurance, which is about any hand', () => {
    const q: FlashQuestion = { ...HARD_16_V_10, hand: '*', dealer: 'A', trueCount: 3, isDeviation: true, deviationName: 'Insurance' }
    render(<FlashFelt question={q} cards={{ player: [], dealer: { rank: Rank.Ace, suit: Suit.Clubs } }} deal={0} verdict={null} />)
    expect(within(screen.getByTestId('player-hand')).getAllByLabelText('Face-down card')).toHaveLength(2)
    expect(screen.getByTestId('spot-on-felt')).toHaveTextContent('Any hand vs. A')
  })
})
