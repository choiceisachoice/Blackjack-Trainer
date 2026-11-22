import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DeviationTraining, type FlashRoundResult, type FlashTrial } from './DeviationTraining'
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

    it('sets the 16 vs 10 stand index at a no-surrender table and says so', () => {
      useAppStore.setState({ flashFocus: ['16 vs 10'] })
      render(<DeviationTraining />)
      fireEvent.click(screen.getByTestId('start-training'))
      expect(screen.getByTestId('no-surrender')).toHaveTextContent('No surrender at this table')
      expect(screen.getByTestId('action-surrender')).toBeDisabled()
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

/**
 * The level the setup opens on follows the plan. A learner on the Deviations
 * stage used to be dropped on Basic Strategy, score 100% three times and see
 * the plan still at 0 of 3 — basic sessions do not count for that stage.
 */
describe('the level Flashcards opens on', () => {
  const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed')

  beforeEach(() => {
    localStorage.clear()
    useStatsStore.setState({ sessions: [] })
    useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false }, flashFocus: null })
  })

  it('is Basic Strategy for a learner who is still on it', () => {
    localStorage.setItem('bjt_placement', 'basic-strategy')
    render(<DeviationTraining />)
    expect(pressed('Basic Strategy')).toBe('true')
  })

  it('is Basic Strategy when there is no plan yet', () => {
    render(<DeviationTraining />)
    expect(pressed('Basic Strategy')).toBe('true')
  })

  it('is Deviations once the plan has reached the Deviations stage', () => {
    localStorage.setItem('bjt_placement', 'deviations')
    render(<DeviationTraining />)
    expect(pressed('Deviations')).toBe('true')
    expect(pressed('Basic Strategy')).toBe('false')
  })

  it('stays the learner’s to change', () => {
    localStorage.setItem('bjt_placement', 'deviations')
    render(<DeviationTraining />)
    fireEvent.click(screen.getByRole('button', { name: 'Basic Strategy' }))
    expect(pressed('Basic Strategy')).toBe('true')
  })
})

/**
 * `data-drill-run` is what tells the back bar to give up its row on a phone
 * held sideways (see `BackToMenu`). It has to be there for the whole run and
 * must not be there on the setup screen, which keeps the arrow home.
 */
describe('DeviationTraining — marks a running drill for the sideways-phone layout', () => {
  it('is unmarked on the setup screen and marked on question and feedback', () => {
    const { container } = render(<DeviationTraining />)
    expect(container.querySelector('[data-drill-run]')).toBeNull()

    fireEvent.click(screen.getByTestId('start-training'))
    expect(container.querySelector('[data-drill-run]')).not.toBeNull()

    fireEvent.click(container.querySelector('button[data-testid^="action-"]:not([disabled])')!)
    expect(screen.getByTestId('next-question')).toBeInTheDocument()
    expect(container.querySelector('[data-drill-run]')).not.toBeNull()
  })
})

describe('DeviationTraining as a trial round (the public /try page)', () => {
  beforeEach(() => {
    useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false }, flashFocus: null })
  })

  /** A trial with marked-up first and last screens, and the result it was handed. */
  function trial(over: Partial<FlashTrial> = {}) {
    const seen: { result: FlashRoundResult | null } = { result: null }
    const config: FlashTrial = {
      questions: 10,
      autoStart: false,
      record: true,
      renderIntro: start => <button data-testid="trial-start" onClick={start}>go</button>,
      renderSummary: result => { seen.result = result; return <div data-testid="trial-end" /> },
      ...over,
    }
    return { config, seen }
  }

  function answerAll(wrongOn: number[] = []) {
    for (let i = 0; i < 10; i++) {
      const right = correctForShownHand()
      const pick = wrongOn.includes(i) ? (right === Action.Hit ? Action.Stand : Action.Hit) : right
      fireEvent.click(screen.getByTestId(`action-${String(pick).toLowerCase()}`))
      fireEvent.click(screen.getByTestId('next-question'))
    }
  }

  it('shows the trial’s own first screen instead of the setup', () => {
    const { config } = trial()
    render(<DeviationTraining trial={config} />)
    expect(screen.getByTestId('trial-start')).toBeInTheDocument()
    expect(screen.queryByTestId('start-training')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Level' })).not.toBeInTheDocument()
  })

  it('deals basic strategy only, the number of hands it was given', () => {
    const { config } = trial()
    render(<DeviationTraining trial={config} />)
    fireEvent.click(screen.getByTestId('trial-start'))
    for (let i = 0; i < 10; i++) {
      expect(screen.getByTestId('question-progress')).toHaveTextContent(`Question ${i + 1}/10`)
      expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('action-hit'))
      fireEvent.click(screen.getByTestId('next-question'))
    }
    expect(screen.getByTestId('trial-end')).toBeInTheDocument()
    expect(screen.queryByTestId('back-to-settings')).not.toBeInTheDocument()
  })

  it('hands the last screen the score and the missed hands with the right play', () => {
    const { config, seen } = trial()
    render(<DeviationTraining trial={config} />)
    fireEvent.click(screen.getByTestId('trial-start'))
    answerAll([3])
    expect(seen.result).toMatchObject({ correct: 9, total: 10 })
    expect(seen.result?.misses).toHaveLength(1)
    const miss = seen.result!.misses[0]
    expect(miss.correct).toBe(lookupBasicAction(miss.hand, miss.dealer, S17_STRATEGY))
    expect(miss.chosen).not.toBe(miss.correct)
  })

  it('opens on the first hand when asked to, and says the round has started', () => {
    const onStart = vi.fn()
    const { config } = trial({ autoStart: true, onStart })
    render(<DeviationTraining trial={config} />)
    expect(screen.queryByTestId('trial-start')).not.toBeInTheDocument()
    expect(screen.getByTestId('question-progress')).toHaveTextContent('Question 1/10')
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('says the round has started when the first screen’s button is pressed', () => {
    const onStart = vi.fn()
    const { config } = trial({ onStart })
    render(<DeviationTraining trial={config} />)
    expect(onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('trial-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('records the round like any other session', () => {
    const recordSpy = vi.fn()
    useStatsStore.setState({ recordSession: recordSpy })
    const { config } = trial()
    const { unmount } = render(<DeviationTraining trial={config} />)
    fireEvent.click(screen.getByTestId('trial-start'))
    answerAll()
    expect(recordSpy).toHaveBeenCalledTimes(1)
    expect(recordSpy.mock.calls[0][0]).toMatchObject({ mode: 'deviationFlashCards', totalQuestions: 10, correctAnswers: 10 })
    unmount()
    expect(recordSpy).toHaveBeenCalledTimes(1)
  })

  it('records nothing when told not to — not at the end, not on leaving', () => {
    const recordSpy = vi.fn()
    useStatsStore.setState({ recordSession: recordSpy })
    const { config, seen } = trial({ record: false })
    const { unmount } = render(<DeviationTraining trial={config} />)
    fireEvent.click(screen.getByTestId('trial-start'))
    answerAll([0])
    // The visitor still gets the result.
    expect(seen.result).toMatchObject({ correct: 9, total: 10 })
    unmount()
    expect(recordSpy).not.toHaveBeenCalled()
  })
})
