import React from 'react'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CasinoSession } from './CasinoSession'
import { useAppStore } from '../../store/app-store'
import { Shoe } from '../../engine/shoe/shoe'
import { CasinoSessionEngine } from '../../engine/casino-session/session-engine'
import { Rank, Suit, type Card } from '../../engine/shoe/types'

/**
 * The player's split, played through the real table with a stacked shoe.
 *
 * Found by Darius on 8 Oct 2026: after he split, a bot sometimes laid several
 * cards at once instead of thinking. Cause: doubling onto 21 moved on twice —
 * once from the double, once from the auto-stand at 21. On the first hand that
 * dealt the next hand twice (one card vanished, but was counted); on the last
 * hand it played the bots and the dealer a second time, and the second replay
 * showed every card at once. The same happened to split aces that drew a ten.
 */
vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-') || ['className', 'style', 'onClick', 'id'].includes(k)))
  return {
    motion: new Proxy({}, {
      get: (_t, tag: string) => ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(p), children),
    }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
    useAnimationControls: () => ({ set: () => {}, start: () => {} }),
  }
})
vi.mock('../../services/casino-ambient', () => ({
  casinoAmbient: { start: vi.fn(), stop: vi.fn(), playing: false, volume: 0.15 },
}))
vi.mock('../table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({ enabled: false, volume: 0 }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) }),
}))
vi.mock('../../store/level-store', () => ({
  useLevelStore: { getState: () => ({ addSessionXP: vi.fn(), addChallengeXP: vi.fn(), addAchievementXP: vi.fn(), addAchievementsXP: vi.fn() }) },
}))

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })

/** Deal these cards first, then the real shoe. */
function stackShoe(cards: Card[]) {
  const queue = [...cards]
  const real = Shoe.prototype.deal
  return vi.spyOn(Shoe.prototype, 'deal').mockImplementation(function (this: Shoe) {
    return queue.length > 0 ? queue.shift()! : real.call(this)
  })
}

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const humanHands = () => screen.getByTestId('human-seat').querySelectorAll('[class*="rounded-lg"]')

function startHeadsUp({ das = true }: { das?: boolean } = {}) {
  render(<CasinoSession />)
  // No bots: the player's hands and the dealer are the whole table.
  fireEvent.click(within(screen.getByRole('group', { name: 'Bots at the table' })).getByRole('button', { name: '0' }))
  const dasSwitch = screen.getByRole('switch', { name: 'Double after split' })
  if ((dasSwitch.getAttribute('aria-checked') === 'true') !== das) fireEvent.click(dasSwitch)
  fireEvent.click(screen.getByTestId('start-session'))
  tick(100)
  fireEvent.click(screen.getByText('+$25'))
  fireEvent.click(screen.getByTestId('confirm-bet'))
  tick(8000) // the deal
}

describe('player split → double onto 21', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('deals each hand once and plays the dealer once', () => {
    const deal = stackShoe([
      c(Rank.Eight), c(Rank.Six, Suit.Clubs), c(Rank.Eight, Suit.Spades), c(Rank.Ten, Suit.Diamonds), // 8,8 vs 6 (hole 10)
      c(Rank.Three, Suit.Clubs), c(Rank.King),        // hand 1: 8+3, doubles onto the K = 21
      c(Rank.Three, Suit.Diamonds), c(Rank.Queen, Suit.Spades), // hand 2: 8+3, doubles onto the Q = 21
      c(Rank.Five, Suit.Clubs),                        // dealer 16 draws a 5
    ])
    const dealer = vi.spyOn(CasinoSessionEngine.prototype, 'playDealerHand')
    startHeadsUp()

    fireEvent.click(screen.getByTestId('action-split'))
    tick(1500)
    fireEvent.click(screen.getByTestId('action-double'))
    tick(3000)
    // Hand 2 got exactly one card — not one shown and one swallowed.
    expect(deal).toHaveBeenCalledTimes(7)
    expect(humanHands()[1].textContent).toContain('11')

    fireEvent.click(screen.getByTestId('action-double'))
    tick(15000)
    expect(dealer).toHaveBeenCalledTimes(1)
    expect(deal).toHaveBeenCalledTimes(9)
  })

  it('shows the doubled stake on the chip', () => {
    stackShoe([c(Rank.Five), c(Rank.Six, Suit.Clubs), c(Rank.Six), c(Rank.Ten, Suit.Diamonds), c(Rank.Two)])
    startHeadsUp()
    const chip = () => within(screen.getByTestId('human-seat')).getByText(/^\$\d+$/)
    expect(chip()).toHaveTextContent('$25')
    fireEvent.click(screen.getByTestId('action-double'))
    tick(200)
    expect(chip()).toHaveTextContent('$50')
  })
})

/**
 * Input during the short transitions — found by an independent audit on
 * 8 Oct 2026, each one reproduced before it was fixed. A hand that is done
 * (busted, doubled, a split ace) takes no more input, and a late scheduled
 * move-on never moves on from the hand after it.
 */
