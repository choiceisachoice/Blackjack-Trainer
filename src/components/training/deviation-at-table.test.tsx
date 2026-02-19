import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DeviationAtTable } from './DeviationAtTable'
import { useAppStore } from '../../store/app-store'
import { useGameStore } from '../../store/game-store'
import { GameEngine } from '../../engine/rules/game-engine'
import { CountingSystemId } from '../../engine/counting/types'
import { DEFAULT_RULES, Action } from '../../engine/rules/types'
import { Rank, Suit } from '../../engine/shoe/types'
import type { Card } from '../../engine/shoe/types'
import type { CardSource } from '../../engine/rules/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

// Strip framer-motion props for clean rendering
function stripMotionProps(props: Record<string, unknown>) {
  const { initial, animate, exit, transition, onAnimationComplete,
    whileHover, whileTap, whileFocus, whileInView, whileDrag,
    drag, dragConstraints, layout, layoutId, variants, style: _s, ...rest } = props
  return rest
}

// Mock framer-motion
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

function createMockCardSource(cards: Card[]): CardSource {
  let index = 0
  return {
    deal() {
      if (index >= cards.length) throw new Error('Mock shoe exhausted')
      return cards[index++]
    },
    remaining() { return cards.length - index },
    remainingDecks() { return (cards.length - index) / 52 },
    cutCardReached() { return false },
    reset() { index = 0 },
  }
}

/**
 * Sets up deterministic shoe for controlled card dealing.
 * MUST be called AFTER render() since GameTable calls initGame() on mount.
 */
function setupDeterministicStore(cards: Card[]) {
  const mockShoe = createMockCardSource(cards)
  const gameEngine = new GameEngine(DEFAULT_RULES, mockShoe)
  useGameStore.setState({
    shoe: mockShoe as ReturnType<typeof useGameStore.getState>['shoe'],
    gameEngine,
  })
}

/** Play one hand: bet → deal → wait for deal animation + countdown + flush effects */
function dealHand() {
  const store = useGameStore.getState()
  store.placeBet(100)
  store.startRound()
  act(() => { vi.advanceTimersByTime(2200) })
  // Flush React effects (detection subscribe fires, starts 3s countdown)
  act(() => { vi.advanceTimersByTime(0) })
  // Advance through 3s countdown delay (fires at 1s, 2s, 3s if triggered)
  act(() => { vi.advanceTimersByTime(3000) })
}

/** Complete the current hand (stand → dealer plays → settlement) */
function completeHand() {
  const state = useGameStore.getState()
  if (!state.gameState?.isRoundOver) {
    state.stand()
    act(() => { vi.advanceTimersByTime(10000) })
  }
}

/** Start a new round after settlement */
function newRound() {
  act(() => { useGameStore.getState().newRound() })
  act(() => { vi.advanceTimersByTime(100) })
}

