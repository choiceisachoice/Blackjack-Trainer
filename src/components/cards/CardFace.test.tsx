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

  /**
   * A picture card is its picture (Darius, 16 Nov 2026: "Picture Card — da ist
   * kein Picture drauf"). The product's own court card was a letter in a
   * frame; the large card is now the standard deck's, and a small J, Q or K
   * shows the figure where a number card shows its suit.
   */
  it.each([
    ['2', 'Spades', '/cards/2S.webp'],
    ['10', 'Hearts', '/cards/10H.webp'],
    ['A', 'Spades', '/cards/AS.webp'],
    ['J', 'Clubs', '/cards/JC.webp'],
    ['Q', 'Hearts', '/cards/QH.webp'],
    ['K', 'Diamonds', '/cards/KD.webp'],
  ])('full: the %s of %s is the standard deck’s card', (rank, suit, url) => {
    const { container } = render(<CardFace rank={rank} suit={suit} variant="full" />)
    expect(container.querySelector('image')?.getAttribute('href')).toBe(url)
    // Nothing of the product's own drawing is laid over it.
    expect(container.querySelectorAll('text')).toHaveLength(0)
    expect(container.querySelectorAll('path')).toHaveLength(0)
  })

  it.each(['J', 'Q', 'K'])('compact: a %s shows its picture, not a suit the size of the card', rank => {
    const { container } = render(<CardFace rank={rank} suit="Hearts" />)
    expect(container.querySelector('image')?.getAttribute('href')).toBe(`/cards/${rank}H.webp`)
    // The index stays: the rank and its small suit are what is read first.
    expect([...container.querySelectorAll('text')].map(t => t.textContent)).toEqual([rank])
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('compact: a number card and an ace carry no picture', () => {
    for (const rank of ['A', '10', '5']) {
      const { container, unmount } = render(<CardFace rank={rank} suit="Clubs" />)
      expect(container.querySelector('image')).toBeNull()
      unmount()
    }
  })

  it('every card of the deck has its image in the site', async () => {
    const { existsSync } = await import('node:fs')
    for (const suit of ['S', 'H', 'D', 'C']) {
      for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
        expect(existsSync(`public/cards/${rank}${suit}.webp`), `${rank}${suit}`).toBe(true)
      }
    }
  })
})

describe('CardBack', () => {
  it('shows no rank and no suit', () => {
    const { container } = render(<CardBack />)
    expect(screen.getByRole('img', { name: 'Face-down card' })).toBeInTheDocument()
    expect(container.querySelector('text')).toBeNull()
  })
})
