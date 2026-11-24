import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeckTray } from './DeckTray'
import { trayGeometry } from './deck-estimation-model'

// jsdom lays nothing out; give the measured zone a size so the tray draws.
const sizes: [keyof HTMLElement, PropertyDescriptor | undefined][] = []
beforeAll(() => {
  for (const [key, value] of [['clientWidth', 600], ['clientHeight', 500]] as const) {
    sizes.push([key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)])
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value })
  }
})
afterAll(() => {
  // The real getters live on Element.prototype; removing ours uncovers them.
  for (const [key, desc] of sizes) {
    if (desc) Object.defineProperty(HTMLElement.prototype, key, desc)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
  }
})

describe('trayGeometry', () => {
  it('takes the zone’s height and about half of it as width', () => {
    const g = trayGeometry(800, 500)
    expect(g.height).toBe(458)
    expect(g.width).toBe(256)
  })

  it('narrows the tray to the room a phone has', () => {
    const g = trayGeometry(300, 500)
    expect(g.width).toBeLessThanOrEqual(300 - g.labelW - 40 - 20)
  })
})

describe('DeckTray', () => {
  it('shows the stack without stating the answer while the question is open', () => {
    render(<DeckTray remainingCards={156} totalCards={312} answer={null} />)
    const visual = screen.getByTestId('discard-visual')
    expect(screen.getByTestId('discard-stack')).toHaveAttribute('data-share', '0.500')
    // Only the ruler's two ends: none left at the top, the shoe at the bottom.
    expect(screen.getAllByTestId('ruler-tick')).toHaveLength(2)
    expect(visual.textContent).not.toMatch(/%|remaining|Actual/)
    expect(screen.queryByTestId('mark-true')).not.toBeInTheDocument()
  })

  it('fills in the ruler and marks the truth and the guess once answered', () => {
    render(<DeckTray remainingCards={156} totalCards={312} answer={{ guess: 2, correct: false }} />)
    // Every half deck from 0 to 6.
    expect(screen.getAllByTestId('ruler-tick')).toHaveLength(13)
    expect(screen.getByTestId('mark-true')).toHaveTextContent('Actual 3.0')
    expect(screen.getByTestId('mark-guess')).toHaveTextContent('You 2')
    expect(screen.getByTestId('deck-error-band')).toBeInTheDocument()
  })

  it('marks only the truth when the clock ran out', () => {
    render(<DeckTray remainingCards={156} totalCards={312} answer={{ guess: null, correct: false }} />)
    expect(screen.getByTestId('mark-true')).toBeInTheDocument()
    expect(screen.queryByTestId('mark-guess')).not.toBeInTheDocument()
    expect(screen.queryByTestId('deck-error-band')).not.toBeInTheDocument()
  })

  it('uses whole-deck ticks for whole-deck precision', () => {
    render(<DeckTray remainingCards={156} totalCards={312} answer={{ guess: 3, correct: true }} step={1} />)
    expect(screen.getAllByTestId('ruler-tick')).toHaveLength(7)
  })
})
