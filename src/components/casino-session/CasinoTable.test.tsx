import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CasinoTable } from './CasinoTable'
import { TABLE_DESIGN, TABLE_MAX_SCALE } from './helpers'
import { Rank, Suit } from '../../engine/shoe/types'
import type { Card } from '../../engine/shoe/types'

const card = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

/**
 * jsdom has no layout: every box measures 0x0 and `ResizeObserver` does not
 * exist. Both are stubbed so the wiring — measure, compute, apply — can be
 * exercised. The arithmetic itself is covered against real numbers in
 * `helpers.test.ts`; what is checked here is that the result reaches the DOM.
 */
function withBox(width: number, height: number) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const props = {
  dealerCards: [card(Rank.Ten, Suit.Diamonds), card(Rank.Six)],
  dealerHoleRevealed: true,
  gameStep: 'human_playing' as const,
  isDealPhase: false,
  seatLayout: [{ type: 'human' as const, seatIndex: 0 }],
  humanHands: [[card(Rank.Nine), card(Rank.Seven, Suit.Hearts)]],
  humanVisibleCards: 2,
  activeHandIndex: 0,
  currentBet: 100,
  handDoubled: new Set<number>(),
  isSurrendered: false,
  humanSettlement: null,
  activeBotId: null,
  botStatuses: {},
  botResults: [],
  botVisibleCards: {},
  botActiveSplitHands: {},
  botSplitVisibleCards: {},
  bankroll: 5000,
  cardsRemaining: 200,
  cardsDealt: 112,
  discardCount: 112,
  totalCards: 312,
  penetration: 0.75,
  blackjackPays: 1.5,
  dealerHitsSoft17: false,
}

/** The scale actually applied to the felt, read back off the element. */
function appliedScale(): number {
  const felt = screen.getByTestId('felt-table')
  const match = /scale\(([\d.]+)\)/.exec(felt.style.transform)
  return match ? Number(match[1]) : NaN
}

describe('the table fits its box', () => {
  it('renders at design scale in a design-sized box', () => {
    withBox(TABLE_DESIGN.width, TABLE_DESIGN.height)
    render(<CasinoTable {...props} />)
    expect(appliedScale()).toBeCloseTo(1, 2)
  })

  it('grows on a large screen — the whole point of the change', () => {
    // Previously the felt stopped at max-w-[1120px] and everything inside kept
    // its hard-coded pixel size, so a 3440px monitor showed a postage stamp.
    withBox(3400, 1240)
    render(<CasinoTable {...props} />)
    expect(appliedScale()).toBeGreaterThan(1.5)
  })

  it('respects the ceiling on an absurdly large box', () => {
    withBox(10_000, 10_000)
    render(<CasinoTable {...props} />)
    expect(appliedScale()).toBeCloseTo(TABLE_MAX_SCALE, 2)
  })

  it('does not shrink a short laptop window', () => {
    // The regression guard: fitting both axes made this case 19% smaller.
    withBox(1250, 520)
    render(<CasinoTable {...props} />)
    expect(appliedScale()).toBeGreaterThanOrEqual(1)
  })

  it('draws the scene at the design width, whatever the box', () => {
    withBox(3400, 1240)
    render(<CasinoTable {...props} />)
    const felt = screen.getByTestId('felt-table')
    // The width is fixed and the scale does the work — that is what keeps the
    // cards in proportion to the felt.
    expect(felt.style.width).toBe(`${TABLE_DESIGN.width}px`)
  })

  it('is visible on the first frame even before anything is measured', () => {
    // No getBoundingClientRect stub at all: the box reads 0x0, as it does on
    // the very first paint. A scale of 0 here would render an empty screen.
    render(<CasinoTable {...props} />)
    expect(appliedScale()).toBeCloseTo(1, 2)
    expect(screen.getByTestId('felt-table')).toBeInTheDocument()
  })

  it('still renders the table when ResizeObserver is unavailable', () => {
    // Older Safari, and jsdom without the stub. The table must not disappear
    // just because it cannot watch its own size.
    vi.unstubAllGlobals()
    // @ts-expect-error — deliberately removing the API to prove the fallback.
    delete globalThis.ResizeObserver
    withBox(1860, 880)
    render(<CasinoTable {...props} />)
    expect(screen.getByTestId('felt-table')).toBeInTheDocument()
    expect(appliedScale()).toBeGreaterThan(1)
  })
})

describe('the table still shows what it showed before', () => {
  beforeEach(() => withBox(1860, 880))

  it('renders the felt and the seats', () => {
    render(<CasinoTable {...props} />)
    expect(screen.getByTestId('casino-table')).toBeInTheDocument()
    expect(screen.getByTestId('felt-table')).toBeInTheDocument()
    // "Dealer" in the markup; the capitals on screen come from `uppercase`.
    expect(screen.getByText('Dealer')).toBeInTheDocument()
  })

  it('keeps the rules legend on the felt', () => {
    render(<CasinoTable {...props} />)
    expect(screen.getByText(/BLACKJACK PAYS/i)).toBeInTheDocument()
  })
})