describe('input during transitions after a split', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  const key = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })) })
  const cardsOf = (i: number) => (humanHands()[i]?.textContent ?? '')

  it('a Stand right after a double does not skip the next split hand', () => {
    const deal = stackShoe([
      c(Rank.Eight), c(Rank.Six, Suit.Clubs), c(Rank.Eight, Suit.Spades), c(Rank.Ten, Suit.Diamonds),
      c(Rank.Three, Suit.Clubs), c(Rank.Two),       // hand 1: 8+3 → doubles onto the 2 = 13
      c(Rank.Nine, Suit.Clubs),                     // hand 2's own card
    ])
    const dealer = vi.spyOn(CasinoSessionEngine.prototype, 'playDealerHand')
    startHeadsUp()
    fireEvent.click(screen.getByTestId('action-split'))
    tick(1500)
    fireEvent.click(screen.getByTestId('action-double'))
    key('s')                                         // inside the 600 ms after the double
    tick(2000)
    expect(dealer).not.toHaveBeenCalled()          // hand 2 is still to be played
    expect(deal).toHaveBeenCalledTimes(7)
    expect(screen.getByTestId('action-stand')).toBeEnabled()
  })

  it('a key right after a bust does not skip the next split hand', () => {
    stackShoe([
      c(Rank.Eight), c(Rank.Six, Suit.Clubs), c(Rank.Eight, Suit.Spades), c(Rank.Ten, Suit.Diamonds),
      c(Rank.Six, Suit.Clubs), c(Rank.King),        // hand 1: 8+6 = 14, hits the K → bust
      c(Rank.Nine, Suit.Clubs),
    ])
    const dealer = vi.spyOn(CasinoSessionEngine.prototype, 'playDealerHand')
    startHeadsUp()
    fireEvent.click(screen.getByTestId('action-split'))
    tick(1500)
    fireEvent.click(screen.getByTestId('action-hit'))
    key('h'); key('s')                               // a held key / a quick stand
    tick(2000)
    expect(dealer).not.toHaveBeenCalled()
    expect(cardsOf(0)).toContain('24')               // the bust hand took no extra card
  })

  it('a Hit after a double is refused', () => {
    const deal = stackShoe([c(Rank.Five), c(Rank.Six, Suit.Clubs), c(Rank.Six), c(Rank.Ten, Suit.Diamonds), c(Rank.Two)])
    startHeadsUp()
    fireEvent.click(screen.getByTestId('action-double'))
    fireEvent.click(screen.getByTestId('action-hit'))
    key('d')
    tick(100)
    expect(deal).toHaveBeenCalledTimes(5)
  })

  it('split aces take no Stand or Hit while they stand by themselves', () => {
    const deal = stackShoe([
      c(Rank.Ace), c(Rank.Six, Suit.Clubs), c(Rank.Ace, Suit.Spades), c(Rank.Ten, Suit.Diamonds),
      c(Rank.Seven, Suit.Clubs), c(Rank.Eight, Suit.Clubs), c(Rank.Five, Suit.Clubs),
    ])
    const dealer = vi.spyOn(CasinoSessionEngine.prototype, 'playDealerHand')
    startHeadsUp()
    fireEvent.click(screen.getByTestId('action-split'))
    tick(800)                                         // ace 1 has its card
    expect(screen.getByTestId('action-hit')).toBeDisabled()
    key('s'); key('h')
    tick(20_000)
    expect(cardsOf(0)).toContain('18')               // A+7, nothing more
    expect(cardsOf(1)).toContain('19')               // A+8, its own card — not swallowed
    expect(deal).toHaveBeenCalledTimes(7)
    expect(dealer).toHaveBeenCalledTimes(1)
  })

  it('declining an ace re-split keeps the other aces on one card', () => {
    stackShoe([
      c(Rank.Ace), c(Rank.Six, Suit.Clubs), c(Rank.Ace, Suit.Spades), c(Rank.Ten, Suit.Diamonds),
      c(Rank.Ace, Suit.Diamonds),                   // ace 1 catches an ace: re-split offered
      c(Rank.Five, Suit.Clubs),                     // ace 2
      c(Rank.Four, Suit.Clubs),
    ])
    startHeadsUp()
    fireEvent.click(screen.getByTestId('action-split'))
    tick(800)
    expect(screen.getByTestId('action-split')).toBeEnabled()
    expect(screen.getByTestId('action-hit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('action-stand')) // decline
    tick(800)
    key('h'); key('d')
    tick(20_000)
    expect(cardsOf(1)).toContain('16')               // A+5 and nothing else
  })

  it('without double after split, `d` on a split hand does nothing', () => {
    const deal = stackShoe([
      c(Rank.Eight), c(Rank.Six, Suit.Clubs), c(Rank.Eight, Suit.Spades), c(Rank.Ten, Suit.Diamonds),
      c(Rank.Three, Suit.Clubs),
    ])
    startHeadsUp({ das: false })
    fireEvent.click(screen.getByTestId('action-split'))
    tick(1500)
    expect(screen.getByTestId('action-double')).toBeDisabled()
    key('d')
    tick(1000)
    expect(deal).toHaveBeenCalledTimes(5)
  })
})

describe('player split aces that draw a ten', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAppStore.getState().setMode('casinoSession')
    useAppStore.setState({ dealingSpeed: 'normal' })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('deals the second ace once and plays the dealer once', () => {
    const deal = stackShoe([
      c(Rank.Ace), c(Rank.Six, Suit.Clubs), c(Rank.Ace, Suit.Spades), c(Rank.Ten, Suit.Diamonds),
      c(Rank.King),                 // ace 1 → 21
      c(Rank.Seven, Suit.Clubs),    // ace 2 → 18
      c(Rank.Five, Suit.Clubs),     // dealer 16 draws
    ])
    const dealer = vi.spyOn(CasinoSessionEngine.prototype, 'playDealerHand')
    startHeadsUp()
    fireEvent.click(screen.getByTestId('action-split'))
    tick(20000)
    expect(deal).toHaveBeenCalledTimes(7)
    expect(dealer).toHaveBeenCalledTimes(1)
  })
})
