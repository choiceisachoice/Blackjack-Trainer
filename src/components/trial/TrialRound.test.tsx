import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

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
const sounds = vi.hoisted(() => ({ prime: vi.fn() }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({ enabled: false, volume: 0 }, {
    get: (t, k) => (k === 'prime' ? sounds.prime : k in t ? t[k as keyof typeof t] : () => {}),
    set: () => true,
  }),
}))

import { TrialRound, type TrialRoundProps } from './TrialRound'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useCasinoTrialStore } from '../../store/casino-trial-store'
import { usePlanPriceStore } from '../../store/plan-price-store'
import { settleBeforeSignOut } from '../casino-session/record-session'
import { GUEST_ROUND_HANDS, guestRoundSince } from '../../services/guest-trial'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/**
 * The shoe, card by card. With nobody else at the table the deal goes: the
 * player's first card, the dealer's upcard, the player's second, the hole
 * card — then whatever is drawn. The sequence repeats.
 */
function shoe(cards: Card[]) {
  let n = 0
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => cards[n++ % cards.length])
}
/** 10,6 against a 10, the dealer standing on 17: a hand that takes no card unless asked. */
const SIXTEEN_VS_TEN = [c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven, Suit.Hearts)]

function Where() {
  const { pathname, state } = useLocation()
  return <span data-testid="where" data-state={JSON.stringify(state)}>{pathname}</span>
}

function open(props: TrialRoundProps = {}) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<TrialRound {...props} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Let the deal (or the dealer) run out. */
const settle = () => tick(10_000)

