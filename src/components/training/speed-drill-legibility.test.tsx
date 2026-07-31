import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SpeedDrill } from './SpeedDrill'
import { useAppStore } from '../../store/app-store'
import { CountingSystemId } from '../../engine/counting/types'
import { DEFAULT_RULES } from '../../engine/rules/types'

/**
 * The card must be readable even when nothing animates.
 *
 * The drill's card *is* the drill: the whole task is to read a rank before it
 * goes away. It used to enter from `opacity: 0`, so any condition that stops
 * animations advancing — a backgrounded tab restored, a stalled frame loop, a
 * device under load — left it invisible while the timer kept running. The
 * player loses the round without ever seeing what they were counting.
 *
 * Deliberately runs against the **real** framer-motion. Its sibling
 * `speed-drill.test.tsx` mocks the library and strips `initial`/`animate`,
 * which is right for testing drill logic and is exactly why it could never
 * have caught this: the mock removes the defect before the assertions run.
 *
 * Fake timers stall the animation frames, which is the frozen condition itself
 * rather than an approximation of it.
 */

const startDrill = () => {
  render(<SpeedDrill />)
  fireEvent.click(screen.getByTestId('start-drill'))
}

/** The card face: the only 250×350 box on screen during the drill. */
const cardFace = (): HTMLElement => {
  const el = document.querySelector('.w-\\[250px\\].h-\\[350px\\]')
  if (!el) throw new Error('drill card not found')
  return el as HTMLElement
}

/** Opacity as the browser would use it, walking up through any parent that fades. */
function effectiveOpacity(el: HTMLElement): number {
  let value = 1
  let node: HTMLElement | null = el
  while (node) {
    const own = node.style.opacity
    if (own !== '') value *= Number(own)
    node = node.parentElement
  }
  return value
}

describe('the drill card under a frozen animation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.setState({
      currentMode: 'speedDrill',
      selectedSystem: CountingSystemId.HiLo,
      selectedRules: DEFAULT_RULES,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is fully visible on the very first frame', () => {
    startDrill()
    expect(effectiveOpacity(cardFace())).toBe(1)
  })

  it('is still fully visible after the card advances', () => {
    // The replacement is the dangerous moment: this is where an entrance
    // animation and, previously, an exit animation both had to complete before
    // anything could be read.
    startDrill()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText(/Card 2 \//)).toBeInTheDocument()
    expect(effectiveOpacity(cardFace())).toBe(1)
  })

  it('shows exactly one card at a time', () => {
    // `AnimatePresence mode="wait"` made the next card's arrival conditional on
    // the previous one's exit reporting completion. Without a wait there is a
    // risk of the opposite failure — two cards on screen at once — so it is
    // worth pinning that the swap is still clean.
    startDrill()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(document.querySelectorAll('.w-\\[250px\\].h-\\[350px\\]')).toHaveLength(1)
  })

  it('keeps the rank legible, not merely present in the DOM', () => {
    // A rank inside a transparent box is in the document and unreadable, which
    // is the failure this whole file exists for.
    startDrill()
    const face = cardFace()
    expect(face.textContent?.trim()).not.toBe('')
    expect(effectiveOpacity(face)).toBe(1)
  })
})
