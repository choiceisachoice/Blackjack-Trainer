import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DeckEstimation } from './DeckEstimation'
import { useLevelStore } from '../../store/level-store'
import { levelSystem } from '../../services/level-system'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, onAnimationComplete, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  // Components ask for the motion preference directly; a mock without it
  // renders `undefined` where a hook's result is expected.
  useReducedMotion: () => false,
}))

// Deterministic random values
let mockRandomIndex = 0

function setMockRandom(values: number[]) {
  mockRandomIndex = 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const val = values[mockRandomIndex % values.length]
    mockRandomIndex++
    return val
  })
}

describe('DeckEstimation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders settings screen with deck options', () => {
    render(<DeckEstimation />)

    expect(screen.getByText('Deck Estimation')).toBeInTheDocument()
    expect(screen.getByText('6 Decks')).toBeInTheDocument()
    expect(screen.getByText('8 Decks')).toBeInTheDocument()
    // 2-deck was removed (hand-pitched in reality, not a shoe game)
    expect(screen.queryByText('2 Decks')).not.toBeInTheDocument()
    expect(screen.getByText('Half Decks')).toBeInTheDocument()
    expect(screen.getByText('Whole Decks')).toBeInTheDocument()
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText('Quick Fire')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('shows the discard tray visual without revealing the answer', () => {
    setMockRandom([0.5, 0.5])

    render(<DeckEstimation />)
    fireEvent.click(screen.getByTestId('start-training'))

    // Discard-tray scene should be present
    const visual = screen.getByTestId('discard-visual')
    expect(visual).toBeInTheDocument()
    expect(screen.getByText('How many decks remain?')).toBeInTheDocument()

    // It must not leak the answer: no percentage, no "decks remaining" text
    expect(visual.textContent).not.toMatch(/%/)
    expect(visual.textContent).not.toMatch(/remaining/i)
  })

  it('correct estimation within tolerance shows success', () => {
    // u=0.5 (30-80%), fraction random=0.5 → 0.55 → 172 cards → 3.31 decks
    // Closest half-deck option: 3.5 → error = |3.5 - 3.31| = 0.19 < 0.5 → correct
    setMockRandom([0.5, 0.5])

    render(<DeckEstimation />)
    fireEvent.click(screen.getByTestId('start-training'))
    fireEvent.click(screen.getByTestId('deck-3.5'))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent(/Correct|Close enough/)
  })

  it('wrong estimation shows error with correct value', () => {
    // Same setup: 172 cards → 3.31 decks
    // Pick 1 deck → error = |1 - 3.31| = 2.31 > 0.5 → wrong
    setMockRandom([0.5, 0.5])

    render(<DeckEstimation />)
    fireEvent.click(screen.getByTestId('start-training'))
    fireEvent.click(screen.getByTestId('deck-1'))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('feedback-explanation')).toHaveTextContent(/decks remaining/)
  })

  it('tracks average error statistic', () => {
    // 172 cards → 3.31 decks, pick 3.5 → error ~0.19
    setMockRandom([0.5, 0.5, 0.5, 0.5])

    render(<DeckEstimation />)
    fireEvent.click(screen.getByTestId('start-training'))
    fireEvent.click(screen.getByTestId('deck-3.5'))

    // Feedback should show avg error
    expect(screen.getByText(/Avg Error/)).toBeInTheDocument()
  })

  it('half-deck mode shows 0.5 increment buttons', () => {
    setMockRandom([0.5, 0.5])

    render(<DeckEstimation />)
    // Default is half decks + 6 decks
    fireEvent.click(screen.getByTestId('start-training'))

    // Should have 0.5 step buttons including fractional values
    expect(screen.getByTestId('deck-0.5')).toBeInTheDocument()
    expect(screen.getByTestId('deck-1')).toBeInTheDocument()
    expect(screen.getByTestId('deck-1.5')).toBeInTheDocument()
    expect(screen.getByTestId('deck-3')).toBeInTheDocument()
    expect(screen.getByTestId('deck-6')).toBeInTheDocument()
  })

  it('whole-deck mode shows integer buttons only', () => {
    setMockRandom([0.5, 0.5])

    render(<DeckEstimation />)
    // Switch to whole decks
    fireEvent.click(screen.getByText('Whole Decks'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Should have integer buttons only
    expect(screen.getByTestId('deck-1')).toBeInTheDocument()
    expect(screen.getByTestId('deck-2')).toBeInTheDocument()
    expect(screen.getByTestId('deck-6')).toBeInTheDocument()

    // Should NOT have fractional buttons
    expect(screen.queryByTestId('deck-0.5')).not.toBeInTheDocument()
    expect(screen.queryByTestId('deck-1.5')).not.toBeInTheDocument()
  })

  it('quick fire mode has 3 second timer per round', () => {
    vi.useFakeTimers()
    setMockRandom([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])

    render(<DeckEstimation />)
    fireEvent.click(screen.getByTestId('quick-fire-toggle'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Timer should show 3
    expect(screen.getByTestId('qf-timer')).toHaveTextContent('3')

    // Advance 1 second
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('qf-timer')).toHaveTextContent('2')

    // Advance 1 more second
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('qf-timer')).toHaveTextContent('1')

    // Advance 1 more → time's up
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByTestId('feedback-result')).toHaveTextContent("Time’s up!")
  })

  /**
   * The round count is a setting now, not a Quick-Fire-only rule.
   *
   * This test used to assert a hard-coded ten, which was the whole defect on
   * the other side: the untimed mode had no count at all and simply never
   * ended. One setting drives both modes; Quick Fire adds the clock and
   * nothing else.
   */
  it('ends after the chosen number of rounds', () => {
    vi.useFakeTimers()
    setMockRandom(Array.from({ length: 60 }, () => 0.5))

    render(<DeckEstimation />)
    fireEvent.click(screen.getByTestId('quick-fire-toggle'))
    fireEvent.click(screen.getByText('10'))          // pick the shortest session
    fireEvent.click(screen.getByTestId('start-training'))

    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId('deck-3'))
      fireEvent.click(screen.getByTestId('next-question'))
    }

    expect(screen.getByTestId('summary-title')).toHaveTextContent('Quick Fire Complete!')
  })

  /**
   * The reported bug, end to end.
   *
   * XP was credited on unmount — correctly, and invisibly. The player watched
   * the summary appear and nothing happened; the payout landed later, during
   * navigation, in a component being torn down. This asserts the payout has
   * arrived by the time the summary is on screen, which is the only moment it
   * can mean anything to the person who earned it.
   */
  it('pays the XP when the summary appears, not when the mode is left', () => {
    vi.useFakeTimers()
    setMockRandom(Array.from({ length: 60 }, () => 0.5))
    levelSystem.resetAll()
    useLevelStore.setState({ lastAward: null })

    const { unmount } = render(<DeckEstimation />)
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-training'))

    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId('deck-3'))
      fireEvent.click(screen.getByTestId('next-question'))
    }

    // Summary is up — and so is the XP.
    expect(screen.getByTestId('summary-title')).toBeInTheDocument()
    const award = useLevelStore.getState().lastAward
    expect(award).not.toBeNull()
    expect(award!.amount).toBeGreaterThan(0)
    expect(award!.labelKey).toBe('xp.source.session')

    const paid = levelSystem.getTotalXP()
    expect(paid).toBeGreaterThan(0)

    // Leaving must not pay a second time: `savedRef` makes finish/unmount/
    // pagehide idempotent, and a double payout would be worse than none.
    unmount()
    expect(levelSystem.getTotalXP()).toBe(paid)
  })

  it('ends the untimed mode too — it used to run forever', () => {
    // The reported bug: every other mode lets you choose how many questions,
    // Deck Estimation did not, and a normal session had no end condition.
    vi.useFakeTimers()
    setMockRandom(Array.from({ length: 60 }, () => 0.5))

    render(<DeckEstimation />)
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByTestId('start-training'))

    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getByTestId('deck-3'))
      fireEvent.click(screen.getByTestId('next-question'))
    }

    expect(screen.getByTestId('summary-title')).toBeInTheDocument()
  })
})