/** Stand on every hand and move on, until the summary. */
function standThrough(hands = GUEST_ROUND_HANDS) {
  for (let i = 0; i < hands; i++) {
    settle()
    fireEvent.click(screen.getByTestId('action-stand'))
    settle()
    fireEvent.click(screen.getByTestId('next-hand'))
  }
  settle()
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  sounds.prime.mockClear()
  useAppStore.setState({ dealingSpeed: 'fast' })
  usePlanPriceStore.setState({ status: 'error', plans: [], load: async () => {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('TrialRound — the table it opens on', () => {
  it('shows the empty felt and one button, and deals nothing until it is pressed', () => {
    shoe(SIXTEEN_VS_TEN)
    open()
    expect(screen.getByTestId('felt-table')).toBeInTheDocument()
    expect(screen.getByTestId('try-start')).toHaveTextContent('Deal the first hand')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    settle()
    expect(screen.queryByTestId('action-controls')).not.toBeInTheDocument()
    expect(document.querySelector('[data-card]')).toBeNull()
  })

  it('deals the first hand on the button, tells the host once, and wakes the sound in that click', () => {
    shoe(SIXTEEN_VS_TEN)
    const onStart = vi.fn()
    open({ onStart })
    fireEvent.click(screen.getByTestId('try-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(sounds.prime).toHaveBeenCalled()
    settle()
    expect(screen.getByTestId('action-controls')).toBeInTheDocument()
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 1 / 10')
  })

  it('deals at once when the host asks, and tells it once', () => {
    shoe(SIXTEEN_VS_TEN)
    const onStart = vi.fn()
    open({ autoStart: true, onStart })
    expect(screen.queryByTestId('try-start')).not.toBeInTheDocument()
    settle()
    expect(screen.getByTestId('action-controls')).toBeInTheDocument()
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})

describe('TrialRound — a hand at the table', () => {
  it('offers the moves the table allows, with no clock running', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    settle()
    expect(screen.getByTestId('action-hit')).toBeEnabled()
    expect(screen.getByTestId('action-stand')).toBeEnabled()
    expect(screen.getByTestId('action-double')).toBeEnabled()
    expect(screen.getByTestId('action-surrender')).toBeEnabled()
    expect(screen.getByTestId('action-split')).toBeDisabled()
    expect(screen.queryByTestId('decision-clock')).not.toBeInTheDocument()
  })

  it('names the spot and the right play after a hand played against basic strategy', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    settle()
    fireEvent.click(screen.getByTestId('action-stand'))
    settle()
    const verdict = screen.getByTestId('try-verdict')
    expect(verdict).toHaveAttribute('data-verdict', 'wrong')
    expect(verdict).toHaveTextContent('16 vs. 10: the right play was Surrender.')
    // The result stays on the felt beside it.
    expect(screen.getByTestId('human-settlement')).toHaveTextContent(/Loss/)
  })

  it('calls a hand right when it was, and deals the next one on one press', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    settle()
    fireEvent.click(screen.getByTestId('action-surrender'))
    settle()
    expect(screen.getByTestId('try-verdict')).toHaveAttribute('data-verdict', 'right')
    fireEvent.click(screen.getByTestId('next-hand'))
    settle()
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 2 / 10')
    expect(screen.getByTestId('action-controls')).toBeInTheDocument()
  })

  it('asks about insurance against an ace, and calls taking it wrong', () => {
    // 10,9 against an ace; the hole card is a six, so no blackjack.
    shoe([c(Rank.Ten), c(Rank.Ace, Suit.Hearts), c(Rank.Nine), c(Rank.Six, Suit.Hearts), c(Rank.Two), c(Rank.Ten, Suit.Clubs)])
    open({ autoStart: true })
    settle()
    expect(screen.getByTestId('insurance-controls')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('insurance-yes'))
    settle()
    fireEvent.click(screen.getByTestId('action-stand'))
    settle()
    expect(screen.getByTestId('try-verdict')).toHaveTextContent('Insurance: basic strategy never takes it.')
  })

  it('answers the casino table’s keys', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    settle()
    fireEvent.keyDown(window, { key: 'r' })
    settle()
    expect(screen.getByTestId('try-verdict')).toHaveAttribute('data-verdict', 'right')
    fireEvent.keyDown(window, { key: 'Enter' })
    settle()
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 2 / 10')
  })

  it('ignores the keys while the table is scrolled off screen, and Space always — it scrolls the page', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    settle()
    fireEvent.click(screen.getByTestId('action-surrender'))
    settle()
    fireEvent.keyDown(window, { key: ' ' })
    settle()
    expect(screen.getByTestId('try-verdict')).toBeInTheDocument()
    const far = { top: 3000, bottom: 3600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 3000, toJSON: () => ({}) }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(far as DOMRect)
    fireEvent.keyDown(window, { key: 'Enter' })
    settle()
    expect(screen.getByTestId('try-verdict')).toBeInTheDocument()
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 1 / 10')
  })
})

describe('TrialRound — the end of the ten hands', () => {
  it('sums the decisions up, lists the misses, and offers Pro, the account and another round', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    standThrough()
    const summary = screen.getByTestId('try-summary')
    expect(screen.getByTestId('try-score')).toHaveTextContent('0/10')
    expect(summary).toHaveTextContent('0 of 10 decisions played right')
    expect(screen.getByTestId('try-record')).toHaveTextContent('Won 0 · lost 10 · push 0')
    expect(screen.getByTestId('try-money').textContent).toMatch(/Play money -\$1.000/)
    const rows = within(screen.getByTestId('try-misses')).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveTextContent('16 vs. 10')
    expect(rows[0]).toHaveTextContent('Stand')
    expect(rows[0]).toHaveTextContent('Surrender')
    expect(screen.getByTestId('try-more-misses')).toHaveTextContent('And 5 more.')
    expect(screen.getByTestId('try-pro')).toBeInTheDocument()
    expect(screen.getByTestId('try-signup')).toHaveAttribute('href', '/login')
    expect(screen.getByTestId('try-again')).toBeInTheDocument()
  })

  it('promises nothing about keeping the result', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    standThrough()
    // The flashcard round said "Create a free account to keep this result".
    // This round is kept nowhere, so nothing may say it is.
    expect(screen.getByTestId('try-summary')).not.toHaveTextContent(/keep this|keep your|saved|kept|stored/i)
    expect(screen.getByTestId('try-free-line')).toHaveTextContent('Free: your training plan, and ten hands at the full table.')
  })

  it('names the price only once the store has it', () => {
    usePlanPriceStore.setState({
      status: 'ready',
      plans: [
        { id: 'monthly', amount: 890, currency: 'chf', interval: 'month' },
        { id: 'yearly', amount: 6900, currency: 'chf', interval: 'year' },
      ],
    })
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    standThrough()
    expect(screen.getByTestId('try-pro').textContent).toMatch(/Go Pro — CHF\s?69(\.00)?\/year/)
    expect(screen.getByTestId('try-pro-note')).toHaveTextContent(/35% off monthly/)
  })

  it('says the price comes at checkout when it could not be fetched', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    standThrough()
    expect(screen.getByTestId('try-pro')).toHaveTextContent('Go Pro →')
    expect(screen.getByTestId('try-pro-note')).toHaveTextContent('Price shown at checkout')
  })

  it('sends a visitor who chooses Pro to sign up first, with the plan remembered for after', () => {
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    standThrough()
    fireEvent.click(screen.getByTestId('try-pro'))
    expect(localStorage.getItem('bjt_pending_checkout')).toBe('yearly')
    expect(screen.getByTestId('where')).toHaveTextContent('/login')
    expect(screen.getByTestId('where').dataset.state).toBe(JSON.stringify({ mode: 'signup' }))
  })

  it('deals a fresh table for another round, and tells the host so it can bring the table up', () => {
    shoe(SIXTEEN_VS_TEN)
    const onStart = vi.fn()
    open({ autoStart: true, onStart })
    standThrough()
    expect(onStart).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('try-again'))
    expect(onStart).toHaveBeenCalledTimes(2)
    settle()
    expect(screen.queryByTestId('try-summary')).not.toBeInTheDocument()
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 1 / 10')
    expect(screen.getByTestId('action-controls')).toBeInTheDocument()
  })
})

