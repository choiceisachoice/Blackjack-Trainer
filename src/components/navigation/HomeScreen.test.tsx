import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { HomeScreen } from './HomeScreen'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { CURRICULUM } from '../../services/curriculum'
import type { TrainingSessionResult } from '../../services/stats-types'
import { useLiveSessionStore } from '../../store/live-session-store'
import { saveLiveSession } from '../../services/casino-live-session'
import { savedTable } from '../casino-session/saved-table.fixture'
import { useCasinoTrialStore } from '../../store/casino-trial-store'
import { TRIAL_HANDS, setTrialHandsUsed } from '../../services/casino-trial'

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
  useCasinoTrialStore.getState().refresh()
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

/**
 * A casino table left on the device is offered on the home screen: one card,
 * above everything else, and nowhere a second time.
 */
describe('HomeScreen — a casino table left in progress', () => {
  beforeEach(() => {
    localStorage.setItem('bjt_welcome_seen', 'true')
    localStorage.setItem('bjt_placement', 'hi-lo')
    useLiveSessionStore.setState({ activeMode: null, pending: null, saved: null, resumeRequested: false })
  })

  it('shows one card, before the plan and before the modes', () => {
    saveLiveSession(savedTable([25, -25, 25]))
    useLiveSessionStore.getState().refreshSaved()
    render(<HomeScreen />)

    const cards = screen.getAllByTestId('resume-session-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveTextContent('You have a session in progress')
    expect(precedes(cards[0], screen.getByTestId('mode-card-casinoSession'))).toBe(true)
    expect(precedes(cards[0], screen.getByRole('heading', { level: 1 }))).toBe(true)
  })

  it('offers continuing only to someone who may sit at the table', () => {
    saveLiveSession(savedTable([25]))
    useLiveSessionStore.getState().refreshSaved()
    proState.isPro = false
    render(<HomeScreen />)

    expect(screen.queryByTestId('resume-card-continue')).toBeNull()
    expect(screen.getByTestId('resume-card-cash-out')).toBeInTheDocument()
  })

  it('"Continue" goes to the table with the request to open the saved one', () => {
    saveLiveSession(savedTable([25]))
    useLiveSessionStore.getState().refreshSaved()
    render(<HomeScreen />)
    fireEvent.click(screen.getByTestId('resume-card-continue'))

    expect(useAppStore.getState().currentMode).toBe('casinoSession')
    expect(useLiveSessionStore.getState().resumeRequested).toBe(true)
  })

  it('shows nothing, and leaves no gap, when there is no such table', () => {
    render(<HomeScreen />)
    expect(screen.queryByTestId('resume-session-card')).toBeNull()
  })
})

describe('the casino table\'s entry for an account without Pro', () => {
  const card = () => screen.getByTestId('mode-card-casinoSession')

  beforeEach(() => {
    localStorage.setItem('bjt_placement', 'hi-lo')
    localStorage.setItem('bjt_welcome_seen', 'true')
    proState.isPro = false
  })

  it('offers the free hands where the lock would be', () => {
    setTrialHandsUsed(0)
    render(<HomeScreen />)

    expect(within(card()).getByTestId('casino-trial-offer')).toHaveTextContent('Try 10 hands free')
    expect(within(card()).queryByLabelText('Pro feature')).toBeNull()
    // One entry: the other Pro modes keep their lock and get no offer.
    expect(screen.getAllByTestId('casino-trial-offer')).toHaveLength(1)
    expect(within(screen.getByTestId('mode-card-betSpread')).getByLabelText('Pro feature')).toBeInTheDocument()
  })

  it('counts down with the hands that were played', () => {
    setTrialHandsUsed(7)
    render(<HomeScreen />)
    expect(within(card()).getByTestId('casino-trial-offer')).toHaveTextContent('Try 3 hands free')
  })

  it('is the lock again once the trial is used up', () => {
    setTrialHandsUsed(TRIAL_HANDS)
    render(<HomeScreen />)
    expect(within(card()).queryByTestId('casino-trial-offer')).toBeNull()
    expect(within(card()).getByLabelText('Pro feature')).toBeInTheDocument()
  })

  it('is the lock while the account\'s count has not arrived on this device', () => {
    render(<HomeScreen />)
    expect(within(card()).queryByTestId('casino-trial-offer')).toBeNull()
    expect(within(card()).getByLabelText('Pro feature')).toBeInTheDocument()
  })

  it('shows neither to someone who has Pro', () => {
    proState.isPro = true
    setTrialHandsUsed(0)
    render(<HomeScreen />)
    expect(within(card()).queryByTestId('casino-trial-offer')).toBeNull()
    expect(within(card()).queryByLabelText('Pro feature')).toBeNull()
  })
})
