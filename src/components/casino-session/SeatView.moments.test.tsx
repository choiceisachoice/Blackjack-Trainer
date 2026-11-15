import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HumanSeat } from './SeatView'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { HandOutcome } from './useGameLoop'
import type { GameStep } from './helpers'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

function seat(cards: Card[], over: {
  gameStep?: GameStep
  settlement?: { result: HandOutcome; profit: number } | null
  hands?: Card[][]
} = {}) {
  return render(
    <HumanSeat
      humanHands={over.hands ?? [cards]}
      humanVisibleCards={cards.length}
      activeHandIndex={0}
      currentBet={25}
      bankroll={1000}
      handDoubled={new Set()}
      isSurrendered={false}
      humanSettlement={over.settlement ?? null}
      gameStep={over.gameStep ?? 'human_playing'}
      isActivePlayer
      isDimmed={false}
      isDealPhase={false}
    />,
  )
}

const moment = () => screen.queryByTestId('hand-banner')?.getAttribute('data-moment') ?? null

/**
 * A blackjack, a bust and a win are said on the hand, when they happen — not
 * as a small word under the cards once the round is settled.
 */
describe('the moments of a hand', () => {
  it('an ordinary hand carries no plate', () => {
    seat([c(Rank.Ten), c(Rank.Seven)])
    expect(moment()).toBeNull()
  })

  it('two cards making 21 are a blackjack the moment they are down', () => {
    seat([c(Rank.Ace), c(Rank.King)])
    expect(moment()).toBe('blackjack')
  })

  it('21 on a split hand is not a blackjack', () => {
    seat([c(Rank.Ace), c(Rank.King)], { hands: [[c(Rank.Ace), c(Rank.King)], [c(Rank.Ace), c(Rank.Five)]] })
    expect(screen.queryAllByTestId('hand-banner')).toHaveLength(0)
  })

  it('a hand over 21 is a bust as soon as the card is on the table', () => {
    seat([c(Rank.Ten), c(Rank.Seven), c(Rank.Eight)])
    expect(moment()).toBe('bust')
  })

  it('a won hand says so at settlement, and only then', () => {
    const cards = [c(Rank.Ten), c(Rank.Nine)]
    const playing = seat(cards)
    expect(moment()).toBeNull()
    playing.unmount()
    seat(cards, { gameStep: 'settlement', settlement: { result: 'win', profit: 25 } })
    expect(moment()).toBe('win')
    expect(screen.getByTestId('payout-stack')).toBeInTheDocument()
  })

  it('a lost hand gets no plate; its chips are taken', () => {
    seat([c(Rank.Ten), c(Rank.Nine)], { gameStep: 'settlement', settlement: { result: 'loss', profit: -25 } })
    expect(moment()).toBeNull()
    expect(screen.getByTestId('bet-stack')).toHaveAttribute('data-outcome', 'loss')
  })
})
