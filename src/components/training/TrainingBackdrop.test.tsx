import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { TrainingBackdrop } from './TrainingBackdrop'
import { RAIL_CONTENT } from './training-rail-content'
import en from '../../i18n/messages/en.json'
import { useStatsStore } from '../../store/stats-store'
import type { LifetimeStats, TrainingSessionResult } from '../../services/stats-types'
import { CountingSystemId } from '../../engine/counting/types'

/**
 * The rail content is translation keys, so the assertions resolve them the way
 * the component does. Going through en.json rather than the raw key also means
 * a key with no message fails the test instead of rendering its own path.
 */
const rail = (key: string) => {
  const value = key.split('.').slice(1).reduce<unknown>(
    (node, part) => (node as Record<string, unknown>)[part], en.training)
  if (typeof value !== 'string') throw new Error(`no message for ${key}`)
  return value
}

const emptyLifetime: LifetimeStats = {
  totalSessions: 0, totalQuestions: 0, totalCorrect: 0, totalPracticeSeconds: 0,
  overallAccuracy: 0, bestStreak: 0, byMode: {}, dailyStats: [],
}

function speedSession(overrides: Partial<TrainingSessionResult> = {}): TrainingSessionResult {
  return {
    id: crypto.randomUUID(), mode: 'speedDrill', timestamp: new Date().toISOString(),
    countingSystem: CountingSystemId.HiLo, durationSeconds: 120, totalQuestions: 10,
    correctAnswers: 9, accuracy: 0.9, bestStreak: 5,
    details: { type: 'speedDrill', cardsPerRound: 10, speedMs: 1000, rcErrors: [] }, ...overrides,
  }
}

describe('TrainingBackdrop', () => {
  beforeEach(() => {
    useStatsStore.setState({ sessions: [], lifetimeStats: emptyLifetime, isLoading: false })
  })

  it('renders the decorative ambient layer', () => {
    const { container } = render(<TrainingBackdrop />)
    expect(container.querySelector('[aria-hidden]')).toBeTruthy()
    // No rails without showRails
    expect(screen.queryByText('How it works')).not.toBeInTheDocument()
  })

  it('draws no glow layer: a faint gradient on near-black bands', () => {
    render(<TrainingBackdrop />)
    expect(screen.queryByTestId('backdrop-glow')).not.toBeInTheDocument()
  })

  it('renders Casino Session rails (wide breakpoint)', () => {
    render(<TrainingBackdrop mode="casinoSession" showRails railBreakpoint="2xl" />)
    expect(screen.getByText('How it works')).toBeInTheDocument()
    expect(screen.getByText(rail(RAIL_CONTENT.casinoSession!.steps[0]))).toBeInTheDocument()
    expect(screen.getByText(rail(RAIL_CONTENT.casinoSession!.tip))).toBeInTheDocument()
  })

  it('does not render rails when showRails is false', () => {
    render(<TrainingBackdrop mode="speedDrill" />)
    expect(screen.queryByText('How it works')).not.toBeInTheDocument()
  })

  it('renders per-mode rails with steps when showRails and mode are set', () => {
    render(<TrainingBackdrop mode="speedDrill" showRails />)
    expect(screen.getByText('How it works')).toBeInTheDocument()
    for (const step of RAIL_CONTENT.speedDrill!.steps) {
      expect(screen.getByText(rail(step))).toBeInTheDocument()
    }
    expect(screen.getByText(rail(RAIL_CONTENT.speedDrill!.tip))).toBeInTheDocument()
  })

  it('shows the last-run accuracy when a session exists for the mode', () => {
    useStatsStore.setState({
      sessions: [speedSession({ accuracy: 0.88 })],
      lifetimeStats: {
        ...emptyLifetime,
        byMode: { speedDrill: { totalSessions: 1, totalQuestions: 10, totalCorrect: 9, accuracy: 0.9, bestAccuracy: 0.95, totalPracticeSeconds: 120, bestStreak: 5 } },
      },
    })
    render(<TrainingBackdrop mode="speedDrill" showRails />)
    expect(screen.getByText('88')).toBeInTheDocument()
    expect(screen.getByText(/Best in this mode: 95%/)).toBeInTheDocument()
  })

  it('shows an empty prompt when the mode has no runs', () => {
    render(<TrainingBackdrop mode="betSpread" showRails />)
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument()
  })
})

describe('a rail for a sub-mode', () => {
  it('describes Basic Strategy flashcards without a true count', () => {
    // The default level is "no counting yet"; the rail beside it used to
    // explain a true count and ask whether you deviate correctly.
    render(<TrainingBackdrop mode="deviationFlashCards" showRails railVariant="flashBasic" />)
    expect(screen.getByText(en.training.rail.flashBasic.s1)).toBeInTheDocument()
    expect(screen.getByText(en.training.rail.flashBasic.s3)).toBeInTheDocument()
    expect(screen.queryByText(en.training.rail.deviationFlashCards.s1)).toBeNull()
    expect(screen.queryByText(en.training.rail.deviationFlashCards.s3)).toBeNull()
  })

  it('keeps the mode’s own rail when no variant is asked for, or an unknown one', () => {
    const { unmount } = render(<TrainingBackdrop mode="deviationFlashCards" showRails />)
    expect(screen.getByText(en.training.rail.deviationFlashCards.s1)).toBeInTheDocument()
    unmount()
    render(<TrainingBackdrop mode="deviationFlashCards" showRails railVariant="nope" />)
    expect(screen.getByText(en.training.rail.deviationFlashCards.s1)).toBeInTheDocument()
  })
})
