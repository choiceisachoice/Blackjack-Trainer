import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TrialSummary } from './TrialSummary'
import type { SettledHand } from './trial-verdict'
import { Action } from '../../engine/rules/types'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { PlayerHandRecord } from '../../engine/casino-session/types'
import { usePlanPriceStore } from '../../store/plan-price-store'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

/** A settled 16 against a 10, played as `chosen` where basic strategy surrenders. */
function hand(over: Partial<PlayerHandRecord> = {}, chosen: Action = Action.Surrender): SettledHand {
  const playerCards = [c(Rank.Ten), c(Rank.Six)]
  const record: PlayerHandRecord = {
    handNumber: 1, trueCountAtBet: 0, runningCountAtBet: 0, remainingDecks: 6,
    playerBet: 100, correctBet: 100, betCorrect: true, betError: 0,
    playerCards, dealerUpCard: c(Rank.Ten), dealerHoleCard: c(Rank.Seven), dealerFinalCards: [c(Rank.Ten), c(Rank.Seven)],
    decisions: [{ action: chosen, correctAction: Action.Surrender, isCorrect: chosen === Action.Surrender, handValueAfter: 16 }],
    firstAction: chosen, correctFirstAction: Action.Surrender, firstActionCorrect: chosen === Action.Surrender,
    wasDeviationSituation: false, insuranceOffered: false, countChecked: false, actualRC: 0, actualTC: 0,
    playerHandValue: 16, dealerHandValue: 17, result: 'surrender', profit: -50, bankrollAfter: 950, botResults: [],
    ...over,
  }
  return { record, hands: [playerCards] }
}

const show = (round: SettledHand[], onAgain = vi.fn()) =>
  render(<MemoryRouter><TrialSummary round={round} onAgain={onAgain} /></MemoryRouter>)

beforeEach(() => {
  usePlanPriceStore.setState({ status: 'error', plans: [], load: async () => {} })
})
afterEach(cleanup)

describe('TrialSummary — the result', () => {
  it('says so when every decision was basic strategy, instead of an empty table', () => {
    show(Array.from({ length: 10 }, () => hand()))
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/10')
    expect(screen.getByTestId('try-perfect')).toBeInTheDocument()
    expect(screen.queryByTestId('try-misses')).not.toBeInTheDocument()
    expect(screen.queryByTestId('try-ended-early')).not.toBeInTheDocument()
  })

  it('names an insurance taken as a miss, with no insurance as the right play', () => {
    const insured = hand({
      dealerUpCard: c(Rank.Ace), insuranceOffered: true, playerTookInsurance: true, correctInsuranceDecision: false,
    })
    show([insured, ...Array.from({ length: 9 }, () => hand())])
    const row = within(screen.getByTestId('try-misses')).getAllByRole('row')[1]
    expect(row).toHaveTextContent('16 vs. A')
    expect(row).toHaveTextContent('Insurance')
    expect(row).toHaveTextContent('No insurance')
    expect(screen.getByTestId('try-score')).toHaveTextContent('10/11')
  })

  it('says when the play money ran out before the tenth hand', () => {
    show(Array.from({ length: 7 }, () => hand()))
    expect(screen.getByTestId('try-ended-early')).toHaveTextContent('The play money ran out after 7 hands.')
  })

  it('has a sentence, not a fraction of nothing, when no decision came up', () => {
    show([hand({ decisions: [], result: 'blackjack', profit: 150 })])
    expect(screen.queryByTestId('try-score')).not.toBeInTheDocument()
    expect(screen.getByTestId('try-summary')).toHaveTextContent('No decision came up in these hands.')
  })
})

describe('TrialSummary — the next step', () => {
  it('puts Pro first, then the free account, then another round — and nothing else', () => {
    const onAgain = vi.fn()
    show([hand()], onAgain)
    const summary = screen.getByTestId('try-summary')
    expect(within(summary).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/login'])
    expect(within(summary).getAllByRole('button').map(b => b.getAttribute('data-testid'))).toEqual(['try-pro', 'try-again'])
    fireEvent.click(screen.getByTestId('try-again'))
    expect(onAgain).toHaveBeenCalledTimes(1)
  })

  it('says how the purchase goes on for somebody without an account', () => {
    show([hand()])
    expect(screen.getByTestId('try-pro-note')).toHaveTextContent('You create your account first — checkout opens right after.')
  })

  it('asks the store for the price, without naming one it does not have', () => {
    const load = vi.fn(async () => {})
    usePlanPriceStore.setState({ status: 'idle', plans: [], load })
    show([hand()])
    expect(load).toHaveBeenCalled()
    expect(screen.getByTestId('try-pro')).toHaveTextContent('Go Pro →')
    expect(screen.getByTestId('try-pro').textContent).not.toMatch(/CHF|\$|€/)
  })
})
