import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiscardTray } from './ShoeProgress'

// The stack's height goes through `animate`, which a test cannot read off the DOM.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ animate, ...rest }: { animate: { height: number | string } } & Record<string, unknown>) => (
      <div data-height={String(animate.height)} {...rest} />
    ),
  },
  useReducedMotion: () => false,
}))

describe('DiscardTray', () => {
  it('sizes the stack in pixels by default', () => {
    render(<DiscardTray cardCount={100} totalCards={312} pxPerCard={0.5} />)
    expect(screen.getByTestId('discard-stack').dataset.height).toBe('50')
  })

  it('with fill, the stack is its share of the shoe, whatever the scale', () => {
    render(<DiscardTray cardCount={78} totalCards={312} pxPerCard={0.5} fill />)
    expect(screen.getByTestId('discard-stack').dataset.height).toBe('25%')
  })

  it('draws no stack before a card is played', () => {
    render(<DiscardTray cardCount={0} totalCards={312} fill />)
    expect(screen.queryByTestId('discard-stack')).toBeNull()
  })
})
