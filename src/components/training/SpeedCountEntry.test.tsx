import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpeedCountEntry } from './SpeedCountEntry'
import { parseCount } from './speed-drill-model'

/** The entry as the drill holds it: the text in state, the answer parsed on submit. */
function Harness({ onSubmit = () => {}, picks = [-3, -2, -1, 0, 1, 2, 3] }: { onSubmit?: (n: number) => void; picks?: number[] }) {
  const [draft, setDraft] = useState('')
  return <SpeedCountEntry draft={draft} onDraft={setDraft} onSubmit={() => onSubmit(parseCount(draft))} picks={picks} />
}

describe('reading a typed count', () => {
  it('reads signs the way people type them', () => {
    expect(parseCount('-3')).toBe(-3)
    expect(parseCount('−3')).toBe(-3)
    expect(parseCount('+2')).toBe(2)
    expect(parseCount(' 4 ')).toBe(4)
  })

  it('reads half points with either decimal mark (Wong Halves)', () => {
    expect(parseCount('1.5')).toBe(1.5)
    expect(parseCount('1,5')).toBe(1.5)
  })

  it('reads an empty or half-typed field as the 0 it shows', () => {
    expect(parseCount('')).toBe(0)
    expect(parseCount('-')).toBe(0)
    expect(parseCount('abc')).toBe(0)
  })
})

describe('the count entry', () => {
  it('keeps a negative count as typed — "-1" used to be recorded as "+1"', () => {
    // The field held a number: the "-" of "-1" read as empty, became 0, and
    // the field was rewritten to "0" before the 1 arrived. It holds the text now.
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    const input = screen.getByTestId('count-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: '-1' } })
    expect(input.value).toBe('−1')
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(onSubmit).toHaveBeenCalledWith(-1)
  })

  it('offers a chip for every quick pick, and a tap sets the answer', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(7)
    fireEvent.click(screen.getByTestId('pick--2'))
    expect(screen.getByTestId('pick--2')).toHaveAttribute('aria-pressed', 'true')
    expect((screen.getByTestId('count-input') as HTMLInputElement).value).toBe('−2')
    fireEvent.click(screen.getByTestId('submit-answer'))
    expect(onSubmit).toHaveBeenCalledWith(-2)
  })

  it('marks no chip before anything is entered, not even 0', () => {
    render(<Harness />)
    expect(screen.getByTestId('pick-0')).toHaveAttribute('aria-pressed', 'false')
  })

  it('steps by one from what is in the field, an empty field counting as 0', () => {
    render(<Harness />)
    const input = screen.getByTestId('count-input') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Decrease count' }))
    expect(input.value).toBe('−1')
    fireEvent.click(screen.getByRole('button', { name: 'Increase count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase count' }))
    expect(input.value).toBe('1')
  })

  it('steps with the arrow keys in the field', () => {
    render(<Harness />)
    const input = screen.getByTestId('count-input') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('−2')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('−1')
  })

  it('drops what is not part of a count as it is typed', () => {
    render(<Harness />)
    const input = screen.getByTestId('count-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '4x' } })
    expect(input.value).toBe('4')
  })

  it('prints the chips signed, as the app prints counts', () => {
    render(<Harness />)
    expect(screen.getByTestId('pick--3')).toHaveTextContent('−3')
    expect(screen.getByTestId('pick-3')).toHaveTextContent('+3')
    expect(screen.getByTestId('pick-0')).toHaveTextContent('0')
  })

  it('asks the question on the felt', () => {
    render(<Harness />)
    expect(screen.getByTestId('count-question')).toHaveTextContent('What is the Running Count?')
  })

  it('says when half points are accepted', () => {
    render(<SpeedCountEntry draft="" onDraft={() => {}} onSubmit={() => {}} picks={[0]} fractional />)
    expect(screen.getByText(/Wong Halves/)).toBeInTheDocument()
  })
})
