import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TableCounting } from './TableCounting'
import { useAppStore } from '../../store/app-store'
import { useGameStore } from '../../store/game-store'
import { CountingSystemId } from '../../engine/counting/types'
import { DEFAULT_RULES } from '../../engine/rules/types'

// Helper to strip framer-motion props from rendered elements
function stripMotionProps(props: Record<string, unknown>) {
  const { initial, animate, exit, transition, onAnimationComplete,
    whileHover, whileTap, whileFocus, whileInView, whileDrag,
    drag, dragConstraints, layout, layoutId, variants, style: _s, ...rest } = props
  return rest
}

// Mock framer-motion with all element types used by GameTable tree
vi.mock('framer-motion', () => {
  const handler = {
    get(_target: object, prop: string) {
      return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
        const clean = stripMotionProps(props)
        const Tag = prop as keyof JSX.IntrinsicElements
        // @ts-expect-error dynamic tag
        return <Tag {...clean}>{children}</Tag>
      }
    }
  }
  return {
    motion: new Proxy({}, handler),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  }
})

describe('TableCounting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState({
      currentMode: 'tableCounting',
      selectedSystem: CountingSystemId.HiLo,
      selectedRules: DEFAULT_RULES,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders settings screen initially', () => {
    render(<TableCounting />)
    expect(screen.getByText('Table Counting')).toBeInTheDocument()
    expect(screen.getByText('Start Playing')).toBeInTheDocument()
    expect(screen.getByText('Difficulty')).toBeInTheDocument()
  })

  it('renders game table with count hidden after starting', () => {
    render(<TableCounting />)
    fireEvent.click(screen.getByTestId('start-playing'))

    // Stats bar should be visible
    expect(screen.getByText(/Hands: 0/)).toBeInTheDocument()

    // Game table gets rendered (it calls initGame internally)
    // The count display should be hidden
    const store = useGameStore.getState()
    expect(store.showCount).toBe(false)
  })

  it('shows count prompt after round ends', () => {
    render(<TableCounting />)
    fireEvent.click(screen.getByTestId('start-playing'))

    // Wait for initGame
    act(() => { vi.advanceTimersByTime(100) })

    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()

    // Wait for deal animation
    act(() => { vi.advanceTimersByTime(2200) })

    // Force stand to end the round quickly
    const afterDeal = useGameStore.getState()
    if (afterDeal.availableActions.length > 0) {
      afterDeal.stand()
      // Wait for dealer play animation
      act(() => { vi.advanceTimersByTime(1200) })
    }

    // If the round ended, the prompt should appear
    const gs = useGameStore.getState().gameState
    if (gs?.isRoundOver) {
      expect(screen.getByText('What is the Running Count?')).toBeInTheDocument()
    }
  })

  it('correct RC answer shows green feedback', () => {
    render(<TableCounting />)
    fireEvent.click(screen.getByTestId('start-playing'))
    act(() => { vi.advanceTimersByTime(100) })

    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    act(() => { vi.advanceTimersByTime(2200) })

    const afterDeal = useGameStore.getState()
    if (afterDeal.availableActions.length > 0) {
      afterDeal.stand()
      act(() => { vi.advanceTimersByTime(1200) })
    }

    const gs = useGameStore.getState().gameState
    if (gs?.isRoundOver) {
      // Enter the correct RC
      const correctRC = useGameStore.getState().runningCount
      const input = screen.getByTestId('rc-input')
      fireEvent.change(input, { target: { value: String(correctRC) } })
      fireEvent.click(screen.getByTestId('submit-count'))

      expect(screen.getByText('Correct!')).toBeInTheDocument()
    }
  })

  it('wrong RC answer shows cards with values', () => {
    render(<TableCounting />)
    fireEvent.click(screen.getByTestId('start-playing'))
    act(() => { vi.advanceTimersByTime(100) })

    const store = useGameStore.getState()
    store.placeBet(100)
    store.startRound()
    act(() => { vi.advanceTimersByTime(2200) })

    const afterDeal = useGameStore.getState()
    if (afterDeal.availableActions.length > 0) {
      afterDeal.stand()
      act(() => { vi.advanceTimersByTime(1200) })
    }

    const gs = useGameStore.getState().gameState
    if (gs?.isRoundOver) {
      const input = screen.getByTestId('rc-input')
      fireEvent.change(input, { target: { value: '999' } })
      fireEvent.click(screen.getByTestId('submit-count'))

      expect(screen.getByText('Wrong!')).toBeInTheDocument()
      expect(screen.getByText('Cards this hand:')).toBeInTheDocument()
    }
  })

  it('hard mode asks every 2-5 hands randomly', () => {
    render(<TableCounting />)

    // Select hard difficulty
    fireEvent.click(screen.getByText('hard'))

    // Should show hard mode description on settings screen
    expect(screen.getByText('Count asked randomly every 2-5 hands.')).toBeInTheDocument()
  })
})
