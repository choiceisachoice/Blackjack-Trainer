import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Rank, Suit, type Card } from '../../types'
import { SpeedReview } from './SpeedReview'

// 5 (+1), K (−1), 9 (0), 3 (+1), A (−1)
const CARDS: Card[] = [
  { rank: Rank.Five, suit: Suit.Clubs },
  { rank: Rank.King, suit: Suit.Hearts },
  { rank: Rank.Nine, suit: Suit.Spades },
  { rank: Rank.Three, suit: Suit.Diamonds },
  { rank: Rank.Ace, suit: Suit.Spades },
]
const RUNNING = [1, 0, 0, 1, 0]

describe('the round laid out again', () => {
  it('shows every card of the round, in dealing order', () => {
    render(<SpeedReview cards={CARDS} runningAfter={RUNNING} />)
    const items = screen.getAllByTestId('review-card')
    expect(items).toHaveLength(5)
    expect(within(items[0]).getByLabelText('5 Clubs')).toBeInTheDocument()
    expect(within(items[1]).getByLabelText('K Hearts')).toBeInTheDocument()
    expect(within(items[4]).getByLabelText('A Spades')).toBeInTheDocument()
  })

  it('puts the true running count under each card, signed', () => {
    render(<SpeedReview cards={CARDS} runningAfter={RUNNING} />)
    expect(screen.getAllByTestId('review-count').map(el => el.textContent)).toEqual(['+1', '0', '0', '+1', '0'])
  })

  it('sets the last count — the answer — apart in gold', () => {
    render(<SpeedReview cards={CARDS} runningAfter={RUNNING} />)
    const counts = screen.getAllByTestId('review-count')
    expect(counts[4].className).toMatch(/bg-gold/)
    expect(counts[3].className).not.toMatch(/bg-gold/)
  })

  it('rings the card the pointer is about, and only that one', () => {
    render(<SpeedReview cards={CARDS} runningAfter={RUNNING} marked={[4]} />)
    const marked = screen.getAllByTestId('review-card').filter(el => el.dataset.marked === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0]).toHaveAttribute('data-index', '4')
  })

  it('says what the numbers are', () => {
    render(<SpeedReview cards={CARDS} runningAfter={RUNNING} />)
    expect(screen.getByRole('list', { name: 'The count after every card' })).toBeInTheDocument()
  })
})

describe('a round too long for the felt', () => {
  // jsdom lays nothing out; the felt's size is given here instead.
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  })

  it('scrolls rather than shrink the ranks, and fades its foot to say there is more', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 330 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 200 })
    const many = Array.from({ length: 52 }, (_, i) => CARDS[i % CARDS.length])
    const { container } = render(<SpeedReview cards={many} runningAfter={many.map(() => 0)} />)
    const scroller = container.querySelector('[data-scroll="true"]') as HTMLElement | null
    // The fade itself is a mask-image, which jsdom does not keep; the flag and
    // the scrolling box are what can be checked here.
    expect(scroller).not.toBeNull()
    expect(scroller!.className).toMatch(/overflow-y-auto/)
    expect(screen.getAllByTestId('review-card')).toHaveLength(52)
  })

  it('does not scroll or fade a round that fits', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1444 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 506 })
    const { container } = render(<SpeedReview cards={CARDS} runningAfter={RUNNING} />)
    expect(container.querySelector('[data-scroll]')).toBeNull()
  })
})
