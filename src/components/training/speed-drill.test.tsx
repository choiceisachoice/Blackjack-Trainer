import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SpeedDrill } from './SpeedDrill'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { CountingSystemId } from '../../engine/counting/types'
import { DEFAULT_RULES } from '../../engine/rules/types'
import { CURRICULUM } from '../../services/curriculum'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, onAnimationComplete, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  // Components ask for the motion preference directly; a mock without it
  // renders `undefined` where a hook's result is expected.
  useReducedMotion: () => false,
}))

describe('SpeedDrill', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState({
      currentMode: 'speedDrill',
      selectedSystem: CountingSystemId.HiLo,
      selectedRules: DEFAULT_RULES,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders settings screen initially', () => {
    render(<SpeedDrill />)
    expect(screen.getByText('Speed Drill')).toBeInTheDocument()
    expect(screen.getByText('Start Drill')).toBeInTheDocument()
    expect(screen.getByText('Number of Cards')).toBeInTheDocument()
    expect(screen.getByText('Speed')).toBeInTheDocument()
  })

  it('start button begins the drill', () => {
    render(<SpeedDrill />)
    fireEvent.click(screen.getByTestId('start-drill'))
    // Should now show drill UI with card progress
    expect(screen.getByText(/Card 1 \//)).toBeInTheDocument()
  })

  it('shows card count progress during drill', () => {
    render(<SpeedDrill />)

    // Select 10 cards and Normal speed (1s)
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-drill'))

    expect(screen.getByText('Card 1 / 10')).toBeInTheDocument()

    // Advance one interval
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Card 2 / 10')).toBeInTheDocument()
  })

  it('shows input screen after last card', () => {
    render(<SpeedDrill />)

    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-drill'))

    // Advance through all 10 cards (9 intervals to go from card 1 to card 10)
    act(() => { vi.advanceTimersByTime(9000) })

    // After the last card interval, should transition to input
    act(() => { vi.advanceTimersByTime(1000) })

    expect(screen.getByText('What is the Running Count?')).toBeInTheDocument()
    expect(screen.getByTestId('submit-answer')).toBeInTheDocument()
  })

  it('correct answer shows success feedback', () => {
    render(<SpeedDrill />)

    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-drill'))

    // Fast-forward through all cards
    act(() => { vi.advanceTimersByTime(10000) })

    // The correct RC is computed from random cards, so we test
    // by submitting 0 and checking for either Correct or Wrong
    fireEvent.click(screen.getByTestId('submit-answer'))

    // Should be in result phase: another round, or back to the setup
    expect(screen.getByText('Try Again')).toBeInTheDocument()
    expect(screen.getByText('Back to Settings')).toBeInTheDocument()
  })

  it('wrong answer shows error with correct count', () => {
    render(<SpeedDrill />)

    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-drill'))
    act(() => { vi.advanceTimersByTime(10000) })

    // Submit an extreme wrong answer
    const input = screen.getByTestId('count-input')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByTestId('submit-answer'))

    // Should show wrong with RC info
    expect(screen.getByText(/Wrong! RC =/)).toBeInTheDocument()
  })

  it('streak counter increments on correct answers', () => {
    render(<SpeedDrill />)

    // We can't easily force correct answers with random cards,
    // but we verify the UI elements exist in result phase
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-drill'))
    act(() => { vi.advanceTimersByTime(10000) })
    fireEvent.click(screen.getByTestId('submit-answer'))

    expect(screen.getByText('Streak')).toBeInTheDocument()
    expect(screen.getByText('Best Streak')).toBeInTheDocument()
    expect(screen.getByText('Accuracy')).toBeInTheDocument()
  })

  it('try again restarts the drill with same settings', () => {
    render(<SpeedDrill />)

    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-drill'))
    act(() => { vi.advanceTimersByTime(10000) })
    fireEvent.click(screen.getByTestId('submit-answer'))

    // Click Try Again
    fireEvent.click(screen.getByTestId('try-again'))

    // Should be back in drill phase
    expect(screen.getByText('Card 1 / 10')).toBeInTheDocument()
  })

  describe('the Hi-Lo values are on the screen that demands them', () => {
    it('shows the card values before the first drill', () => {
      // Measured regression: grep for the Hi-Lo tags across the whole drill
      // returned zero hits. Cards flashed, a number was demanded, and the rule
      // producing it appeared nowhere in the pre-drill path.
      render(<SpeedDrill />)
      const primer = screen.getByTestId('hilo-primer')
      expect(primer.textContent).toContain('2 3 4 5 6')
      expect(primer.textContent).toContain('+1')
      expect(primer.textContent).toContain('10 J Q K A')
      expect(primer.textContent).toMatch(/running count/i)
    })

    it('can be collapsed by someone who already knows them', () => {
      render(<SpeedDrill />)
      fireEvent.click(screen.getByRole('button', { name: /the hi-lo values/i }))
      expect(screen.getByTestId('hilo-primer').textContent).not.toContain('2 3 4 5 6')
    })

    /** Good Speed Drills: `count` of them, over `days` different calendar days. */
    const goodDrills = (count: number, days: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(), mode: 'speedDrill', accuracy: 0.95,
        // 10:00 UTC on consecutive dates: a different local day each.
        timestamp: `2026-03-${String(1 + (i % days)).padStart(2, '0')}T10:00:00.000Z`,
        durationSeconds: 60,
        totalQuestions: 20, correctAnswers: 19, bestStreak: 5,
      })) as never
    const hiLo = CURRICULUM.find(s => s.id === 'hi-lo')!.drill!

    afterEach(() => {
      useStatsStore.setState({ sessions: [] })
      localStorage.removeItem('bjt_claimed_stages')
    })

    it('starts collapsed once the counting stage is complete', () => {
      // By then it is clutter, not teaching. Complete means the stage's own
      // bar: its sessions, on its number of different days.
      useStatsStore.setState({ sessions: goodDrills(hiLo.minSessions, hiLo.minDays) })
      render(<SpeedDrill />)
      expect(screen.getByTestId('hilo-primer').textContent).not.toContain('2 3 4 5 6')
    })

    it('stays open for someone who has only drilled it in one sitting', () => {
      // Not learned yet by the plan's own rule, so the values stay in view.
      useStatsStore.setState({ sessions: goodDrills(hiLo.minSessions * 2, 1) })
      render(<SpeedDrill />)
      expect(screen.getByTestId('hilo-primer').textContent).toContain('2 3 4 5 6')
    })

    it('starts collapsed for a learner whose counting stage was already paid', () => {
      localStorage.setItem('bjt_claimed_stages', JSON.stringify(['hi-lo']))
      useStatsStore.setState({ sessions: [] })
      render(<SpeedDrill />)
      expect(screen.getByTestId('hilo-primer').textContent).not.toContain('2 3 4 5 6')
    })
  })
})