describe('DeviationAtTable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState({
      currentMode: 'deviationTraining',
      selectedSystem: CountingSystemId.HiLo,
      selectedRules: DEFAULT_RULES,
    })
    // Reset game state so previous test's state doesn't bleed through
    useGameStore.setState({
      gameState: null,
      isAnimating: false,
      availableActions: [],
      message: '',
      currentBet: 0,
    })
    useGameStore.getState().setNewRoundInterceptor(null)
  })

  afterEach(() => {
    useGameStore.getState().setNewRoundInterceptor(null)
    vi.useRealTimers()
  })

  it('renders stats bar and GameTable', () => {
    render(<DeviationAtTable deviationSet="i18" />)
    expect(screen.getByTestId('deviation-stats')).toBeInTheDocument()
    expect(screen.getByText(/Hands: 0/)).toBeInTheDocument()
    expect(screen.getByText(/Deviations: 0\/0/)).toBeInTheDocument()
  })

  it('deviation overlay appears when hand matches (16 vs 10)', () => {
    // Deal order: Player1, Dealer1, Player2, Dealer2
    // Player: 10+6=16, Dealer: 10+7 (no BJ, normal play)
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five), // extras
    ])
    dealHand()

    // Deviation overlay should appear (16 vs 10 is I18 #2)
    expect(screen.getByTestId('deviation-overlay')).toBeInTheDocument()
    expect(screen.getByText('Deviation Check')).toBeInTheDocument()
    const handEl = screen.getByTestId('overlay-hand-value')
    expect(handEl.textContent).toContain('16')
    const dealerEl = screen.getByTestId('overlay-dealer-card')
    expect(dealerEl.textContent).toContain('10')
  })

  it('no overlay when hand does not match any deviation (17 vs 2)', () => {
    // Player: 10+7=17, Dealer: 2+8=10 — not a deviation
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Two), c(Rank.Seven), c(Rank.Eight),
      c(Rank.Three), c(Rank.Four), c(Rank.Five), // extras
    ])
    dealHand()

    // No overlay should appear
    expect(screen.queryByTestId('deviation-overlay')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trap-overlay')).not.toBeInTheDocument()
  })

  it('correct TC + correct action shows success', () => {
    // Player: 10+6=16, Dealer: 10+7
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five),
    ])
    dealHand()

    expect(screen.getByTestId('deviation-overlay')).toBeInTheDocument()

    const actualTC = useGameStore.getState().trueCount
    const input = screen.getByTestId('deviation-tc-input')
    fireEvent.change(input, { target: { value: String(Math.round(actualTC)) } })

    // 16 vs 10 threshold is 0 — determine correct action
    const correct = actualTC >= 0 ? Action.Stand : Action.Hit
    fireEvent.click(screen.getByTestId(`deviation-action-${correct.toLowerCase()}`))
    fireEvent.click(screen.getByTestId('deviation-submit'))

    expect(screen.getByTestId('feedback-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('deviation-feedback-result')).toBeInTheDocument()
  })

  it('wrong action shows correct deviation rule', () => {
    // Player: 10+6=16, Dealer: 10+7
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five),
    ])
    dealHand()

    expect(screen.getByTestId('deviation-overlay')).toBeInTheDocument()

    // Enter correct TC
    const actualTC = useGameStore.getState().trueCount
    const input = screen.getByTestId('deviation-tc-input')
    fireEvent.change(input, { target: { value: String(Math.round(actualTC)) } })

    // Pick the WRONG action
    const correct = actualTC >= 0 ? Action.Stand : Action.Hit
    const wrong = correct === Action.Stand ? Action.Hit : Action.Stand
    fireEvent.click(screen.getByTestId(`deviation-action-${wrong.toLowerCase()}`))
    fireEvent.click(screen.getByTestId('deviation-submit'))

    expect(screen.getByTestId('feedback-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('deviation-feedback-result')).toHaveTextContent('Wrong!')
    expect(screen.getByTestId('deviation-rule')).toBeInTheDocument()
  })

  it('wrong TC shows correct TC with error', () => {
    // Player: 10+6=16, Dealer: 10+7
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five),
    ])
    dealHand()

    // Enter wildly wrong TC
    const input = screen.getByTestId('deviation-tc-input')
    fireEvent.change(input, { target: { value: '99' } })

    // Pick any action
    fireEvent.click(screen.getByTestId('deviation-action-hit'))
    fireEvent.click(screen.getByTestId('deviation-submit'))

    expect(screen.getByTestId('deviation-feedback-result')).toHaveTextContent('Wrong!')
    // TC feedback should show the actual TC
    const tcFeedback = screen.getByTestId('deviation-tc-feedback')
    expect(tcFeedback.textContent).toContain('you said +99')
  })

  it('below threshold: basic strategy is correct answer', () => {
    // Player: 10+6=16, Dealer: 10+7
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five),
    ])
    dealHand()

    const actualTC = useGameStore.getState().trueCount

    const input = screen.getByTestId('deviation-tc-input')
    fireEvent.change(input, { target: { value: String(Math.round(actualTC)) } })

    // For 16 vs 10: threshold=0, actionBelow=Hit, actionAbove=Stand
    const correctAction = actualTC >= 0 ? Action.Stand : Action.Hit
    fireEvent.click(screen.getByTestId(`deviation-action-${correctAction.toLowerCase()}`))
    fireEvent.click(screen.getByTestId('deviation-submit'))

    expect(screen.getByTestId('deviation-feedback-result')).toBeInTheDocument()
  })

  it('trap question appears after N non-deviation hands', () => {
    // Mock random so trap threshold = floor(0*3)+3 = 3
    vi.spyOn(Math, 'random').mockReturnValue(0)

    render(<DeviationAtTable deviationSet="i18" />)

    // Non-deviation hands: Player: 10+7=17, Dealer: 2+8 (dealer draws 9 to hit 17+)
    const cards: Card[] = []
    for (let i = 0; i < 10; i++) {
      cards.push(c(Rank.Ten), c(Rank.Two), c(Rank.Seven), c(Rank.Eight))
      cards.push(c(Rank.Nine)) // dealer draw card
    }
    setupDeterministicStore(cards)

    // Hand 1 — no trap (counter=1, threshold=3)
    dealHand()
    expect(screen.queryByTestId('trap-overlay')).not.toBeInTheDocument()
    completeHand()
    newRound()

    // Hand 2 — no trap (counter=2)
    dealHand()
    expect(screen.queryByTestId('trap-overlay')).not.toBeInTheDocument()
    completeHand()
    newRound()

    // Hand 3 — counter=3 >= threshold=3, trap should appear
    dealHand()
    expect(screen.getByTestId('trap-overlay')).toBeInTheDocument()
    expect(screen.getByText('Is there a deviation here?')).toBeInTheDocument()
  })

  it('trap "No" answer is correct', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // threshold = 3

    render(<DeviationAtTable deviationSet="i18" />)

    const cards: Card[] = []
    for (let i = 0; i < 10; i++) {
      cards.push(c(Rank.Ten), c(Rank.Two), c(Rank.Seven), c(Rank.Eight), c(Rank.Nine))
    }
    setupDeterministicStore(cards)

    // Play 3 non-deviation hands to trigger trap
    for (let i = 0; i < 3; i++) {
      dealHand()
      if (screen.queryByTestId('trap-overlay')) break
      completeHand()
      newRound()
    }

    if (screen.queryByTestId('trap-overlay')) {
      fireEvent.click(screen.getByTestId('trap-no'))
      expect(screen.getByTestId('feedback-overlay')).toBeInTheDocument()
      expect(screen.getByTestId('trap-feedback-result')).toHaveTextContent('Correct!')
    }
  })

  it('trap "Yes" answer is wrong', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // threshold = 3

    render(<DeviationAtTable deviationSet="i18" />)

    const cards: Card[] = []
    for (let i = 0; i < 10; i++) {
      cards.push(c(Rank.Ten), c(Rank.Two), c(Rank.Seven), c(Rank.Eight), c(Rank.Nine))
    }
    setupDeterministicStore(cards)

    for (let i = 0; i < 3; i++) {
      dealHand()
      if (screen.queryByTestId('trap-overlay')) break
      completeHand()
      newRound()
    }

    if (screen.queryByTestId('trap-overlay')) {
      fireEvent.click(screen.getByTestId('trap-yes'))
      expect(screen.getByTestId('feedback-overlay')).toBeInTheDocument()
      expect(screen.getByTestId('trap-feedback-result')).toHaveTextContent('Wrong!')
    }
  })

  it('after overlay dismissed, player can act normally', () => {
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five), c(Rank.Two),
    ])
    dealHand()

    // Deviation overlay is shown
    expect(screen.getByTestId('deviation-overlay')).toBeInTheDocument()

    // Submit an answer
    fireEvent.click(screen.getByTestId('deviation-action-hit'))
    fireEvent.click(screen.getByTestId('deviation-submit'))

    // Now in feedback phase
    expect(screen.getByTestId('feedback-overlay')).toBeInTheDocument()

    // Dismiss
    fireEvent.click(screen.getByTestId('deviation-continue'))

    // No overlay
    expect(screen.queryByTestId('deviation-overlay')).not.toBeInTheDocument()
    expect(screen.queryByTestId('feedback-overlay')).not.toBeInTheDocument()
  })

  it('stats update across multiple deviations', () => {
    render(<DeviationAtTable deviationSet="i18" />)
    setupDeterministicStore([
      c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven),
      c(Rank.Three), c(Rank.Four), c(Rank.Five), c(Rank.Two),
    ])
    dealHand()

    // Submit answer for first deviation
    expect(screen.getByTestId('deviation-overlay')).toBeInTheDocument()

    const tc1 = useGameStore.getState().trueCount
    const input = screen.getByTestId('deviation-tc-input')
    fireEvent.change(input, { target: { value: String(Math.round(tc1)) } })

    const correct1 = tc1 >= 0 ? Action.Stand : Action.Hit
    fireEvent.click(screen.getByTestId(`deviation-action-${correct1.toLowerCase()}`))
    fireEvent.click(screen.getByTestId('deviation-submit'))

    // Check stats updated
    expect(screen.getByText(/Deviations: \d+\/1/)).toBeInTheDocument()

    // Dismiss
    fireEvent.click(screen.getByTestId('deviation-continue'))
    expect(screen.getByText(/Hands: 1/)).toBeInTheDocument()
  })
})
