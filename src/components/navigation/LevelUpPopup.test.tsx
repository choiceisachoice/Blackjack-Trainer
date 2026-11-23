import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { LevelUpPopup } from './LevelUpPopup'
import { useLevelStore } from '../../store/level-store'
import { LEVELS } from '../../services/level-system'
import type { XPSource } from '../../store/level-store'

function show(
  from: number,
  to: number,
  breakdown: XPSource[] = [{ labelKey: 'xp.source.session', amount: 75 }],
) {
  useLevelStore.setState({
    showLevelUp: true,
    levelUpData: { oldLevel: LEVELS[from - 1], newLevel: LEVELS[to - 1], breakdown },
  })
}

beforeEach(() => {
  localStorage.clear()
  useLevelStore.setState({ showLevelUp: false, levelUpData: null })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LevelUpPopup', () => {
  it('renders nothing when no level-up is pending', () => {
    render(<LevelUpPopup />)
    expect(screen.queryByTestId('level-up-popup')).toBeNull()
  })

  it('explains what a level is the first time, for anyone — not only a 1→2 jump', () => {
    // The bug: the explainer was gated on oldLevel===1, but a fresh account
    // jumps several levels in one burst and only the last hop (oldLevel 2 or 3)
    // survived, so the beginner never saw it. Now it shows for any first popup.
    show(3, 5) // oldLevel is NOT 1
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-explainer')).toBeInTheDocument()
    expect(screen.getByTestId('level-up-explainer').textContent).toMatch(/unlocks a profile picture/i)
  })

  it('shows the picture the new level unlocked', () => {
    show(3, 4)
    render(<LevelUpPopup />)
    const block = screen.getByTestId('level-up-pictures')
    expect(block).toHaveTextContent(/new profile picture unlocked/i)
    expect(block.querySelectorAll('svg[viewBox="0 0 64 64"]')).toHaveLength(1)
  })

  it('shows every picture of a multi-level burst and says how many', () => {
    show(1, 4)
    render(<LevelUpPopup />)
    const block = screen.getByTestId('level-up-pictures')
    expect(block).toHaveTextContent(/3 new profile pictures/i)
    expect(block.querySelectorAll('svg[viewBox="0 0 64 64"]')).toHaveLength(3)
  })

  it('offers no way to the account page outside a router, and does not crash', () => {
    // The dev gallery and these tests render it without one.
    show(1, 2)
    render(<LevelUpPopup />)
    expect(screen.queryByTestId('level-up-choose-picture')).toBeNull()
  })

  it('leads to the account page from inside the app, closing the popup first', async () => {
    const { MemoryRouter, Routes, Route } = await import('react-router-dom')
    show(1, 2)
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<LevelUpPopup />} />
          <Route path="/account" element={<div data-testid="account-page" />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByTestId('level-up-choose-picture'))
    expect(screen.getByTestId('account-page')).toBeInTheDocument()
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('keeps explaining until the reader says they have got it', () => {
    // The explainer used to disappear after one showing, decided by the app.
    // That assumes reading, and somebody whose eye went straight to "Lv.3 Card
    // Player" never saw it again. It now stays until they say so.
    show(1, 2)
    const { unmount } = render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-explainer')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('level-up-dismiss'))
    unmount()

    show(2, 3)
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-explainer')).toBeInTheDocument()
  })

  it('stops for good once they press "do not show again"', () => {
    show(1, 2)
    const { unmount } = render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-intro-hide'))
    unmount()

    show(2, 3)
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-popup')).toBeInTheDocument()
    expect(screen.queryByTestId('level-up-explainer')).toBeNull()
  })

  it('hides the text immediately, so the button visibly did something', () => {
    // Pressing it and seeing nothing change reads as a broken control — and the
    // popup stays open afterwards, so there is a moment to fill.
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-intro-hide'))

    expect(screen.queryByTestId('level-up-explainer')).toBeNull()
    expect(screen.getByTestId('level-up-popup')).toBeInTheDocument()
  })

  it('does not close the popup — the reader decides when to leave', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-intro-hide'))
    expect(screen.getByTestId('level-up-dismiss')).toBeInTheDocument()
  })

  it('does not repeat the explanation on a second level-up in the same session, once hidden', () => {
    // `LevelUpPopup` is mounted once in `TrainerApp` and stays for the whole
    // session, rendering null in between. Reading "have they hidden it" in a
    // `useState` initialiser answered at app start and froze — so the text came
    // back on the second level-up even after being switched off.
    //
    // No unmount here, on purpose. This is the shape the app actually has.
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-intro-hide'))
    fireEvent.click(screen.getByTestId('level-up-dismiss'))

    act(() => show(2, 3))
    expect(screen.getByTestId('level-up-popup')).toBeInTheDocument()
    expect(screen.queryByTestId('level-up-explainer')).toBeNull()
  })

  it('keeps the explanation on screen while the popup it belongs to is open', () => {
    // Re-reading on every render would let the text vanish underneath somebody
    // mid-sentence. It is answered when the popup opens, then held.
    show(1, 2)
    const { rerender } = render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-explainer')).toBeInTheDocument()

    rerender(<LevelUpPopup />)
    rerender(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-explainer')).toBeInTheDocument()
  })

  it('shows where the XP came from', () => {
    show(1, 3, [
      { labelKey: 'xp.source.session', amount: 75 },
      { labelKey: 'xp.source.challenge', amount: 100 },
      { labelKey: 'xp.source.achievement', amount: 25 },
    ])
    render(<LevelUpPopup />)

    const breakdown = screen.getByTestId('level-up-breakdown')
    expect(breakdown.textContent).toContain('Training session')
    expect(breakdown.textContent).toContain('Challenge')
    expect(breakdown.textContent).toContain('+200 XP') // total
  })

  it('names a multi-level jump instead of just showing two distant numbers', () => {
    show(1, 3)
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-jump').textContent).toMatch(/Jumped 2 levels/)
  })

  it('shows no jump note for a single-level climb', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    expect(screen.queryByTestId('level-up-jump')).toBeNull()
  })

  it('can be dismissed by the button', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-dismiss'))
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('can be dismissed by clicking the backdrop — never traps the app', () => {
    // On a short window the card can exceed the viewport; a backdrop escape is
    // the guarantee that "Continue" being off-screen cannot lock the app.
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-popup'))
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('does not dismiss when the card itself is clicked', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    // Click the breakdown (inside the card) — stopPropagation must keep it open.
    fireEvent.click(screen.getByTestId('level-up-breakdown'))
    expect(screen.getByTestId('level-up-popup')).toBeInTheDocument()
    expect(useLevelStore.getState().showLevelUp).toBe(true)
  })

  it('scrolls rather than clipping — the overlay allows overflow', () => {
    show(1, 5, [
      { labelKey: 'xp.source.session', amount: 75 },
      { labelKey: 'xp.source.challenge', amount: 100 },
      { labelKey: 'xp.source.challenge', amount: 300 },
      { labelKey: 'xp.source.achievement', amount: 25 },
    ])
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-popup').className).toMatch(/overflow-y-auto/)
  })

  it('translates the breakdown instead of printing store literals', () => {
    // The store used to carry rendered English — 'Training session',
    // 'Challenge', 'Achievement' — straight into this list. A `.ts` constant is
    // invisible to the JSX lint rule, so seven languages showed an English
    // breakdown and nothing failed. It holds keys now.
    show(1, 3, [{ labelKey: 'xp.source.session', amount: 40 }])
    render(<LevelUpPopup />)
    const list = screen.getByTestId('level-up-breakdown')
    expect(list.textContent).toContain('Training session')  // en, from the test bundle
    expect(list.textContent).not.toContain('xp.source')      // never the raw key
  })

  it('lists a single source as one line with its total, not a line and a total', () => {
    show(1, 2, [{ labelKey: 'xp.source.session', amount: 40 }])
    render(<LevelUpPopup />)
    const list = screen.getByTestId('level-up-breakdown')
    expect(list.textContent).toContain('Training session')
    expect(list.textContent).toContain('+40 XP')
    expect(list.textContent).not.toContain('Total')
  })

  it('folds a daily and a weekly challenge into one line', () => {
    show(1, 3, [
      { labelKey: 'xp.source.challenge', amount: 100 },
      { labelKey: 'xp.source.challenge', amount: 300 },
      { labelKey: 'xp.source.session', amount: 75 },
    ])
    render(<LevelUpPopup />)
    const list = screen.getByTestId('level-up-breakdown')
    expect(list.textContent!.match(/Challenge/g)).toHaveLength(1)
    expect(list.textContent).toContain('+400')
    expect(list.textContent).toContain('+475 XP')
  })

  it('draws the newest four pictures of a long burst and counts the rest', () => {
    show(1, 8)
    render(<LevelUpPopup />)
    const block = screen.getByTestId('level-up-pictures')
    expect(block).toHaveTextContent(/7 new profile pictures/i)
    expect(block.querySelectorAll('svg[viewBox="0 0 64 64"]')).toHaveLength(4)
    expect(block).toHaveTextContent('+3')
  })

  it('rolls the number through every level passed on the way', () => {
    show(1, 4)
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-roll').textContent).toBe('1234')
  })

  it('times the roll from the shared timeline, so the budget test covers what is drawn', () => {
    // jsdom has no matchMedia, so motion is on here; the reduced-motion half
    // lives in its own file (the preference is read once per module).
    show(1, 3)
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-roll').style.animation).toMatch(/^lu-roll 500ms .* 120ms both$/)
  })
})

describe('LevelUpPopup — a tier change', () => {
  it('is a moment of its own when the climb crosses into a new tier', () => {
    show(5, 6) // beginner → mid
    render(<LevelUpPopup />)
    const tier = screen.getByTestId('level-up-tier-change')
    expect(tier).toHaveTextContent('New tier')
    expect(tier).toHaveTextContent('Beginner')
    expect(tier).toHaveTextContent('Intermediate')
    expect(screen.queryByTestId('level-up-tier')).toBeNull()
  })

  it('is a quiet label when the tier stays the same', () => {
    show(2, 3)
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-tier')).toHaveTextContent('Beginner')
    expect(screen.queryByTestId('level-up-tier-change')).toBeNull()
  })
})

describe('LevelUpPopup — as a dialog', () => {
  it('is a modal dialog named after the new level', () => {
    show(1, 3)
    render(<LevelUpPopup />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName(/level 3, Card Player/i)
  })

  it('puts focus on Continue when it opens', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    expect(document.activeElement).toBe(screen.getByTestId('level-up-dismiss'))
  })

  it('gives focus back to where it was when it closes', () => {
    render(<><button data-testid="opener">open</button><LevelUpPopup /></>)
    screen.getByTestId('opener').focus()
    act(() => show(1, 2))
    expect(document.activeElement).toBe(screen.getByTestId('level-up-dismiss'))
    fireEvent.click(screen.getByTestId('level-up-dismiss'))
    expect(document.activeElement).toBe(screen.getByTestId('opener'))
  })

  it('closes on Escape', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('closes on Enter, but not when Enter is pressing one of its other buttons', () => {
    // "Got it" and "Use it as your picture" must do their own thing; a global
    // Enter that closed the card first swallowed both.
    show(1, 2)
    render(<LevelUpPopup />)
    fireEvent.keyDown(screen.getByTestId('level-up-intro-hide'), { key: 'Enter' })
    expect(useLevelStore.getState().showLevelUp).toBe(true)

    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(useLevelStore.getState().showLevelUp).toBe(false)
  })

  it('keeps Tab inside the card', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    const dialog = screen.getByRole('dialog')
    const last = screen.getByTestId('level-up-dismiss')
    const first = screen.getByTestId('level-up-intro-hide')
    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('holds the page still while open and lets it go afterwards', () => {
    show(1, 2)
    render(<LevelUpPopup />)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByTestId('level-up-dismiss'))
    expect(document.body.style.overflow).toBe('')
  })
})
