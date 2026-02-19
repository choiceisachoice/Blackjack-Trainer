import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeviationTraining } from './DeviationTraining'
import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'
import { getDeviations } from './deviation-utils'
import { Action } from '../../engine/rules/types'

// Mock framer-motion (needed when DeviationAtTable renders GameTable)
function stripMotionProps(props: Record<string, unknown>) {
  const { initial, animate, exit, transition, onAnimationComplete,
    whileHover, whileTap, whileFocus, whileInView, whileDrag,
    drag, dragConstraints, layout, layoutId, variants, style: _s, ...rest } = props
  return rest
}

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
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  }
})

// Stable random for deterministic tests
let mockRandomIndex = 0
const mockRandomValues = [
  0.1, // deviation index selection (picks early in array)
  0.7, // isAbove = false (>= 0.5)
  0.3, // TC offset
  0.2, // next question deviation index
  0.2, // isAbove = true (< 0.5)
  0.1, // TC offset
  0.5, // deviation index
  0.4, // isAbove = true
  0.2, // TC offset
  0.6, 0.3, 0.8, 0.1, 0.9, 0.4, 0.7, 0.2, 0.5, 0.3, 0.6, // extras
]

describe('getDeviations', () => {
  it('returns correct sets and counts', () => {
    const i18 = getDeviations('i18')
    const fab4 = getDeviations('fab4')
    const all = getDeviations('all')

    expect(i18).toHaveLength(18)
    expect(fab4).toHaveLength(4)
    expect(all).toHaveLength(22)

    expect(i18.every(d => d.isIllustrious18)).toBe(true)
    expect(i18.every(d => !d.isFab4)).toBe(true)
    expect(fab4.every(d => d.isFab4)).toBe(true)
    expect(fab4.every(d => !d.isIllustrious18)).toBe(true)
  })
})

