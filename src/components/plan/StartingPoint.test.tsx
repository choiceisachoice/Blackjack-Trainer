import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StartingPoint } from './StartingPoint'
import { ENTRY_OPTIONS } from '../../services/starting-point'
import i18next from 'i18next'

afterEach(cleanup)

describe('the one question', () => {
  it('asks exactly one thing and offers every rung', () => {
    render(<StartingPoint onPick={() => {}} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/where are you starting from/i)
    for (const o of ENTRY_OPTIONS) {
      expect(screen.getByTestId(`entry-${o.value}`), o.value).toBeInTheDocument()
    }
  })

  it('shows only one heading — there is no second step to introduce', () => {
    render(<StartingPoint onPick={() => {}} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('hands back the whole option, not just an id', () => {
    // The caller needs the stage to place the learner and the value to word
    // the recommendation. Passing one and looking up the other is how the two
    // drift apart.
    const onPick = vi.fn()
    render(<StartingPoint onPick={onPick} />)

    fireEvent.click(screen.getByTestId('entry-counting'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toMatchObject({ value: 'counting', stage: 'true-count' })
  })

  it('reports every option distinctly', () => {
    const seen: string[] = []
    for (const o of ENTRY_OPTIONS) {
      const { unmount } = render(<StartingPoint onPick={p => seen.push(p.stage)} />)
      fireEvent.click(screen.getByTestId(`entry-${o.value}`))
      unmount()
    }
    expect(new Set(seen).size).toBe(ENTRY_OPTIONS.length)
  })

  it('shows each option’s explanation, so people can pick honestly', () => {
    render(<StartingPoint onPick={() => {}} />)
    for (const o of ENTRY_OPTIONS) {
      expect(screen.getByTestId(`entry-${o.value}`)).toHaveTextContent(i18next.t(o.hintKey))
    }
  })
})

describe('the way past it', () => {
  it('offers an exit when one is given', () => {
    const onSkip = vi.fn()
    render(<StartingPoint onPick={() => {}} onSkip={onSkip} />)

    fireEvent.click(screen.getByTestId('starting-point-skip'))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('shows no exit when the caller offers none', () => {
    render(<StartingPoint onPick={() => {}} />)
    expect(screen.queryByTestId('starting-point-skip')).toBeNull()
  })
})

describe('how it arrives', () => {
  it('is readable on the first frame, animation or not', () => {
    // `.rise-in` animates into a visible base state rather than out of
    // opacity 0 — a JS entrance here once left the headline and the only
    // button invisible whenever requestAnimationFrame did not run.
    render(<StartingPoint onPick={() => {}} />)
    for (const o of ENTRY_OPTIONS) {
      const el = screen.getByTestId(`entry-${o.value}`)
      expect(el.className).toContain('rise-in')
      expect(el.style.opacity).not.toBe('0')
    }
  })
})
