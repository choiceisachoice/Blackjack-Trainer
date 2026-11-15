import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Chip, ChipStack } from './Chip'
import { chipBreakdown, chipColor } from './helpers'

describe('chipColor', () => {
  it('follows the table convention: white 1, red 5, blue 10, green 25, black 100, purple 500, gold 1000', () => {
    expect([1, 5, 10, 25, 100, 500, 1000].map(v => chipColor(v).fill))
      .toEqual(['#e8eaed', '#c41e3a', '#1e3a8a', '#15803d', '#1c1917', '#6d28d9', '#d4a847'])
  })

  it('an in-between value takes the colour of the denomination below it', () => {
    expect(chipColor(50).fill).toBe(chipColor(25).fill)
    expect(chipColor(250).fill).toBe(chipColor(100).fill)
  })
})

describe('chipBreakdown', () => {
  it('cuts a bet into chips, largest first', () => {
    expect(chipBreakdown(175)).toEqual([100, 25, 25, 25])
    expect(chipBreakdown(25)).toEqual([25])
    expect(chipBreakdown(1630)).toEqual([1000, 500, 100, 25, 5])
  })

  it('no bet is no chips, and cents are not chips', () => {
    expect(chipBreakdown(0)).toEqual([])
    expect(chipBreakdown(-20)).toEqual([])
    expect(chipBreakdown(37.5)).toEqual([25, 5, 5, 1, 1])
  })
})

describe('Chip', () => {
  it('prints its label in the ink of its colour', () => {
    const { container } = render(<Chip value={100} label="$100" />)
    const text = container.querySelector('text')
    expect(text?.textContent).toBe('$100')
    expect(text?.getAttribute('fill')).toBe('#ffffff')
  })
})

describe('ChipStack', () => {
  it('shows an empty betting spot when nothing is bet', () => {
    render(<ChipStack amount={0} />)
    expect(screen.getByTestId('bet-spot')).toBeInTheDocument()
  })

  it('stacks one chip per denomination piece and prints the total on the top one', () => {
    const { container } = render(<ChipStack amount={175} />)
    expect(container.querySelectorAll('svg')).toHaveLength(4)
    expect([...container.querySelectorAll('text')].map(t => t.textContent)).toEqual(['$175'])
  })

  it('never draws more than six chips', () => {
    const { container } = render(<ChipStack amount={24} />)   // 5,5,5,5,1,1,1,1
    expect(container.querySelectorAll('svg')).toHaveLength(6)
  })

  it('a won bet is paid with a second stack; a push is not', () => {
    const { rerender } = render(<ChipStack amount={50} outcome="win" />)
    expect(screen.getByTestId('payout-stack')).toBeInTheDocument()
    rerender(<ChipStack amount={50} outcome="blackjack" />)
    expect(screen.getByTestId('payout-stack')).toBeInTheDocument()
    rerender(<ChipStack amount={50} outcome="push" />)
    expect(screen.queryByTestId('payout-stack')).not.toBeInTheDocument()
  })

  it('a lost bet is marked as taken', () => {
    render(<ChipStack amount={50} outcome="loss" />)
    expect(screen.getByTestId('bet-stack')).toHaveAttribute('data-outcome', 'loss')
    expect(screen.queryByTestId('payout-stack')).not.toBeInTheDocument()
  })
})
