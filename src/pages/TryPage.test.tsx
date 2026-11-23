import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

/**
 * The trial round as a visitor meets it at `/try`. Supabase is "configured"
 * here and the auth store is a stand-in, because the page's one decision —
 * who may play — only exists with accounts.
 */
const auth = vi.hoisted(() => ({ status: 'signedOut' as string }))
vi.mock('../store/auth-store', () => ({
  useAuthStore: Object.assign(
    () => auth.status,
    { getState: () => ({ status: auth.status, user: null }), setState: vi.fn(), subscribe: () => () => {} },
  ),
  isSupabaseConfigured: true,
}))
vi.mock('../services/sound-engine', () => ({
  soundEngine: new Proxy({}, { get: () => () => {}, set: () => true }),
}))
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
vi.mock('../components/table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))

import { TryPage } from './TryPage'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { usePlanPriceStore } from '../store/plan-price-store'
import { Shoe } from '../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../engine/shoe/types'
import { GUEST_ROUND_HANDS, guestRoundSince } from '../services/guest-trial'
import { setLocalOwner } from '../services/storage/local-owner'

function Where() {
  const { pathname, state } = useLocation()
  return <span data-testid="where" data-state={JSON.stringify(state)}>{pathname}</span>
}

const page = (state: unknown) => (
  <MemoryRouter initialEntries={[{ pathname: '/try', state }]}>
    <Routes>
      <Route path="/try" element={<TryPage />} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>
)
const open = (state: unknown = null) => render(page(state))

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })
/** 10,6 against a 10 that stands on 17, every hand. */
const SIXTEEN_VS_TEN = [c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven, Suit.Hearts)]
const tick = (ms = 10_000) => act(() => { vi.advanceTimersByTime(ms) })

/** Play every hand with `play`, then on to the next, until the summary. */
function playAll(play: string) {
  for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
    tick()
    fireEvent.click(screen.getByTestId(`action-${play}`))
    tick()
    fireEvent.click(screen.getByTestId('next-hand'))
  }
  tick()
}

const scrollIntoView = vi.fn<(options?: ScrollIntoViewOptions) => void>()

beforeEach(() => {
  vi.useFakeTimers()
  auth.status = 'signedOut'
  localStorage.clear()
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  useAppStore.setState({ dealingSpeed: 'fast' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null })
  usePlanPriceStore.setState({ status: 'error', plans: [], load: async () => {} })
  let n = 0
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => SIXTEEN_VS_TEN[n++ % SIXTEEN_VS_TEN.length])
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('TryPage — the first screen', () => {
  it('says what this is above the table, and offers one way to begin', () => {
    open()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Play ten hands of blackjack at the table')
    expect(screen.getByTestId('try-page')).toHaveTextContent('Real cards, play money, no account.')
    expect(within(screen.getByTestId('try-stage')).getByTestId('felt-table')).toBeInTheDocument()
    expect(screen.getByTestId('try-start')).toBeInTheDocument()
    // None of the setup an account holder gets: no chips to choose, no table settings.
    expect(screen.queryByTestId('confirm-bet')).not.toBeInTheDocument()
    expect(screen.queryByTestId('start-session')).not.toBeInTheDocument()
  })

  it('has its own title, description and canonical', () => {
    open()
    expect(document.title).toMatch(/basic strategy/i)
    expect(document.title).toMatch(/table/i)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://black-jack-training.com/try')
  })

  it('opens on the first hand when the visitor arrives from a button that already said "deal"', () => {
    open({ autoStart: true })
    expect(screen.queryByTestId('try-start')).not.toBeInTheDocument()
    tick()
    expect(screen.getByTestId('action-controls')).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
  })

  it('does not repeat the shell’s closing call to action — the page asks once, at the end', () => {
    open()
    expect(screen.queryByText('Ready to make the count automatic?')).not.toBeInTheDocument()
  })
})

describe('TryPage — the round', () => {
  it('is a basic-strategy table: no count asked, nothing asked of the visitor while it is played', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    tick()
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 1 / 10')
    expect(screen.queryByTestId('rc-input')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('action-stand'))
    tick()
    expect(screen.queryByTestId('try-signup')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('brings the table up whole when the first hand is dealt', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
  })
})

describe('TryPage — the end', () => {
  it('shows the decisions, each miss with the play that was right, and the next step', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    playAll('stand')
    expect(screen.getByTestId('try-score')).toHaveTextContent('0/10')
    const rows = within(screen.getByTestId('try-misses')).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('16 vs. 10')
    expect(within(rows[0]).getAllByRole('cell')[1]).toHaveTextContent('Surrender')
    const summary = screen.getByTestId('try-summary')
    expect(within(summary).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/login'])
    fireEvent.click(screen.getByTestId('try-signup'))
    expect(screen.getByTestId('where')).toHaveTextContent('/login')
    expect(screen.getByTestId('where').dataset.state).toBe(JSON.stringify({ mode: 'signup' }))
  })

  it('says so when nothing was missed', () => {
    open()
    fireEvent.click(screen.getByTestId('try-start'))
    playAll('surrender')
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/10')
    expect(screen.getByTestId('try-perfect')).toBeInTheDocument()
  })

  it('records nothing — the round is nobody’s, and the summary does not promise otherwise', () => {
    // Until 23 Nov 2026 the round was recorded and handed to the account
    // created afterwards; this test asserted the recording. The table records
    // nothing on purpose (see `TrialRound`), so the assertion is turned around.
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const view = open()
    fireEvent.click(screen.getByTestId('try-start'))
    playAll('stand')
    expect(screen.getByTestId('try-summary')).not.toHaveTextContent(/keep this result/i)
    view.unmount()
    expect(recordSession).not.toHaveBeenCalled()
    expect(guestRoundSince()).toBeNull()
  })
})

describe('TryPage — who it is not for', () => {
  it('sends a signed-in visitor to the app', () => {
    auth.status = 'signedIn'
    open()
    expect(screen.getByTestId('where')).toHaveTextContent('/app')
  })

  it('takes a round already on screen away when the session turns out to be signed in, filing nothing', () => {
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const view = open({ autoStart: true })
    tick()
    fireEvent.click(screen.getByTestId('action-stand'))
    tick()
    auth.status = 'signedIn'
    view.rerender(page(null))
    expect(screen.getByTestId('where')).toHaveTextContent('/app')
    expect(recordSession).not.toHaveBeenCalled()
  })

  it('plays the same on a device that still holds an account’s data, and files nothing there either', () => {
    setLocalOwner('someone')
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const view = open()
    fireEvent.click(screen.getByTestId('try-start'))
    playAll('surrender')
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/10')
    view.unmount()
    expect(recordSession).not.toHaveBeenCalled()
  })
})
