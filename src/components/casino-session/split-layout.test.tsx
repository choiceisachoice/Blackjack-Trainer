import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { HumanSeat } from './SeatView'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { TABLE_CARD } from './helpers'

/**
 * Split hands stay inside their seat (Darius, 17 Nov 2026).
 *
 * They used to sit in one row at full size and run over the seat's edges —
 * onto the neighbour's cards. The layout is arithmetic, so it is checked as
 * arithmetic: the group's width times its scale against the seat's width.
 */

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const pair = [c(Rank.Eight), c(Rank.Three, Suit.Clubs)]

afterEach(cleanup)

function seat(hands: number, slotWidth: number) {
  render(
    <HumanSeat
      humanHands={Array.from({ length: hands }, () => pair)}
      activeHandIndex={0}
      humanVisibleCards={2}
      bankroll={1000}
      isSurrendered={false}
      isDealPhase={false}
      currentBet={25}
      gameStep="human_playing"
      isActivePlayer
      isDimmed={false}
      handDoubled={new Set()}
      humanSettlement={null}
      slotWidth={slotWidth}
    />,
  )
  const group = screen.getByTestId('split-hands')
  const width = parseFloat(group.style.width)
  const scale = Number(/scale\(([\d.]+)\)/.exec(group.style.transform)?.[1] ?? 1)
  return { group, width, scale, rows: Number(group.dataset.rows) }
}

describe('split hands, inside their seat', () => {
  // The seat widths the table really has: six seats at full size, and the
  // narrower ones of a smaller window.
  for (const slotWidth of [232, 200, 176, 150]) {
    for (const hands of [2, 3, 4]) {
      it(`${hands} hands fit a seat ${slotWidth} wide`, () => {
        const { width, scale } = seat(hands, slotWidth)
        expect(width * scale).toBeLessThanOrEqual(slotWidth)
      })
    }
  }

  it('keeps two hands in one row and puts the third and fourth in a second', () => {
    expect(seat(2, 232).rows).toBe(1)
    cleanup()
    expect(seat(3, 232).rows).toBe(2)
    cleanup()
    expect(seat(4, 232).rows).toBe(2)
  })

  it('shows two hands at full size where the seat has the room', () => {
    expect(seat(2, 250).scale).toBe(1)
  })

  it('four hands in two rows are larger than four in one row would be', () => {
    const { scale } = seat(4, 232)
    const oneRow = 232 / (4 * (TABLE_CARD.width + TABLE_CARD.step) + 30)
    expect(scale).toBeGreaterThan(oneRow)
  })

  it('marks the hand being played, and no frame is drawn round it', () => {
    const { group } = seat(3, 232)
    const hands = group.querySelectorAll('[data-testid="split-hand"]')
    expect(hands).toHaveLength(3)
    expect(hands[0]).toHaveAttribute('data-active', 'true')
    expect(hands[1]).toHaveAttribute('data-active', 'false')
    expect(group.querySelector('[class*="ring-"]')).toBeNull()
  })
})

describe('the cards on the table', () => {
  it('are the deck’s own card faces', () => {
    seat(2, 232)
    // The printed card is one image; the simplified face drew a large index
    // and a single suit of its own.
    const card = document.querySelector('[data-card]')!
    expect(card.querySelector('image')).not.toBeNull()
    expect(card.querySelector('text')).toBeNull()
  })
})
