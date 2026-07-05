import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeviationTraining } from './DeviationTraining'
import { useAppStore } from '../../store/app-store'
import { DEFAULT_RULES } from '../../engine/rules/types'
import { Action } from '../../engine/rules/types'
import { lookupBasicAction } from '../../engine/strategy/flashcards'
import { S17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'

/** Correct basic action for the currently-shown hand (S17 forced in beforeEach). */
function correctForShownHand(): Action {
  const hand = screen.getByTestId('player-hand').textContent ?? ''
  const dealer = screen.getByTestId('dealer-card').textContent ?? ''
  return lookupBasicAction(hand, dealer, S17_STRATEGY)
}

describe('DeviationTraining (Flashcards)', () => {
  beforeEach(() => {
    // Force S17 so the test can compute the expected basic action deterministically.
    useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false } })
  })

  it('renders the settings screen with level and question count', () => {
    render(<DeviationTraining />)
    expect(screen.getByText('Flashcards')).toBeInTheDocument()
    expect(screen.getByText('Basic Strategy')).toBeInTheDocument()
    expect(screen.getByText('Deviations')).toBeInTheDocument()
    expect(screen.getByText('Mixed')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Number of questions' })).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('Basic Strategy questions show a hand + dealer but no True Count', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training')) // default level = Basic Strategy

    expect(screen.getByTestId('player-hand')).toBeInTheDocument()
    expect(screen.getByTestId('dealer-card')).toBeInTheDocument()
    expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
  })

  it('Deviations level shows a True Count', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByText('Deviations'))
    fireEvent.click(screen.getByTestId('start-training'))
    expect(screen.getByTestId('true-count')).toBeInTheDocument()
  })

  it('the correct basic action is graded Correct', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    const correct = correctForShownHand()
    fireEvent.click(screen.getByTestId(`action-${String(correct).toLowerCase()}`))
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
  })

  it('a wrong action is graded Wrong with an explanation', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    const correct = correctForShownHand()
    const wrong = correct === Action.Hit ? Action.Stand : Action.Hit
    fireEvent.click(screen.getByTestId(`action-${String(wrong).toLowerCase()}`))
    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('feedback-explanation')).toBeInTheDocument()
  })

  it('runs a finite session and ends in a summary', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByText('10')) // shortest session
    fireEvent.click(screen.getByTestId('start-training'))

    for (let i = 0; i < 10; i++) {
      expect(screen.getByTestId('question-progress')).toHaveTextContent(`Question ${i + 1}/10`)
      fireEvent.click(screen.getByTestId('action-hit')) // any answer; correctness irrelevant
      fireEvent.click(screen.getByTestId('next-question'))
    }

    expect(screen.getByTestId('summary-title')).toBeInTheDocument()
  })
})