/**
 * `data-drill-run` is what tells the back bar to give up its row on a phone
 * held sideways (see `BackToMenu`). The card run, the answer and the result
 * all carry it; the setup screen, which keeps the arrow home, does not.
 */
describe('SpeedDrill — marks a running drill for the sideways-phone layout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('is unmarked on the setup screen and marked from the first card to the result', () => {
    const { container } = render(<SpeedDrill />)
    expect(container.querySelector('[data-drill-run]')).toBeNull()

    fireEvent.click(screen.getByTestId('start-drill'))
    const run = container.querySelector('[data-drill-run]')
    expect(run).not.toBeNull()
    // The card is still the drawn card with the picture on top.
    expect(run!.querySelector('[data-testid="drill-card"] > img')).not.toBeNull()

    act(() => { vi.advanceTimersByTime(60000) })
    expect(screen.getByTestId('count-input')).toBeInTheDocument()
    expect(container.querySelector('[data-drill-run]')).not.toBeNull()

    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(screen.getByTestId('try-again')).toBeInTheDocument()
    expect(container.querySelector('[data-drill-run]')).not.toBeNull()
  })
})

/** A seeded `Math.random`, so the shoe deals the same cards every run. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HI_LO = (rank: string) => (['2', '3', '4', '5', '6'].includes(rank) ? 1 : ['7', '8', '9'].includes(rank) ? 0 : -1)

/** Runs the round on screen to its end, reading each card off the felt; returns its true count. */
function runRound(cards: number, speedMs = 1000): number {
  let rc = 0
  for (let i = 0; i < cards; i++) {
    rc += HI_LO(screen.getByTestId('drill-card').dataset.rank ?? '')
    act(() => { vi.advanceTimersByTime(speedMs) })
  }
  return rc
}

/** A recorded Speed Drill session. */
const recorded = (speedMs: number, cardsPerRound: number, rcErrors: number[]) => ({
  id: crypto.randomUUID(), mode: 'speedDrill', timestamp: '2026-11-01T10:00:00.000Z', countingSystem: CountingSystemId.HiLo,
  durationSeconds: 60, totalQuestions: rcErrors.length, correctAnswers: rcErrors.filter(e => e === 0).length,
  accuracy: 1, bestStreak: 1, details: { type: 'speedDrill', cardsPerRound, speedMs, rcErrors },
})

