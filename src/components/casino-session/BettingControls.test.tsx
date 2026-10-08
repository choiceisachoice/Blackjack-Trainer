import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { BettingControls } from './BettingControls'

/**
 * A bet spread is only practice if the bet can be any amount the spread calls
 * for. With chips alone, $160 on a $20–$320 table meant one $100 and three $20
 * clicks, and the whole point of the drill — sizing the bet to the count, fast —
 * drowned in clicking. The amount can now be typed; the chips still add on top.
 *
 * Keystrokes are fired one at a time and appended to what the field shows, the
 * way a person types (see CasinoSessionConfig.test.tsx for why that matters).
 */
afterEach(cleanup)

/** The real component under a parent that holds the bet, as the game does. */
function Harness({ bankroll = 5000, onConfirm = () => {} }: { bankroll?: number; onConfirm?: (bet: number) => void }) {
  const [bet, setBet] = useState(0)
  return <BettingControls currentBet={bet} minBet={20} maxBet={320} bankroll={bankroll} onBetChange={setBet} onConfirm={() => onConfirm(bet)} />
}

const amount = () => screen.getByRole('spinbutton', { name: 'Bet amount' }) as HTMLInputElement
const typeInto = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: '' } })
  for (const ch of text) fireEvent.change(input, { target: { value: input.value + ch } })
}

describe('BettingControls — typed bet', () => {
  it('deals a typed bet of 160', () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    typeInto(amount(), '160')
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$160')
    fireEvent.click(screen.getByTestId('confirm-bet'))
    expect(onConfirm).toHaveBeenCalledWith(160)
  })

  it('keeps the chips adding on top of a typed amount', () => {
    render(<Harness />)
    typeInto(amount(), '40')
    fireEvent.click(screen.getByTestId('chip-20'))
    expect(amount()).toHaveValue(60)
  })

  it('shows what the chips have placed', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('chip-50'))
    fireEvent.click(screen.getByTestId('chip-25'))
    expect(amount()).toHaveValue(75)
  })

  it('brings a typed amount inside the table limits when the field is left', () => {
    render(<Harness />)
    typeInto(amount(), '5')
    fireEvent.blur(amount())
    expect(amount()).toHaveValue(20)
    typeInto(amount(), '1000')
    fireEvent.blur(amount())
    expect(amount()).toHaveValue(320)
  })

  it('never takes more than the bankroll holds', () => {
    render(<Harness bankroll={250} />)
    typeInto(amount(), '300')
    fireEvent.blur(amount())
    expect(amount()).toHaveValue(250)
  })

  it('goes back to no bet when the field is emptied and left', () => {
    render(<Harness />)
    typeInto(amount(), '100')
    fireEvent.change(amount(), { target: { value: '' } })
    fireEvent.blur(amount())
    expect(amount()).toHaveDisplayValue('')
    expect(screen.getByTestId('confirm-bet')).toHaveTextContent('$20')
  })

  it('clears a typed bet with the Clear button', () => {
    render(<Harness />)
    typeInto(amount(), '80')
    fireEvent.click(screen.getByTestId('clear-bet'))
    expect(amount()).toHaveDisplayValue('')
  })
})
