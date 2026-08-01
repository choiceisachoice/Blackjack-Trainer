import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavBar } from './NavBar'
import { useAppStore } from '../../store/app-store'

/**
 * The nav bar carries ten items and cannot fit them.
 *
 * Measured in a browser: the strip needs 1171px, the brand 167, the right-hand
 * controls 312, plus 64 of padding and gaps — 1714px before anything fits. That
 * is wider than every common laptop, and because the strip is
 * `overflow-x-auto no-scrollbar`, the excess was not truncated but *hidden*:
 * at 1520px "Strategy" and "Awards" sat 212px outside the visible area with no
 * scrollbar, no fade and no hint that they existed at all.
 *
 * The secondary items therefore drop their labels below the width where the
 * full set fits. Layout cannot be measured in jsdom, so what is pinned here is
 * the consequence of that decision: an item reduced to an icon must still say
 * what it is.
 */

const ITEM_TESTIDS = [
  'nav-speedDrill', 'nav-deviationTraining', 'nav-betSpread', 'nav-deckEstimation',
  'nav-casinoSession', 'nav-plan', 'nav-learn', 'nav-analytics',
  'nav-strategyChart', 'nav-achievements',
]

function renderNav() {
  render(<MemoryRouter><NavBar /></MemoryRouter>)
}

beforeEach(() => {
  useAppStore.setState({ currentMode: 'home' })
})

describe('the nav bar', () => {
  it('shows every mode, including the two that used to fall off the end', () => {
    renderNav()
    for (const id of ITEM_TESTIDS) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })

  it('names every item even when its label is not drawn', () => {
    // At most widths the secondary items are icons. An icon with no accessible
    // name is a button that only its author can identify — and these are the
    // two that were invisible in the first place.
    renderNav()
    for (const id of ITEM_TESTIDS) {
      const button = screen.getByTestId(id)
      expect(button.getAttribute('title')).toBeTruthy()
      expect(button.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('keeps the label text in the accessibility tree', () => {
    // Hidden visually, not removed: a screen reader and a test should both
    // still be able to ask for "Analytics" by name.
    renderNav()
    expect(screen.getByRole('button', { name: /Analytics/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Awards/i })).toBeInTheDocument()
  })
})
