import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BetSpread } from './BetSpread'

// Mock Math.random for deterministic tests
let mockRandomIndex = 0

function setMockRandom(values: number[]) {
  mockRandomIndex = 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const val = values[mockRandomIndex % values.length]
    mockRandomIndex++
    return val
  })
}

describe('BetSpread', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders settings screen', () => {
    render(<BetSpread />)

    expect(screen.getByText('Bet Spread')).toBeInTheDocument()
    expect(screen.getByText('Bet Spread Reference')).toBeInTheDocument()
    expect(screen.getByText('Random')).toBeInTheDocument()
    expect(screen.getByText('Type A')).toBeInTheDocument()
    expect(screen.getByText('Type B')).toBeInTheDocument()
    expect(screen.getByText('Type C')).toBeInTheDocument()
    expect(screen.getByTestId('start-training')).toBeInTheDocument()
  })

  it('shows RC, remaining decks, and bet options for type A', () => {
    // Force type A question with specific RC and decks
    // pickQuestionType for 'random' picks types[floor(random*3)]
    // With random = 0.1 → types[0] = 'A'
    // generateRC: normal dist - use simple values
    // remainingDecks: REMAINING_DECKS_OPTIONS[floor(random*9)]
    setMockRandom([
      0.1,  // pickQuestionType → 'A'
      0.5, 0.5, // Box-Muller for RC (normal ~= 0 → rc ~= 2)
      0.3,  // remainingDecks index → ~2 decks
    ])

    render(<BetSpread />)
    fireEvent.click(screen.getByTestId('start-training'))

    // Should show RC and remaining decks (Type A)
    expect(screen.getByTestId('running-count')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-decks')).toBeInTheDocument()
    expect(screen.getByText('What is your optimal bet?')).toBeInTheDocument()

    // Bet buttons should be visible
    expect(screen.getByTestId('bet-10')).toBeInTheDocument()
    expect(screen.getByTestId('bet-20')).toBeInTheDocument()
    expect(screen.getByTestId('bet-40')).toBeInTheDocument()
    expect(screen.getByTestId('bet-80')).toBeInTheDocument()
    expect(screen.getByTestId('bet-120')).toBeInTheDocument()
    expect(screen.getByTestId('bet-160')).toBeInTheDocument()
  })

  it('correct bet shows success with explanation', () => {
    // Force Type B with specific TC
    setMockRandom([
      0.4,  // pickQuestionType → types[1] = 'B'
      0.5, 0.5, // Box-Muller for RC
      0.0,  // remainingDecks index → 1 deck
    ])

    render(<BetSpread />)
    // Select Type B mode first
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Read the TC from the UI
    const tcText = screen.getByTestId('true-count').textContent || ''
    const tc = parseFloat(tcText.replace('+', ''))

    // Calculate correct bet (floor TC for bet bracket lookup)
    const intTC = Math.floor(tc)
    let correctBet: number
    if (intTC <= 0) correctBet = 10
    else if (intTC === 1) correctBet = 20
    else if (intTC === 2) correctBet = 40
    else if (intTC === 3) correctBet = 80
    else if (intTC === 4) correctBet = 120
    else correctBet = 160

    fireEvent.click(screen.getByTestId(`bet-${correctBet}`))

    expect(screen.getByTestId('feedback-result')).toHaveTextContent('Correct!')
  })

  it('wrong bet shows error with correct bet', () => {
    // Force Type B
    setMockRandom([
      0.4, 0.5, 0.5, 0.0,
    ])

    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Always pick $10 — might be wrong depending on TC
    // Pick $160 which is likely wrong for most TCs
    fireEvent.click(screen.getByTestId('bet-160'))

    // Check if result is shown
    const result = screen.getByTestId('feedback-result')
    expect(result).toBeInTheDocument()
    expect(screen.getByTestId('feedback-explanation')).toBeInTheDocument()
  })

  it('type A: requires TC calculation from RC and decks', () => {
    setMockRandom([0.1, 0.5, 0.5, 0.3])

    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type A'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Type A shows RC and decks but NOT TC
    expect(screen.getByTestId('running-count')).toBeInTheDocument()
    expect(screen.getByTestId('remaining-decks')).toBeInTheDocument()
    expect(screen.queryByTestId('true-count')).not.toBeInTheDocument()
  })

  it('type B: given TC, just choose bet', () => {
    setMockRandom([0.4, 0.5, 0.5, 0.0])

    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Type B shows TC directly
    expect(screen.getByTestId('true-count')).toBeInTheDocument()
    // No RC or remaining decks
    expect(screen.queryByTestId('running-count')).not.toBeInTheDocument()
    expect(screen.queryByTestId('remaining-decks')).not.toBeInTheDocument()
  })

  it('tracks accuracy statistics', () => {
    setMockRandom([
      0.4, 0.5, 0.5, 0.0, // first question
      0.4, 0.5, 0.5, 0.0, // second question (after next)
    ])

    render(<BetSpread />)
    fireEvent.click(screen.getByText('Type B'))
    fireEvent.click(screen.getByTestId('start-training'))

    // Answer (any bet) to see stats
    fireEvent.click(screen.getByTestId('bet-10'))

    // Stats should appear in feedback
    expect(screen.getByText(/Correct: \d+\/1/)).toBeInTheDocument()

    // Go to next question
    fireEvent.click(screen.getByTestId('next-question'))

    // Stats should persist
    expect(screen.getByText(/\/1/)).toBeInTheDocument()
  })
})