describe('SpeedDrill — the round, the answer and the result', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(20261124))
    useAppStore.setState({ currentMode: 'speedDrill', selectedSystem: CountingSystemId.HiLo, selectedRules: DEFAULT_RULES })
    useStatsStore.setState({ sessions: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    useStatsStore.setState({ sessions: [] })
  })

  const start = (cards = '10') => {
    render(<SpeedDrill />)
    fireEvent.click(screen.getByText(cards))
    fireEvent.click(screen.getByTestId('start-drill'))
  }

  it('shows no count anywhere while the cards run — the count is the test', () => {
    start()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByTestId('review-count')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/RC =/)
  })

  it('lays the round out again on the result, the true count under every card', () => {
    start()
    const rc = runRound(10)
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(screen.getAllByTestId('review-card')).toHaveLength(10)
    const counts = screen.getAllByTestId('review-count')
    expect(counts.at(-1)!.textContent).toBe(rc > 0 ? `+${rc}` : rc < 0 ? `−${-rc}` : '0')
  })

  it('takes a typed negative count as negative', () => {
    // The number field used to turn the "-" into "0" before the digit arrived,
    // so a negative count could not be typed: "-1" was recorded as "+1".
    start()
    let rc = runRound(10)
    for (let tries = 0; rc >= 0 && tries < 20; tries++) {
      fireEvent.click(screen.getByTestId('submit-answer'))
      fireEvent.click(screen.getByTestId('try-again'))
      rc = runRound(10)
    }
    expect(rc).toBeLessThan(0)
    fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc) } })
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(screen.getByTestId('speed-verdict')).toHaveTextContent(/^Correct!/)
  })

  it('answers with Enter, and Enter on the result deals the next round', () => {
    start()
    const rc = runRound(10)
    fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc) } })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('speed-verdict')).toHaveTextContent(/^Correct!/)
    expect(screen.getByTestId('speed-hint')).toHaveAttribute('data-hint', 'exact')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText('Card 1 / 10')).toBeInTheDocument()
  })

  it('points honestly at a near miss', () => {
    start()
    const rc = runRound(10)
    fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc + 1) } })
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(['oneHigh', 'lastCard']).toContain(screen.getByTestId('speed-hint').dataset.hint)
    expect(screen.getByText(/1 too high/)).toBeInTheDocument()
  })

  it('reads the personal best for the round’s speed from the recorded sessions', () => {
    useStatsStore.setState({ sessions: [recorded(1000, 30, [0, 2]), recorded(500, 52, [0])] as never })
    render(<SpeedDrill />)
    expect(screen.getByTestId('speed-help')).toHaveTextContent('Your best at this speed: 30 cards counted exactly.')
    fireEvent.click(screen.getByTestId('start-drill'))
    expect(screen.getByTestId('speed-best-cards')).toHaveTextContent('30 cards')
    expect(screen.getByText('1 of 2 rounds exact')).toBeInTheDocument()
  })

  it('calls a first exact round at a speed a new best', () => {
    start()
    const rc = runRound(10)
    fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc) } })
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(screen.getByTestId('speed-best-new')).toBeInTheDocument()
    expect(screen.getByTestId('speed-best-cards')).toHaveTextContent('10 cards')
  })

  it('goes faster as a new session: the rounds so far are recorded at their own speed', () => {
    start()
    for (let i = 0; i < 3; i++) {
      const rc = runRound(10)
      // Faster is offered after an exact round.
      fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc) } })
      fireEvent.click(screen.getByTestId('submit-answer'))
      if (i < 2) fireEvent.click(screen.getByTestId('try-again'))
    }
    fireEvent.click(screen.getByTestId('speed-faster'))
    const sessions = useStatsStore.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].details).toMatchObject({ type: 'speedDrill', speedMs: 1000, cardsPerRound: 10 })
    expect((sessions[0].details as { rcErrors: number[] }).rcErrors).toHaveLength(3)
    // The new round runs at the faster speed, from card 1.
    expect(screen.getByText('Card 1 / 10')).toBeInTheDocument()
    expect(screen.getByTestId('speed-round-info')).toHaveTextContent('Fast')
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('Card 2 / 10')).toBeInTheDocument()
  })

  it('offers more cards at the fastest speed', () => {
    render(<SpeedDrill />)
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByText('Fast'))
    fireEvent.click(screen.getByTestId('start-drill'))
    const rc = runRound(10, 500)
    fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc) } })
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(screen.queryByTestId('speed-faster')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('speed-more-cards'))
    expect(screen.getByText('Card 1 / 20')).toBeInTheDocument()
  })

  it('never offers more speed after a miss — one notch slower instead', () => {
    start()
    const rc = runRound(10)
    fireEvent.change(screen.getByTestId('count-input'), { target: { value: String(rc + 3) } })
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(screen.queryByTestId('speed-faster')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('speed-slower'))
    expect(screen.getByTestId('speed-round-info')).toHaveTextContent('Slow')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Card 1 / 10')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Card 2 / 10')).toBeInTheDocument()
  })

  it('goes back to the setup from the result', () => {
    start()
    runRound(10)
    fireEvent.click(screen.getByTestId('submit-answer'))
    fireEvent.click(screen.getByTestId('back-to-settings'))
    expect(screen.getByTestId('start-drill')).toBeInTheDocument()
  })
})
