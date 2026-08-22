import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { XpToast } from './XpToast'
import { useLevelStore } from '../../store/level-store'
import { LEVELS } from '../../services/level-system'

/**
 * The half of the XP system the player can actually perceive.
 *
 * Session XP was always credited correctly and always invisibly — paid out on
 * unmount, during navigation, in a component being destroyed. Achievements and
 * challenges announced themselves as they landed, so those felt alive and
 * training felt broken. These tests pin the announcement.
 */
const award = (amount: number, labelKey = 'xp.source.session', id = 1) =>
  useLevelStore.setState({ lastAward: { amount, labelKey, id }, showLevelUp: false })

beforeEach(() => {
  useLevelStore.setState({ lastAward: null, showLevelUp: false, levelUpData: null })
})
afterEach(() => vi.useRealTimers())

describe('XpToast', () => {
  it('says nothing when no XP has been paid', () => {
    render(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()
  })

  it('announces the amount and where it came from', () => {
    award(40)
    render(<XpToast />)
    const toast = screen.getByTestId('xp-toast')
    expect(toast.textContent).toContain('40')
    expect(toast.textContent).toContain('Training session')
  })

  it('translates the source instead of printing the key', () => {
    award(40)
    render(<XpToast />)
    expect(screen.getByTestId('xp-toast').textContent).not.toContain('xp.source')
  })

  it('stays quiet while the level-up popup is open', () => {
    // The popup already lists every source of the climb, this one included. A
    // toast underneath would repeat it and fight for the same moment.
    award(40)
    useLevelStore.setState({
      showLevelUp: true,
      levelUpData: {
        oldLevel: LEVELS[0], newLevel: LEVELS[1],
        breakdown: [{ labelKey: 'xp.source.session', amount: 40 }],
      },
    })
    render(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()
  })

  it('clears itself so it does not sit on screen forever', () => {
    vi.useFakeTimers()
    award(40)
    render(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3000) })
    expect(useLevelStore.getState().lastAward).toBeNull()
  })

  it('is polite, not assertive — a reward must not interrupt a screen reader', () => {
    award(40)
    render(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toHaveAttribute('aria-live', 'polite')
  })

  it('announces a second identical payout', () => {
    // The case a regular user hits most: two 40-XP drills in a row. Keying the
    // entrance on the amount instead of the id would swallow the second.
    vi.useFakeTimers()
    award(40, 'xp.source.session', 1)
    const { rerender } = render(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(3000) })
    rerender(<XpToast />)
    expect(screen.queryByTestId('xp-toast')).toBeNull()

    act(() => award(40, 'xp.source.session', 2))
    rerender(<XpToast />)
    expect(screen.getByTestId('xp-toast')).toBeInTheDocument()
  })
})
