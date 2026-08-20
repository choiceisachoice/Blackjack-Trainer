import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { LevelUpPopup } from './LevelUpPopup'
import { useLevelStore } from '../../store/level-store'
import { LEVELS } from '../../services/level-system'
import type { XPSource } from '../../store/level-store'

function show(
  from: number,
  to: number,
  breakdown: XPSource[] = [{ label: 'Training session', amount: 75 }],
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
    expect(screen.getByTestId('level-up-explainer').textContent).toMatch(/don.t unlock anything/i)
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
      { label: 'Training session', amount: 75 },
      { label: 'Daily challenge', amount: 100 },
      { label: 'Achievement', amount: 25 },
    ])
    render(<LevelUpPopup />)

    const breakdown = screen.getByTestId('level-up-breakdown')
    expect(breakdown.textContent).toContain('Training session')
    expect(breakdown.textContent).toContain('Daily challenge')
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
      { label: 'Training session', amount: 75 },
      { label: 'Daily challenge', amount: 100 },
      { label: 'Weekly challenge', amount: 300 },
      { label: 'Achievement', amount: 25 },
    ])
    render(<LevelUpPopup />)
    expect(screen.getByTestId('level-up-popup').className).toMatch(/overflow-y-auto/)
  })
})
