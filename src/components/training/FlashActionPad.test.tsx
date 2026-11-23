import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Action } from '../../engine/rules/types'
import { FlashActionPad } from './FlashActionPad'
import { ACTION_SHORTCUT, actionForKey, formatPercent } from './deviation-utils'

const ALL_ON: Record<Action, boolean> = {
  [Action.Hit]: true, [Action.Stand]: true, [Action.Double]: true,
  [Action.Split]: true, [Action.Surrender]: true, [Action.Insurance]: true,
}
const NO_PAIR: Record<Action, boolean> = { ...ALL_ON, [Action.Split]: false, [Action.Insurance]: false }

describe('FlashActionPad', () => {
  it('offers all six plays, in the fixed order, with their names', () => {
    render(<FlashActionPad enabled={ALL_ON} onAnswer={() => {}} answered={null} />)
    const names = screen.getAllByRole('button').map(b => b.textContent?.replace(/[A-Z]$/, ''))
    expect(names).toEqual(['Hit', 'Stand', 'Double', 'Split', 'Surrender', 'Insurance'])
  })

  it('answers with the play pressed', () => {
    const onAnswer = vi.fn()
    render(<FlashActionPad enabled={ALL_ON} onAnswer={onAnswer} answered={null} />)
    fireEvent.click(screen.getByTestId('action-double'))
    expect(onAnswer).toHaveBeenCalledWith(Action.Double)
  })

  it('shows a play the hand does not offer, disabled, and never answers with it', () => {
    const onAnswer = vi.fn()
    render(<FlashActionPad enabled={NO_PAIR} onAnswer={onAnswer} answered={null} />)
    expect(screen.getByTestId('action-split')).toBeDisabled()
    expect(screen.getByTestId('action-insurance')).toBeDisabled()
    fireEvent.click(screen.getByTestId('action-split'))
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('names each play’s key for keyboard users', () => {
    render(<FlashActionPad enabled={NO_PAIR} onAnswer={() => {}} answered={null} />)
    expect(screen.getByTestId('action-hit')).toHaveAttribute('aria-keyshortcuts', 'H')
    expect(screen.getByTestId('action-surrender')).toHaveAttribute('aria-keyshortcuts', 'R')
    expect(screen.getByTestId('action-split')).not.toHaveAttribute('aria-keyshortcuts')
  })

  it('once answered, takes no more answers and marks the right play and the wrong pick', () => {
    const onAnswer = vi.fn()
    render(<FlashActionPad enabled={ALL_ON} onAnswer={onAnswer} answered={{ chosen: Action.Hit, correct: Action.Stand }} />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    fireEvent.click(screen.getByTestId('action-stand'))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByTestId('action-stand').className).toContain('ring-success')
    expect(screen.getByTestId('action-hit').className).toContain('ring-error')
    expect(screen.getByTestId('action-double').className).not.toMatch(/ring-(success|error)/)
  })
})

describe('the answer keys', () => {
  it('are the casino table’s, plus I for insurance, in either case', () => {
    expect(actionForKey('h')).toBe(Action.Hit)
    expect(actionForKey('S')).toBe(Action.Stand)
    expect(actionForKey('d')).toBe(Action.Double)
    expect(actionForKey('p')).toBe(Action.Split)
    expect(actionForKey('r')).toBe(Action.Surrender)
    expect(actionForKey('i')).toBe(Action.Insurance)
    expect(actionForKey('x')).toBeNull()
    expect(actionForKey('Enter')).toBeNull()
  })

  it('are one key per play', () => {
    expect(new Set(Object.values(ACTION_SHORTCUT)).size).toBe(6)
  })
})

describe('formatPercent', () => {
  it('writes a share the way the reader’s language does', () => {
    expect(formatPercent(0.8, 'en')).toBe('80%')
    expect(formatPercent(0.8, 'de').replace(/\s/g, ' ')).toBe('80 %')
    expect(formatPercent(0.8, 'tr')).toBe('%80')
    expect(formatPercent(2 / 3, 'en')).toBe('67%')
  })
})
