import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { Hand } from './Hand'
import { Suit, type Card } from '../../types'

/**
 * "BUST" must survive an unrelated re-render.
 *
 * The bust wording is held back 500ms so it lands after the card has finished
 * sliding in. The effect that does that had no dependency array, so it re-ran
 * after *every* render and its cleanup cancelled the pending timer — and once
 * cancelled it was never restarted, because by then the card-count snapshot had
 * caught up and neither branch of the effect fires again.
 *
 * The window is half a second and the casino loop re-renders inside it
 * routinely, so the player is simply shown the total where the game meant to
 * say BUST. Quiet, and wrong at the one moment the table has something to tell
 * them.
 *
 * Note the linter's suggested fix — `[computedBust, cards.length,
 * prevCardCountSnapshot]` — does not solve this: the snapshot changes on the
 * very next render, so the effect re-runs and cancels anyway. The timer has to
 * stop being owned by the effect's cleanup.
 */

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
        const { initial, animate, exit, transition, onAnimationComplete, ...rest } = props
        return React.createElement(tag, rest, children)
      },
  }),
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useReducedMotion: () => false,
}))

const card = (rank: string, suit: Suit = Suit.Spades): Card => ({ rank, suit } as Card)

/** Ten + six = 16, then a nine takes it to 25. */
const BEFORE = [card('10'), card('6', Suit.Hearts)]
const BUSTED = [...BEFORE, card('9', Suit.Clubs)]

const shown = () => document.body.textContent ?? ''

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the delayed BUST text', () => {
  it('appears after the delay when nothing else happens', () => {
    // The happy path, so the fix cannot pass by simply showing it immediately.
    const { rerender } = render(<Hand cards={BEFORE} />)
    rerender(<Hand cards={BUSTED} />)

    expect(shown()).not.toMatch(/BUST/)

    act(() => { vi.advanceTimersByTime(600) })
    expect(shown()).toMatch(/BUST/)
  })

  it('still appears when an unrelated re-render lands inside the delay', () => {
    // `isActive` has nothing to do with busting. In the casino loop a re-render
    // this harmless happens constantly.
    const { rerender } = render(<Hand cards={BEFORE} />)
    rerender(<Hand cards={BUSTED} />)

    act(() => { vi.advanceTimersByTime(200) })
    rerender(<Hand cards={BUSTED} isActive />)

    act(() => { vi.advanceTimersByTime(600) })
    expect(shown()).toMatch(/BUST/)
  })

  it('survives several interfering re-renders', () => {
    const { rerender } = render(<Hand cards={BEFORE} />)
    rerender(<Hand cards={BUSTED} />)

    for (let i = 0; i < 4; i++) {
      act(() => { vi.advanceTimersByTime(80) })
      rerender(<Hand cards={BUSTED} isActive={i % 2 === 0} />)
    }

    act(() => { vi.advanceTimersByTime(600) })
    expect(shown()).toMatch(/BUST/)
  })

  it('shows the total, not BUST, while the delay is still running', () => {
    // The delay is the point: the wording waits for the card to arrive.
    const { rerender } = render(<Hand cards={BEFORE} />)
    rerender(<Hand cards={BUSTED} />)

    act(() => { vi.advanceTimersByTime(200) })
    expect(shown()).toMatch(/25/)
    expect(shown()).not.toMatch(/BUST/)
  })

  it('does not announce a bust for a hand that is not bust', () => {
    render(<Hand cards={BEFORE} />)
    act(() => { vi.advanceTimersByTime(600) })
    expect(shown()).not.toMatch(/BUST/)
  })
})
