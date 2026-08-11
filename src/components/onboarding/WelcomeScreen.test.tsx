import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { WelcomeScreen } from './WelcomeScreen'
import { buildWelcomeCopy, freeStageCount } from './welcome-content'
import { CURRICULUM } from '../../services/curriculum'
import i18next from 'i18next'

/** The copy is built from messages now, so the tests need a translator. */
const copyFor = (isPro: boolean) => buildWelcomeCopy(isPro, i18next.t)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('welcome copy', () => {
  it('says something different to a paying account', () => {
    const free = copyFor(false)
    const pro = copyFor(true)
    expect(pro.headline).not.toBe(free.headline)
    expect(pro.subhead).not.toBe(free.subhead)
    expect(pro.eyebrow).not.toBe(free.eyebrow)
  })

  it('derives its numbers instead of stating them', () => {
    const free = copyFor(false)
    expect(free.subhead).toContain(`${CURRICULUM.length} stages`)
    expect(free.steps[2].body).toContain(`${freeStageCount()} of the ${CURRICULUM.length} stages`)

    const pro = copyFor(true)
    expect(pro.subhead).toContain(`All ${CURRICULUM.length} stages`)
  })

  it('counts free stages as the ones a free account can actually drill', () => {
    // Not a hardcoded number: it must fall out of which drills are Pro-gated.
    expect(freeStageCount()).toBeGreaterThan(0)
    expect(freeStageCount()).toBeLessThan(CURRICULUM.length)
  })

  it('mentions the paywall to a free account and never to a paying one', () => {
    expect(copyFor(false).footnote).toMatch(/Pro unlocks/)
    expect(copyFor(true).footnote).toBeNull()
  })

  it('keeps every step to a single short line, so the screen fits a laptop', () => {
    // Three paragraphs of explanation pushed the only button off a 600px window.
    for (const isPro of [false, true]) {
      for (const step of copyFor(isPro).steps) {
        expect(step.body.length, step.title).toBeLessThanOrEqual(80)
      }
    }
  })

  it('offers exactly one action, whichever tier', () => {
    for (const isPro of [false, true]) {
      expect(copyFor(isPro).cta.length).toBeGreaterThan(0)
      expect(copyFor(isPro).steps).toHaveLength(3)
    }
  })
})

describe('WelcomeScreen', () => {
  it('greets a free account', () => {
    render(<WelcomeScreen isPro={false} onStart={vi.fn()} />)
    const copy = copyFor(false)

    expect(screen.getByTestId('welcome-screen')).toBeInTheDocument()
    expect(screen.getByText(copy.headline)).toBeInTheDocument()
    expect(screen.getByTestId('welcome-eyebrow')).toHaveTextContent(copy.eyebrow)
    expect(screen.getByTestId('welcome-footnote')).toBeInTheDocument()
  })

  it('greets a Pro account differently', () => {
    render(<WelcomeScreen isPro onStart={vi.fn()} />)
    expect(screen.getByText(copyFor(true).headline)).toBeInTheDocument()
    // Nothing left to sell.
    expect(screen.queryByTestId('welcome-footnote')).toBeNull()
  })

  it('lists all three steps in order', () => {
    render(<WelcomeScreen isPro={false} onStart={vi.fn()} />)
    for (const step of copyFor(false).steps) {
      expect(screen.getByText(step.title)).toBeInTheDocument()
    }
  })

  it('starts the placement test', () => {
    const onStart = vi.fn()
    render(<WelcomeScreen isPro={false} onStart={onStart} />)
    fireEvent.click(screen.getByTestId('welcome-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('never hides content behind an animation', () => {
    // The entrance animates transform only. An element whose visibility depends
    // on an animation completing is blank in any tab where animations are
    // frozen — measured, not hypothetical.
    const { container } = render(<WelcomeScreen isPro={false} onStart={vi.fn()} />)
    for (const el of container.querySelectorAll<HTMLElement>('.rise-in')) {
      expect(el.style.opacity).toBe('')
      expect(el.style.animationDelay).toMatch(/^[\d.]+s$/)
    }
  })
})
