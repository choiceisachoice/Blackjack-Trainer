import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LearnPage } from './LearnPage'

describe('LearnPage', () => {
  it('renders the header, concept topics and mode guide', () => {
    render(<LearnPage />)
    expect(screen.getByTestId('learn-page')).toBeInTheDocument()
    expect(screen.getByText('What is card counting?')).toBeInTheDocument()
    expect(screen.getByText('The Hi-Lo count')).toBeInTheDocument()
    expect(screen.getByText('Illustrious 18 & Fab 4')).toBeInTheDocument()
    // Target the accordion topic, not the words: "Basic Strategy" is also a term
    // introduced in the Part 1 lesson, so a bare text match now finds both.
    expect(screen.getByTestId('topic-basic-strategy')).toBeInTheDocument()
    // Mode guide
    expect(screen.getByText('The Training Modes')).toBeInTheDocument()
  })

  it('teaches the game before it teaches counting', () => {
    render(<LearnPage />)
    // Part 1 must come first in the DOM: the counting chapters use "upcard",
    // "soft", "bust" and "Basic Strategy" without defining them.
    const basics = screen.getByTestId('blackjack-basics')
    const firstCountingTopic = screen.getByTestId('topic-what-is-counting')
    expect(
      basics.compareDocumentPosition(firstCountingTopic) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('opens the first topic by default and toggles others', () => {
    render(<LearnPage />)
    expect(screen.getByTestId('topic-what-is-counting').getAttribute('aria-expanded')).toBe('true')

    const hiLo = screen.getByTestId('topic-hi-lo')
    expect(hiLo.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(hiLo)
    expect(hiLo.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(hiLo)
    expect(hiLo.getAttribute('aria-expanded')).toBe('false')
  })
})
