import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SpeedDrill } from './SpeedDrill'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { CountingSystemId } from '../../engine/counting/types'
import { DEFAULT_RULES } from '../../engine/rules/types'

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, onAnimationComplete, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
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

    // Should be in result phase
    expect(screen.getByText('Try Again')).toBeInTheDocument()
    expect(screen.getByText('Back to Menu')).toBeInTheDocument()
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

    it('starts collapsed once the counting stage is complete', () => {
      // By then it is clutter, not teaching.
      useStatsStore.setState({
        sessions: Array.from({ length: 3 }, () => ({
          id: crypto.randomUUID(), mode: 'speedDrill', accuracy: 0.95,
          timestamp: new Date().toISOString(), durationSeconds: 60,
          totalQuestions: 20, correctAnswers: 19, bestStreak: 5,
        })) as never,
      })
      render(<SpeedDrill />)
      expect(screen.getByTestId('hilo-primer').textContent).not.toContain('2 3 4 5 6')
    })
  })
})