describe('TrialRound — whose round it is: nobody’s', () => {
  it('records nothing, saves no table, counts no trial hand and stamps nothing', async () => {
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    const countHand = vi.fn()
    useCasinoTrialStore.setState({ countHand })
    shoe(SIXTEEN_VS_TEN)
    const view = open({ autoStart: true })
    standThrough()
    expect(screen.getByTestId('try-summary')).toBeInTheDocument()
    view.unmount()
    expect(recordSession).not.toHaveBeenCalled()
    expect(countHand).not.toHaveBeenCalled()
    expect(guestRoundSince()).toBeNull()
    for (const key of ['bjt_casino_live', 'bjt_casino_trial', 'bjt_guest_since', 'bjt_sessions']) {
      expect(Object.keys(localStorage).some(k => k.startsWith(key)), key).toBe(false)
    }
    // Nothing of a session, a level or a trial anywhere on the device.
    expect(Object.keys(localStorage).filter(k => /casino|guest|session|stats|level|xp|trial/i.test(k))).toEqual([])
  })

  it('leaves nothing behind when the page goes away in the middle of a hand', () => {
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    shoe(SIXTEEN_VS_TEN)
    const view = open({ autoStart: true })
    settle()
    fireEvent.click(screen.getByTestId('action-surrender'))
    settle()
    fireEvent.click(screen.getByTestId('next-hand'))
    settle()
    view.unmount()
    expect(recordSession).not.toHaveBeenCalled()
    expect(Object.keys(localStorage).filter(k => k.startsWith('bjt_casino'))).toEqual([])
  })

  it('gives a sign-out nothing to settle while it is open', async () => {
    const recordSession = vi.fn()
    useStatsStore.setState({ recordSession })
    shoe(SIXTEEN_VS_TEN)
    open({ autoStart: true })
    settle()
    fireEvent.click(screen.getByTestId('action-surrender'))
    settle()
    vi.useRealTimers()
    await settleBeforeSignOut()
    expect(recordSession).not.toHaveBeenCalled()
  })
})
