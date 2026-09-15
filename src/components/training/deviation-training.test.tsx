import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DeviationTraining } from './DeviationTraining'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { DEFAULT_RULES } from '../../engine/rules/types'
import { Action } from '../../engine/rules/types'
import { lookupBasicAction } from '../../engine/strategy/flashcards'
import { S17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import type { DeviationDetails } from '../../services/stats-types'

/** Correct basic action for the currently-shown hand (S17 forced in beforeEach). */
function correctForShownHand(): Action {
  const hand = screen.getByTestId('player-hand').textContent ?? ''
  const dealer = screen.getByTestId('dealer-card').textContent ?? ''
  return lookupBasicAction(hand, dealer, S17_STRATEGY)
}

describe('DeviationTraining (Flashcards)', () => {
  beforeEach(() => {
    // Force S17 so the test can compute the expected basic action deterministically.
    useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false }, flashFocus: null })
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

  it('records per-deviation results so the weakest-hands panel has real data', () => {
    const recordSpy = vi.fn()
    useStatsStore.setState({ recordSession: recordSpy })

    const { unmount } = render(<DeviationTraining />)
    // Scope to the labelled groups (the async backdrop rails can also render digits).
    fireEvent.click(within(screen.getByRole('group', { name: 'Level' })).getByText('Deviations'))
    fireEvent.click(within(screen.getByRole('group', { name: 'Number of questions' })).getByText('10'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Answer four deviation questions (Stand is always an available button).
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByTestId('action-stand'))
      fireEvent.click(screen.getByTestId('next-question'))
    }

    unmount() // useSessionSave persists on unmount

    expect(recordSpy).toHaveBeenCalledTimes(1)
    const details = recordSpy.mock.calls[0][0].details as DeviationDetails
    expect(details.type).toBe('deviationFlashCards')
    // perDeviation is now populated (previously always {})
    const entries = Object.values(details.perDeviation)
    expect(entries.length).toBeGreaterThan(0)
    const totalRecorded = entries.reduce((s, e) => s + e.correct + e.incorrect, 0)
    expect(totalRecorded).toBe(4)
  })

  describe('focus drill from Analytics', () => {
    const FOCUS = ['16 vs 10', 'Insurance']

    it('opens on the named hands instead of the level picker', () => {
      useAppStore.setState({ flashFocus: FOCUS })
      render(<DeviationTraining />)
      expect(screen.getByText('Focus: your weakest hands')).toBeInTheDocument()
      const hands = screen.getByTestId('focus-hands')
      expect(within(hands).getByText('16 vs 10')).toBeInTheDocument()
      expect(within(hands).getByText('Insurance')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Level' })).not.toBeInTheDocument()
      expect(screen.getByTestId('start-training')).toHaveTextContent('Drill these hands')
    })

    it('asks only those hands, records them, and reports per hand', () => {
      const recordSpy = vi.fn()
      useStatsStore.setState({ recordSession: recordSpy })
      useAppStore.setState({ flashFocus: FOCUS })
      render(<DeviationTraining />)
      fireEvent.click(within(screen.getByRole('group', { name: 'Number of questions' })).getByText('10'))
      fireEvent.click(screen.getByTestId('start-training'))

      for (let i = 0; i < 10; i++) {
        const hand = screen.getByTestId('player-hand').textContent
        const dealer = screen.getByTestId('dealer-card').textContent
        // "16 vs 10" or Insurance ("Any" vs A) — nothing else.
        expect(`${hand} vs ${dealer}`).toMatch(/^(16 vs 10|Any vs A)$/)
        expect(screen.getByTestId('true-count')).toBeInTheDocument()
        fireEvent.click(screen.getByTestId('action-stand'))
        fireEvent.click(screen.getByTestId('next-question'))
      }

      // Paid and recorded at the summary, like every other round.
      expect(screen.getByTestId('summary-title')).toBeInTheDocument()
      expect(recordSpy).toHaveBeenCalledTimes(1)
      const details = recordSpy.mock.calls[0][0].details as DeviationDetails
      expect(Object.keys(details.perDeviation).sort()).toEqual([...FOCUS].sort())
      expect(details.perDeviation['16 vs 10'].correct + details.perDeviation['16 vs 10'].incorrect).toBe(5)

      const results = screen.getByTestId('focus-results')
      expect(within(results).getByText('16 vs 10')).toBeInTheDocument()
      expect(within(results).getByText('Insurance')).toBeInTheDocument()
      expect(screen.getByTestId('focus-again')).toBeInTheDocument()
    })

    it('can be dropped for the ordinary drill', () => {
      useAppStore.setState({ flashFocus: FOCUS })
      render(<DeviationTraining />)
      fireEvent.click(screen.getByTestId('focus-clear'))
      expect(screen.getByRole('group', { name: 'Level' })).toBeInTheDocument()
      expect(useAppStore.getState().flashFocus).toBeNull()
    })

    it('ignores names that are not drillable and falls back when none are', () => {
      useAppStore.setState({ flashFocus: ['no such hand'] })
      render(<DeviationTraining />)
      expect(screen.getByRole('group', { name: 'Level' })).toBeInTheDocument()
    })

    it('clears the hand-off when the screen is left', () => {
      useAppStore.setState({ flashFocus: FOCUS })
      const { unmount } = render(<DeviationTraining />)
      unmount()
      expect(useAppStore.getState().flashFocus).toBeNull()
    })
  })
})
