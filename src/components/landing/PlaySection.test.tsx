import { createRef, type PropsWithChildren } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({}, { get: () => () => {} }),
}))
// Decoration, with its own tests; here it would only bring framer-motion along.
vi.mock('./Reveal', () => ({ Reveal: ({ children }: PropsWithChildren) => <div>{children}</div> }))

import { PlaySection, PLAY_SECTION_ID, type PlaySectionHandle } from './PlaySection'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { DEFAULT_RULES } from '../../engine/rules/types'
import { lookupBasicAction } from '../../engine/strategy/flashcards'
import { S17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import { GUEST_ROUND_HANDS, guestRoundSince } from '../../services/guest-trial'

function open() {
  const handle = createRef<PlaySectionHandle>()
  const view = render(<MemoryRouter><PlaySection ref={handle} /></MemoryRouter>)
  return { handle, view }
}

const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>()

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

beforeEach(() => {
  localStorage.clear()
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  stubReducedMotion(false)
  useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false }, flashFocus: null })
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PlaySection — what the prerendered page carries', () => {
  it('is in the server’s HTML: the anchor, a second-level heading, the sentence and the start button', () => {
    const html = renderToString(<MemoryRouter><PlaySection /></MemoryRouter>)
    expect(html).toContain(`id="${PLAY_SECTION_ID}"`)
    expect(html).toMatch(/<h2[^>]*>.*Play a round of blackjack basic strategy.*right here.*<\/h2>/)
    expect(html).toContain('Ten hands, no account.')
    expect(html).toContain('data-testid="try-start"')
    // The landing has its one h1 in the hero.
    expect(html).not.toContain('<h1')
  })

  it('names what it is in a heading and shows the intro until someone plays', () => {
    open()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Play a round of blackjack basic strategy — right here.')
    expect(screen.getByTestId('try-intro')).toHaveTextContent('10 hands')
    expect(screen.queryByTestId('question-progress')).not.toBeInTheDocument()
    // Reading the page does not stamp a round on the device.
    expect(guestRoundSince()).toBeNull()
  })
})

describe('PlaySection — starting a round', () => {
  it('deals the first hand where the intro stood when its own button is pressed', async () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    expect(await screen.findByTestId('question-progress')).toHaveTextContent('Question 1/10')
    expect(screen.queryByTestId('try-intro')).not.toBeInTheDocument()
    expect(screen.getByTestId('play-stage')).toContainElement(screen.getByTestId('question-progress'))
    expect(guestRoundSince()).not.toBeNull()
    // Only as far as needed: the visitor is already looking at it.
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
  })

  it('comes up under the header and takes the focus when the page asks for a round', async () => {
    const { handle } = open()
    act(() => handle.current?.start())
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(screen.getByTestId('play-stage')).toHaveFocus()
    expect(await screen.findByTestId('question-progress')).toHaveTextContent('Question 1/10')
    // The heading stays: it is the section's, not the intro card's.
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('does not animate the scroll for a visitor who asked for less motion', async () => {
    stubReducedMotion(true)
    const { handle } = open()
    act(() => handle.current?.start())
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    await screen.findByTestId('question-progress')
  })
})

describe('PlaySection — the end of the round', () => {
  it('offers the account and nothing else — the page itself continues below', async () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    await screen.findByTestId('question-progress')
    for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
      const hand = screen.getByTestId('player-hand').textContent ?? ''
      const dealer = screen.getByTestId('dealer-card').textContent ?? ''
      fireEvent.click(screen.getByTestId(`action-${String(lookupBasicAction(hand, dealer, S17_STRATEGY)).toLowerCase()}`))
      fireEvent.click(screen.getByTestId('next-question'))
    }
    const summary = screen.getByTestId('try-summary')
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/10')
    expect(within(summary).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/login'])
    expect(screen.getByTestId('play-stage')).toContainElement(summary)
  })
})
