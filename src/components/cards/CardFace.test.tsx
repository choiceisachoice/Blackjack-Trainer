import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CardFace, CardBack } from './CardFace'

describe('CardFace', () => {
  it('names the card for a reader that cannot see it', () => {
    render(<CardFace rank="K" suit="Spades" />)
    expect(screen.getByRole('img', { name: 'K Spades' })).toBeInTheDocument()
  })

  it('draws hearts and diamonds red, clubs and spades black', () => {
    const { container, rerender } = render(<CardFace rank="7" suit="Hearts" />)
    expect(container.querySelector('g')?.getAttribute('fill')).toBe('#c8102e')
    rerender(<CardFace rank="7" suit="Clubs" />)
    expect(container.querySelector('g')?.getAttribute('fill')).toBe('#14161a')
  })

  it('compact: the rank and two suits, whatever the rank', () => {
    const { container } = render(<CardFace rank="9" suit="Diamonds" />)
    expect(container.querySelectorAll('text')).toHaveLength(1)
    expect(container.querySelectorAll('path')).toHaveLength(2)
  })

  it.each([
    ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['10', 10],
  ])('full: a %s carries %i pips besides its two corner suits', (rank, pips) => {
    const { container } = render(<CardFace rank={rank} suit="Spades" variant="full" />)
    expect(container.querySelectorAll('path')).toHaveLength(pips + 2)
  })

  it('full: an ace is one large pip, a court card a framed letter', () => {
    const ace = render(<CardFace rank="A" suit="Hearts" variant="full" />)
    expect(ace.container.querySelectorAll('path')).toHaveLength(3)
    ace.unmount()
    const queen = render(<CardFace rank="Q" suit="Hearts" variant="full" />)
    // the card, the panel and its inner line
    expect(queen.container.querySelectorAll('rect')).toHaveLength(3)
    expect([...queen.container.querySelectorAll('text')].map(t => t.textContent)).toEqual(['Q', 'Q', 'Q'])
  })
})

describe('CardBack', () => {
  it('shows no rank and no suit', () => {
    const { container } = render(<CardBack />)
    expect(screen.getByRole('img', { name: 'Face-down card' })).toBeInTheDocument()
    expect(container.querySelector('text')).toBeNull()
  })
})
