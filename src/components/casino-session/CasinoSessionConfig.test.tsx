import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CasinoSessionConfigView } from './CasinoSessionConfig'
import { DEFAULT_CONFIG } from './helpers'

/**
 * The amounts on the setup screen have to be typeable, not only steppable.
 * The field used to clamp on every keystroke: clearing it put the minimum of
 * 100 straight back, and the first digit of "250" did the same, so the number
 * could never be written — only reached with the arrows, in steps of 100.
 *
 * Each keystroke is fired as its own change event and appended to what the
 * field shows *after the previous one*, the way a person types. Firing the
 * finished string in one event would pass against the broken field.
 */
afterEach(cleanup)

const setup = () => {
  const onStart = vi.fn()
  render(<CasinoSessionConfigView initialConfig={DEFAULT_CONFIG} onStart={onStart} />)
  return onStart
}

/** Clears the field, then types `text` one character at a time. */
const typeInto = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: '' } })
  for (const ch of text) fireEvent.change(input, { target: { value: input.value + ch } })
}

const field = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement
const bankroll = () => field('Starting bankroll')

describe('CasinoSessionConfigView — amounts', () => {
  it('takes a typed starting bankroll of 250', () => {
    const onStart = setup()
    typeInto(bankroll(), '250')
    expect(bankroll()).toHaveValue(250)
    fireEvent.click(screen.getByTestId('start-session'))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ startingBankroll: 250 }))
  })

  it('takes typed minimum and maximum bets', () => {
    const onStart = setup()
    typeInto(field('Min bet'), '15')
    typeInto(field('Max bet'), '750')
    fireEvent.click(screen.getByTestId('start-session'))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ minBet: 15, maxBet: 750 }))
  })

  it('lets the field be empty while typing, and puts the last amount back if left empty', () => {
    setup()
    fireEvent.change(bankroll(), { target: { value: '' } })
    expect(bankroll()).toHaveDisplayValue('')
    fireEvent.blur(bankroll())
    expect(bankroll()).toHaveValue(DEFAULT_CONFIG.startingBankroll)
  })

  it('brings an amount outside the limits back inside them when the field is left', () => {
    const onStart = setup()
    typeInto(bankroll(), '50')
    fireEvent.blur(bankroll())
    expect(bankroll()).toHaveValue(100)
    typeInto(bankroll(), '999999')
    fireEvent.blur(bankroll())
    expect(bankroll()).toHaveValue(100000)
    fireEvent.click(screen.getByTestId('start-session'))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ startingBankroll: 100000 }))
  })

  it('confirms a typed amount with Enter', () => {
    setup()
    typeInto(bankroll(), '50')
    fireEvent.keyDown(bankroll(), { key: 'Enter' })
    expect(bankroll()).toHaveValue(100)
  })

  it('still steps with the arrows', () => {
    const onStart = setup()
    fireEvent.change(bankroll(), { target: { value: String(DEFAULT_CONFIG.startingBankroll + 100) } })
    expect(bankroll()).toHaveValue(DEFAULT_CONFIG.startingBankroll + 100)
    fireEvent.click(screen.getByTestId('start-session'))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ startingBankroll: DEFAULT_CONFIG.startingBankroll + 100 }))
  })
})