describe('DeviationTraining', () => {
  beforeEach(() => {
    mockRandomIndex = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const val = mockRandomValues[mockRandomIndex % mockRandomValues.length]
      mockRandomIndex++
      return val
    })
  })

  it('renders settings screen with deviation set options', () => {
    render(<DeviationTraining />)

    expect(screen.getByText('Deviation Training')).toBeInTheDocument()
    expect(screen.getByText('Illustrious 18')).toBeInTheDocument()
    expect(screen.getByText('Fab 4')).toBeInTheDocument()
    expect(screen.getByText('All 22')).toBeInTheDocument()
    expect(screen.getByText('Flash Cards')).toBeInTheDocument()
    expect(screen.getByText('At the Table')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('flash card shows hand, dealer card, and true count', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    // Should show situation elements
    expect(screen.getByTestId('player-hand')).toBeInTheDocument()
    expect(screen.getByTestId('dealer-card')).toBeInTheDocument()
    expect(screen.getByTestId('true-count')).toBeInTheDocument()
    expect(screen.getByText('What do you do?')).toBeInTheDocument()
  })

  it('correct deviation action shows success', () => {
    // Mock: picks deviation[1] (16 vs 10, threshold 0), isAbove=false → BS=Hit
    // With isAbove=false (random >= 0.5), correct action = actionBelow = Hit
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    // The question is about a deviation - find the correct action from the UI
    // Click the action that matches correctAction for below threshold (actionBelow)
    const deviation = ILLUSTRIOUS_18[Math.floor(0.1 * ILLUSTRIOUS_18.length)]
    const correctAction = deviation.actionBelow // isAbove is false (0.7 >= 0.5)

    fireEvent.click(screen.getByTestId(`action-${correctAction.toLowerCase()}`))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
  })

  it('wrong action shows error with correct deviation rule', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    // Pick the wrong action: if correct is Hit, click Stand (or vice versa)
    const deviation = ILLUSTRIOUS_18[Math.floor(0.1 * ILLUSTRIOUS_18.length)]
    const correctAction = deviation.actionBelow
    const wrongAction = correctAction === Action.Hit ? Action.Stand : Action.Hit

    fireEvent.click(screen.getByTestId(`action-${wrongAction.toLowerCase()}`))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('feedback-explanation')).toBeInTheDocument()
  })

  it('below threshold: basic strategy is correct answer', () => {
    // First question: random values make isAbove = false (0.7 >= 0.5)
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    // Below threshold → Basic Strategy is correct
    const deviation = ILLUSTRIOUS_18[Math.floor(0.1 * ILLUSTRIOUS_18.length)]
    const bsAction = deviation.actionBelow

    fireEvent.click(screen.getByTestId(`action-${bsAction.toLowerCase()}`))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
    expect(screen.getByTestId('feedback-explanation').textContent).toContain('Basic Strategy')
  })

  it('above threshold: deviation action is correct answer', () => {
    // Reset random to get isAbove = true on first question
    mockRandomIndex = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const aboveValues = [0.1, 0.2, 0.3] // deviation index, isAbove=true (< 0.5), TC offset
      const val = aboveValues[mockRandomIndex % aboveValues.length]
      mockRandomIndex++
      return val
    })

    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    const deviation = ILLUSTRIOUS_18[Math.floor(0.1 * ILLUSTRIOUS_18.length)]
    const deviationAction = deviation.actionAbove

    fireEvent.click(screen.getByTestId(`action-${deviationAction.toLowerCase()}`))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
  })

  it('tracks accuracy statistics', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByTestId('start-training'))

    // Answer first question correctly
    const deviation = ILLUSTRIOUS_18[Math.floor(0.1 * ILLUSTRIOUS_18.length)]
    const correctAction = deviation.actionBelow // isAbove=false
    fireEvent.click(screen.getByTestId(`action-${correctAction.toLowerCase()}`))

    // Should show stats
    expect(screen.getByText(/Correct: 1\/1/)).toBeInTheDocument()
    expect(screen.getByText(/100%/)).toBeInTheDocument()

    // Go to next question
    fireEvent.click(screen.getByTestId('next-question'))

    // Stats should persist
    expect(screen.getByText(/Correct: 1\/1/)).toBeInTheDocument()
  })

  it('"Coming soon" text is not shown', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByText('At the Table'))
    expect(screen.queryByText(/Coming soon/)).not.toBeInTheDocument()
  })

  it('At the Table mode navigates to at-the-table component', () => {
    render(<DeviationTraining />)
    fireEvent.click(screen.getByText('At the Table'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Should render DeviationAtTable's stats bar
    expect(screen.getByTestId('deviation-stats')).toBeInTheDocument()
    // Settings screen should be gone
    expect(screen.queryByText('Deviation Training')).not.toBeInTheDocument()
  })

  it('Fab 4 set only shows Fab 4 deviations in flash cards', () => {
    // Provide enough random values for 5 questions (3 randoms each: index, isAbove, TC offset)
    const randoms = [
      0.1, 0.3, 0.2,
      0.4, 0.7, 0.1,
      0.7, 0.2, 0.4,
      0.9, 0.6, 0.3,
      0.0, 0.1, 0.5,
    ]
    let randIdx = 0
    vi.spyOn(Math, 'random').mockImplementation(() => randoms[randIdx++ % randoms.length])

    render(<DeviationTraining />)
    fireEvent.click(screen.getByText('Fab 4'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Fab 4 deviations have hands: 14 or 15, dealers: 10, 9, or A
    for (let i = 0; i < 5; i++) {
      const hand = screen.getByTestId('player-hand').textContent!
      expect(['14', '15']).toContain(hand)

      // Answer and proceed to next question
      fireEvent.click(screen.getByTestId('action-hit'))
      if (i < 4) {
        fireEvent.click(screen.getByTestId('next-question'))
      }
    }
  })

  it('I18 set only shows I18 deviations in flash cards', () => {
    // Enough randoms for 5 questions
    const randoms = [
      0.05, 0.3, 0.2,
      0.3, 0.7, 0.1,
      0.5, 0.2, 0.4,
      0.8, 0.6, 0.3,
      0.95, 0.1, 0.5,
    ]
    let randIdx = 0
    vi.spyOn(Math, 'random').mockImplementation(() => randoms[randIdx++ % randoms.length])

    render(<DeviationTraining />)
    // I18 is the default, but click it explicitly
    fireEvent.click(screen.getByText('Illustrious 18'))
    fireEvent.click(screen.getByTestId('start-training'))

    for (let i = 0; i < 5; i++) {
      // Answer to get to feedback, then check the label says "I18" (not "Fab 4")
      fireEvent.click(screen.getByTestId('action-hit'))
      expect(screen.getByText(/I18:/)).toBeInTheDocument()
      expect(screen.queryByText(/Fab 4:/)).not.toBeInTheDocument()

      if (i < 4) {
        fireEvent.click(screen.getByTestId('next-question'))
      }
    }
  })
})
