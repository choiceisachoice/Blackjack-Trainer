import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { LearnChapters } from './LearnChapters'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import type { TrainingSessionResult } from '../../services/stats-types'

function session(mode: TrainingSessionResult['mode'], i: number): TrainingSessionResult {
  return {
    id: `s${i}`,
    mode,
    timestamp: new Date(2026, 10, i + 1).toISOString(),
    countingSystem: 'hi-lo' as TrainingSessionResult['countingSystem'],
    durationSeconds: 300,
    totalQuestions: 20,
    correctAnswers: 18,
    accuracy: 0.9,
    bestStreak: 8,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 800 } as unknown as TrainingSessionResult['details'],
  }
}

describe('LearnChapters', () => {
  beforeEach(() => {
    useStatsStore.setState({ sessions: [] })
    useAppStore.setState({ currentMode: 'learn' })
  })

  it('shows every chapter as a card in four columns, with a reading time', () => {
    render(<LearnChapters />)
    expect(screen.getByTestId('learn-page')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4)
    for (const id of ['basics', 'what-is-counting', 'hi-lo', 'true-count', 'basic-strategy', 'deviations', 'i18-fab4', 'bet-spread', 'deck-estimation', 'faq', 'modes']) {
      expect(screen.getByTestId(`chapter-${id}`)).toBeInTheDocument()
    }
    expect(within(screen.getByTestId('chapter-hi-lo')).getByText(/^\d+ min$/)).toBeInTheDocument()
    expect(screen.getByTestId('open-hi-lo')).toHaveAccessibleName('Chapter 3: The Hi-Lo count')
  })

  it('shows the learner’s own practice on the cards and in the header', () => {
    useStatsStore.setState({ sessions: [session('speedDrill', 0), session('speedDrill', 1), session('speedDrill', 2)] })
    render(<LearnChapters />)
    expect(within(screen.getByTestId('chapter-hi-lo')).getByText('Practised 3×')).toBeInTheDocument()
    expect(within(screen.getByTestId('chapter-bet-spread')).getByText('Not practised yet')).toBeInTheDocument()
    // Two chapters are practised in the Speed Drill.
    expect(screen.getByTestId('learn-progress')).toHaveTextContent('2 of 9 chapters practised')
  })

  it('opens the matching training mode from a card', () => {
    render(<LearnChapters />)
    fireEvent.click(within(screen.getByTestId('chapter-bet-spread')).getByTestId('practice-betSpread'))
    expect(useAppStore.getState().currentMode).toBe('betSpread')
  })

  it('opens a chapter with its full text, and walks to the next and back', () => {
    render(<LearnChapters />)
    fireEvent.click(screen.getByTestId('open-hi-lo'))
    expect(screen.getByTestId('learn-chapter')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'The Hi-Lo count' })).toBeInTheDocument()
    // The chapter paragraphs are there, not only the summary.
    expect(screen.getByText(/A worked round/)).toBeInTheDocument()
    expect(screen.getByTestId('learn-practice')).toHaveTextContent('Speed Drill')

    fireEvent.click(screen.getByTestId('learn-next'))
    expect(screen.getByRole('heading', { level: 1, name: 'Running Count vs True Count' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByTestId('learn-back')[0])
    expect(screen.getByTestId('learn-chapters')).toBeInTheDocument()
  })

  it('opens the game basics and the questions', () => {
    render(<LearnChapters />)
    fireEvent.click(screen.getByTestId('open-basics'))
    expect(screen.getByTestId('blackjack-basics')).toBeInTheDocument()
    fireEvent.click(screen.getAllByTestId('learn-back')[0])
    fireEvent.click(screen.getByTestId('open-faq'))
    expect(screen.getByTestId('learn-faq')).toBeInTheDocument()
    expect(screen.getByText('Is card counting illegal?')).toBeInTheDocument()
  })
})
