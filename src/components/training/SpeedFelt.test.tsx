import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { Rank, Suit, type Card } from '../../types'
import { cardImageUrl } from '../cards/card-suits'
import { DrillCard, SpeedFelt, SpeedRunStage } from './SpeedFelt'

const QUEEN: Card = { rank: Rank.Queen, suit: Suit.Diamonds }
const FIVE: Card = { rank: Rank.Five, suit: Suit.Clubs }

/** The z-index a Tailwind `z-N` class gives an element, or null without one. */
const zOf = (el: Element): number | null => {
  const m = /(?:^|\s)z-(\d+)(?:\s|$)/.exec(el.getAttribute('class') ?? '')
  return m ? Number(m[1]) : null
}

/**
 * The bug this pins (audit, 24 Nov 2026): every card of the Speed Drill had a
 * stray upside-down index and a grey centre pip drawn over the picture. The
 * drawn fallback card sat in the same box as the image, and two of its
 * children made stacking contexts — `rotate-180` (a transform) and
 * `opacity-20` — which CSS paints above an absolutely positioned image with
 * no z-index that comes earlier in the box. jsdom cannot paint, so the test
 * pins the rule that decides the paint order instead: one isolated box, the
 * drawn face in an explicitly lower layer before the picture, and the
 * picture the only thing in the upper layer.
 */
describe('the drill card — nothing is drawn over the picture', () => {
  it('puts the picture in the top layer and the drawn face in a lower one, in that order', () => {
    render(<DrillCard card={QUEEN} height={350} />)
    const card = screen.getByTestId('drill-card')
    expect(card.className).toMatch(/(?:^|\s)isolate(?:\s|$)/)

    const img = card.querySelector(':scope > img')
    const drawn = card.querySelector(':scope > [data-layer="drawn"]')
    expect(img).not.toBeNull()
    expect(drawn).not.toBeNull()
    expect(zOf(img!)).toBeGreaterThan(zOf(drawn!)!)
    // DOM order agrees with the z order, so no tie can put the drawn face on top.
    expect(drawn!.compareDocumentPosition(img!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no other painted layer beside the two — the hidden rank for the film scripts excepted', () => {
    render(<DrillCard card={QUEEN} height={350} />)
    const card = screen.getByTestId('drill-card')
    const painted = [...card.children].filter(el => !el.classList.contains('sr-only'))
    expect(painted).toHaveLength(2)
  })

  it('leaves no transform or opacity class in the drawn face that could lift part of it over the picture', () => {
    render(<DrillCard card={FIVE} height={350} />)
    const drawn = screen.getByTestId('drill-card').querySelector('[data-layer="drawn"]')!
    for (const el of [drawn, ...drawn.querySelectorAll('*')]) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/(?:^|\s)(?:rotate-|-?scale-|-?translate-|opacity-|transform)/)
    }
  })

  it('shows the standard deck’s face — the picture card’s picture', () => {
    render(<DrillCard card={QUEEN} height={350} />)
    expect(screen.getByTestId('drill-card').querySelector('img')).toHaveAttribute('src', cardImageUrl('Q', 'Diamonds'))
  })

  it('keeps the rank drawn underneath, for the frame an image can be late in', () => {
    render(<DrillCard card={QUEEN} height={350} />)
    const drawn = screen.getByTestId('drill-card').querySelector('[data-layer="drawn"]')!
    expect(drawn.querySelector('text')?.textContent).toBe('Q')
    expect(screen.getByLabelText('Q Diamonds')).toBeInTheDocument()
  })

  it('is sized by its height at 5:7 and says which card it is', () => {
    render(<DrillCard card={FIVE} height={420} />)
    const card = screen.getByTestId('drill-card')
    expect(card.style.height).toBe('420px')
    expect(card.style.width).toBe('300px')
    expect(card).toHaveAttribute('data-rank', '5')
    expect(card).toHaveAttribute('data-suit', 'Clubs')
  })
})

describe('the felt', () => {
  it('draws no verdict line while the round is open', () => {
    const { container } = render(<SpeedFelt verdict={null}><p>x</p></SpeedFelt>)
    expect(container.querySelector('[aria-hidden].opacity-0')).not.toBeNull()
  })

  it('draws a green line for a right answer and a red one for a wrong one', () => {
    const { container, rerender } = render(<SpeedFelt verdict><p>x</p></SpeedFelt>)
    expect(container.querySelector('.border-success\\/85')).not.toBeNull()
    rerender(<SpeedFelt verdict={false}><p>x</p></SpeedFelt>)
    expect(container.querySelector('.border-error\\/85')).not.toBeNull()
  })
})

describe('the running round on the felt', () => {
  it('shows one card, in its printed place, with the countdown under it — and no count', () => {
    const ref = createRef<HTMLDivElement>()
    render(<SpeedRunStage card={FIVE} index={3} countdownRef={ref} />)
    expect(screen.getAllByTestId('drill-card')).toHaveLength(1)
    expect(screen.getByTestId('drill-spot')).toContainElement(screen.getByTestId('drill-card'))
    expect(ref.current).toBe(screen.getByTestId('drill-countdown'))
    expect(screen.getByTestId('speed-run-stage').textContent).not.toMatch(/[+−-]\d/)
  })
})
