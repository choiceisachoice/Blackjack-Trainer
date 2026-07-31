import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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

  it('does not repeat the explanation once it has been seen', () => {
    show(1, 2)
    const { unmount } = render(<LevelUpPopup />)
    fireEvent.click(screen.getByTestId('level-up-dismiss'))
    unmount()

    show(2, 3)
    render(<LevelUpPopup />)
    expect(screen.queryByTestId('level-up-explainer')).toBeNull()
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
