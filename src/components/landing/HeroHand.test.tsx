import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { HeroHand } from './HeroHand'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('HeroHand', () => {
  it('opens on a whole dealt hand with its count, so a prerendered page has nothing to re-deal', () => {
    render(<HeroHand />)
    // 5♥ K♠ 3♣ 6♦ 9♠ → +1 −1 +1 +1 0
    expect(screen.getByTestId('hero-count')).toHaveTextContent('+2')
    expect(screen.getAllByRole('img', { hidden: true })).toHaveLength(5)
  })

  it('deals the next hand card by card and counts as each lands', () => {
    vi.useFakeTimers()
    render(<HeroHand />)
    act(() => { vi.advanceTimersByTime(2800) })          // hold over: next hand, nothing dealt
    expect(screen.getByTestId('hero-count')).toHaveTextContent('0')
    act(() => { vi.advanceTimersByTime(720) })           // A♠
    expect(screen.getByTestId('hero-count')).toHaveTextContent('−1')
    act(() => { vi.advanceTimersByTime(720) })           // 4♦
    expect(screen.getByTestId('hero-count')).toHaveTextContent('0')
    act(() => { vi.advanceTimersByTime(720) })           // 2♥
    expect(screen.getByTestId('hero-count')).toHaveTextContent('+1')
  })
})
