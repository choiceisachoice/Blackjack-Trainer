import React, { createRef, type PropsWithChildren } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const sounds = vi.hoisted(() => ({ prime: vi.fn() }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({}, { get: (_t, k) => (k === 'prime' ? sounds.prime : () => {}), set: () => true }),
}))
// Decoration, with its own tests; here it would only bring framer-motion along.
vi.mock('./Reveal', () => ({ Reveal: ({ children }: PropsWithChildren) => <div>{children}</div> }))
vi.mock('framer-motion', async () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-') || k.startsWith('aria-') || ['className', 'style', 'onClick', 'id', 'role'].includes(k)))
  return {
    motion: new Proxy({}, {
      get: (_t, tag: string) => ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(p), children),
    }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
  }
})
vi.mock('../table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))

import { PlaySection, PLAY_SECTION_ID, type PlaySectionHandle } from './PlaySection'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { usePlanPriceStore } from '../../store/plan-price-store'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { GUEST_ROUND_HANDS, guestRoundSince } from '../../services/guest-trial'

function open() {
  const handle = createRef<PlaySectionHandle>()
  const view = render(<MemoryRouter><PlaySection ref={handle} /></MemoryRouter>)
  return { handle, view }
}

const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>()
const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })
/** 10,6 against a 10 that stands on 17, every hand. */
const SIXTEEN_VS_TEN = [c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven, Suit.Hearts)]

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

/** The round's code arrives as a dynamic import: let it, then let the deal run. */
async function dealt() {
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  localStorage.clear()
  scrollIntoView.mockClear()
  sounds.prime.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  stubReducedMotion(false)
  useAppStore.setState({ dealingSpeed: 'fast' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
  usePlanPriceStore.setState({ status: 'error', plans: [], load: async () => {} })
  let n = 0
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => SIXTEEN_VS_TEN[n++ % SIXTEEN_VS_TEN.length])
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('PlaySection — what the prerendered page carries', () => {
  it('is in the server’s HTML: the anchor, a second-level heading, the sentence and the empty table with its button', () => {
    const html = renderToString(<MemoryRouter><PlaySection /></MemoryRouter>)
    expect(html).toContain(`id="${PLAY_SECTION_ID}"`)
    expect(html).toMatch(/<h2[^>]*>.*Play ten hands at the table.*right here.*<\/h2>/)
    expect(html).toContain('Real cards, play money, no account.')
    expect(html).toContain('data-testid="felt-table"')
    expect(html).toContain('data-testid="try-start"')
    // No card dealt at build time: a hand in the HTML would be swapped for another the moment the page starts.
    expect(html).not.toContain('data-card=')
    // The landing has its one h1 in the hero.
    expect(html).not.toContain('<h1')
  })

  it('names what it is in a heading and shows the empty table until someone plays', () => {
    open()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Play ten hands at the table — right here.')
    expect(screen.getByTestId('try-intro')).toBeInTheDocument()
    expect(screen.queryByTestId('action-controls')).not.toBeInTheDocument()
    expect(guestRoundSince()).toBeNull()
  })
})

describe('PlaySection — starting a round', () => {
  it('deals the first hand on the felt the intro showed when its own button is pressed', async () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    // The sound may start from this click; the deal itself runs on timers.
    expect(sounds.prime).toHaveBeenCalled()
    await dealt()
    const stage = screen.getByTestId('play-stage')
    expect(within(stage).getByTestId('action-controls')).toBeInTheDocument()
    expect(within(stage).getByTestId('trial-status')).toHaveTextContent('Hand 1 / 10')
    expect(screen.queryByTestId('try-intro')).not.toBeInTheDocument()
    // Only as far as needed: the visitor is already looking at it.
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
  })

  it('comes up under the header and takes the focus when the page asks for a round', async () => {
    const { handle } = open()
    act(() => handle.current?.start())
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(screen.getByTestId('play-stage')).toHaveFocus()
    await dealt()
    expect(screen.getByTestId('action-controls')).toBeInTheDocument()
    // The heading stays: it is the section's, not the table's.
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('does not animate the scroll for a visitor who asked for less motion', async () => {
    stubReducedMotion(true)
    const { handle } = open()
    act(() => handle.current?.start())
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    await dealt()
  })
})

describe('PlaySection — the end of the round', () => {
  it('ends in the stage on the summary: Pro, the free account, another round', async () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    await dealt()
    for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
      fireEvent.click(screen.getByTestId('action-surrender'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
      fireEvent.click(screen.getByTestId('next-hand'))
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    }
    const summary = screen.getByTestId('try-summary')
    expect(screen.getByTestId('play-stage')).toContainElement(summary)
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/10')
    expect(within(summary).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/login'])
    expect(within(summary).getByTestId('try-pro')).toBeInTheDocument()

    // Another round brings the table back into view: the summary is taller on a phone.
    scrollIntoView.mockClear()
    fireEvent.click(screen.getByTestId('try-again'))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 1 / 10')
  })
})
