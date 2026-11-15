import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

const TRAIN_IDS = ITEM_TESTIDS.slice(0, 5)
const TOOL_IDS = ITEM_TESTIDS.slice(5)

describe('the nav bar', () => {
  it('shows the five training modes in the bar, by name', () => {
    renderNav()
    for (const id of TRAIN_IDS) {
      const button = screen.getByTestId(id)
      expect(button).toBeInTheDocument()
      expect(button.textContent?.trim()).toBeTruthy()
      expect(button.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it('keeps the other five behind a button that says so, not behind bare icons', () => {
    // They were icons with a tooltip at every width below 2100px: five
    // features a newcomer could only identify by trying them, and on a touch
    // screen there is no tooltip at all.
    renderNav()
    for (const id of TOOL_IDS) expect(screen.queryByTestId(id)).toBeNull()

    const more = screen.getByTestId('nav-more')
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')

    for (const id of TOOL_IDS) {
      const row = screen.getByTestId(id)
      expect(row).toHaveAttribute('role', 'menuitem')
      // The name is drawn, not only announced.
      expect(row.textContent?.trim()).toBeTruthy()
    }
    expect(within(screen.getByTestId('nav-menu')).getByText('Analytics')).toBeInTheDocument()
    expect(within(screen.getByTestId('nav-menu')).getByText('Awards')).toBeInTheDocument()
  })

  it('lists the training modes in the menu too, for the width where the bar cannot', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-more'))
    for (const id of TRAIN_IDS) {
      expect(screen.getByTestId(id.replace('nav-', 'menu-'))).toBeInTheDocument()
    }
  })

  it('opens the chosen screen and closes behind it', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-more'))
    fireEvent.click(screen.getByTestId('nav-analytics'))
    expect(useAppStore.getState().currentMode).toBe('analytics')
    expect(screen.queryByTestId('nav-menu')).toBeNull()
  })

  it('names the current screen on the button when that screen is one of its own', () => {
    // So the bar always shows where you are, menu closed.
    useAppStore.setState({ currentMode: 'strategyChart' })
    renderNav()
    expect(screen.getByTestId('nav-more')).toHaveTextContent('Strategy')
  })

  it('closes on Escape and on a press outside it', () => {
    renderNav()
    fireEvent.click(screen.getByTestId('nav-more'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('nav-menu')).toBeNull()

    fireEvent.click(screen.getByTestId('nav-more'))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('nav-menu')).toBeNull()
  })

  it('gives the way home a name', () => {
    renderNav()
    expect(screen.getByTestId('nav-home').getAttribute('aria-label')).toBeTruthy()
  })
})
