import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { HomeScreen } from './HomeScreen'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { CURRICULUM } from '../../services/curriculum'
import type { TrainingSessionResult } from '../../services/stats-types'

const proState = { isPro: true }
vi.mock('../../store/entitlement-store', async importOriginal => ({
  ...(await importOriginal<typeof import('../../store/entitlement-store')>()),
  useIsPro: () => proState.isPro,
}))

/** True when `a` comes before `b` in the document. */
const precedes = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

beforeEach(() => {
  localStorage.clear()
  proState.isPro = true
  useAppStore.setState({ currentMode: 'home' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, loadStats: vi.fn().mockResolvedValue(undefined) })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HomeScreen — a placed learner', () => {
  beforeEach(() => {
    localStorage.setItem('bjt_welcome_seen', 'true')
    localStorage.setItem('bjt_placement', 'hi-lo')
  })

  it('puts who you are above the plan, and the plan above everything to browse', () => {
    render(<HomeScreen />)

    // The level card is the page's one h1...
    const header = screen.getByRole('heading', { level: 1 })
    const upNext = screen.getByTestId('plan-up-next')
    const modes = screen.getByRole('heading', { name: 'Training Modes' })

    expect(precedes(header, upNext)).toBe(true)
    expect(precedes(upNext, modes)).toBe(true)
    // ...and it lives inside the plan's own wrapper, in its `before` slot.
    expect(within(screen.getByTestId('training-plan')).getByRole('heading', { level: 1 })).toBe(header)
  })

  it('carries no second copy of the product name and no "start here" card', () => {
    // The name is in the bar above; the card answered a question the plan's
    // own start button now answers.
    render(<HomeScreen />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByText('Where to begin')).toBeNull()
    expect(screen.queryByTestId('start-here')).toBeNull()
  })

  it('offers no "continue" button beside the plan’s own start', () => {
    useStatsStore.setState({
      sessions: [{
        id: 'a', mode: 'betSpread', timestamp: new Date().toISOString(), durationSeconds: 60,
        totalQuestions: 20, correctAnswers: 18, accuracy: 0.9, bestStreak: 4,
      } as unknown as TrainingSessionResult],
    })
    render(<HomeScreen />)
    expect(screen.queryByRole('button', { name: /^Continue/ })).toBeNull()
    expect(screen.getByTestId('plan-today-start')).toBeInTheDocument()
  })

  it('shows today’s session and the road as a strip, not the seven stage cards', () => {
    render(<HomeScreen />)
    expect(screen.getByTestId('plan-today')).toBeInTheDocument()
    expect(screen.getByTestId('plan-path')).toBeInTheDocument()
    CURRICULUM.forEach(s => {
      expect(screen.getByTestId(`path-node-${s.id}`)).toBeInTheDocument()
      expect(screen.queryByTestId(`plan-stage-${s.id}`)).toBeNull()
    })
  })

  it('starts today’s session from the home screen', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByTestId('plan-block-work'))
    expect(useAppStore.getState().currentMode).toBe('speedDrill')
  })

  it('opens the full plan from the strip', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByTestId('plan-path-open'))
    expect(useAppStore.getState().currentMode).toBe('plan')
  })

  it('keeps the challenges under the plan and above the modes', () => {
    render(<HomeScreen />)
    const path = screen.getByTestId('plan-path')
    const modes = screen.getByRole('heading', { name: 'Training Modes' })
    const challenges = modes.closest('section')!.previousElementSibling!
    // Two cards, one above the other.
    expect(challenges.children).toHaveLength(2)
    expect(precedes(path, challenges)).toBe(true)
    expect(precedes(challenges, modes)).toBe(true)
  })

  it('still lets every mode be opened from its card', () => {
    render(<HomeScreen />)
    fireEvent.click(screen.getByTestId('mode-card-casinoSession'))
    expect(useAppStore.getState().currentMode).toBe('casinoSession')
  })

  it('explains how the plan works to an account that has not trained, with the tour on offer', () => {
    render(<HomeScreen />)
    expect(screen.getByTestId('how-it-works')).toBeInTheDocument()
    expect(screen.getByTestId('how-it-works-tour')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('how-it-works-dismiss'))
    expect(screen.queryByTestId('how-it-works')).toBeNull()
  })
})

describe('HomeScreen — before the plan is showing', () => {
  it('gives a brand-new account the welcome on a clean screen', () => {
    render(<HomeScreen />)
    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    // No header, no challenges, no mode grid underneath to shrug at.
    expect(screen.queryByRole('heading', { name: 'Training Modes' })).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByTestId('mode-card-casinoSession')).toBeNull()
  })

  it('keeps the screen clean through both questions, then opens the home screen', () => {
    localStorage.setItem('bjt_welcome_seen', 'true')
    render(<HomeScreen />)
    expect(screen.getByTestId('starting-point')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Training Modes' })).toBeNull()

    fireEvent.click(screen.getByTestId('entry-strategy'))
    expect(screen.getByTestId('time-question')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Training Modes' })).toBeNull()

    fireEvent.click(screen.getByTestId('time-question-done'))
    expect(screen.getByRole('heading', { name: 'Training Modes' })).toBeInTheDocument()
    expect(screen.getByTestId('plan-up-next')).toBeInTheDocument()
  })
})
