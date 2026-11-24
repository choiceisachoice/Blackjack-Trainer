import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import i18next from 'i18next'
import { CasinoSessionSummary } from './CasinoSessionSummary'
import { DEFAULT_CONFIG } from './helpers'
import type { CasinoSessionResult, PlayerHandRecord } from '../../engine/casino-session/types'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import { Action } from '../../engine/rules/types'

/**
 * The last screen of a Casino Session.
 *
 * It carried a third button — "export debug log" — that downloaded a
 * `casino-debug-*.json` of every recorded event. That was a development tool
 * that outlived its purpose and ended up in front of paying customers, offering
 * them a file they could not use and giving it the same weight as "play again".
 *
 * Removing it broke **no test**, which is exactly why this file exists: an
 * untested control is one that can come back unnoticed. These tests pin what
 * this screen offers a player and what it does not.
 */

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })

/** One hand, played right unless told otherwise: 10,6 against a 7, hit. */
function hand(n: number, over: Partial<PlayerHandRecord> = {}): PlayerHandRecord {
  return {
    handNumber: n, trueCountAtBet: 0, runningCountAtBet: 0, remainingDecks: 6,
    playerBet: 25, correctBet: 25, betCorrect: true, betError: 0,
    playerCards: [c(Rank.Ten), c(Rank.Six), c(Rank.Five)], playerHands: [[c(Rank.Ten), c(Rank.Six), c(Rank.Five)]],
    dealerUpCard: c(Rank.Seven, Suit.Clubs), dealerHoleCard: c(Rank.Ten, Suit.Clubs), dealerFinalCards: [c(Rank.Seven, Suit.Clubs), c(Rank.Ten, Suit.Clubs)],
    decisions: [{ action: Action.Hit, correctAction: Action.Hit, isCorrect: true, handValueAfter: 21, handIndex: 0 }],
    firstAction: Action.Hit, correctFirstAction: Action.Hit, firstActionCorrect: true,
    wasDeviationSituation: false, insuranceOffered: false, countChecked: false, actualRC: 0, actualTC: 0,
    playerHandValue: 21, dealerHandValue: 17, result: 'win', profit: 25, bankrollAfter: 5025, botResults: [],
    ...over,
  }
}

/**
 * Twenty hands — a session long enough for a grade. (The fixture used to
 * carry no hands at all beside twenty graded bets; the summary now reads the
 * hands themselves, for the grade's minimum and for the list of misses.)
 */
const HANDS = Array.from({ length: 20 }, (_, i) => hand(i + 1))

const RESULT: CasinoSessionResult = {
  config: DEFAULT_CONFIG,
  hands: HANDS,
  startTime: 0,
  endTime: 900_000,
  durationSeconds: 900,
  startingBankroll: 5000,
  finalBankroll: 5400,
  netProfit: 400,
  peakBankroll: 5600,
  worstDrawdown: 200,
  betAccuracy: 88,
  playAccuracy: 92,
  countAccuracy: 79,
  deviationAccuracy: 66,
  insuranceAccuracy: 100,
  overallScore: 84.2,
  totalCountChecks: 12,
  correctRCChecks: 10,
  correctTCChecks: 9,
  avgRCError: 0.4,
  avgTCError: 0.3,
  totalPlayDecisions: 40,
  correctPlayDecisions: 37,
  totalDeviationSituations: 3,
  correctDeviations: 2,
  missedDeviations: [],
  totalBetDecisions: 20,
  correctBetDecisions: 18,
  avgOverbetAmount: 12,
  avgUnderbetAmount: 8,
  totalInsuranceOffers: 1,
  correctInsuranceDecisions: 1,
  grade: 'B+',
  gradeColor: '#d4a847',
}

const renderSummary = () =>
  render(
    <CasinoSessionSummary
      result={RESULT}
      onPlayAgain={vi.fn()}
      onHome={vi.fn()}
      recorder={null}
    />,
  )

describe('CasinoSessionSummary', () => {
  it('offers exactly two ways on: play again, or home', () => {
    renderSummary()
    expect(screen.getByTestId('play-again')).toBeInTheDocument()
    expect(screen.getByTestId('go-home')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('never offers a debug download', () => {
    renderSummary()
    expect(screen.queryByTestId('export-debug-log')).toBeNull()
    expect(screen.queryByText(/debug/i)).toBeNull()
  })

  it('reports the session the player actually played', () => {
    renderSummary()
    expect(screen.getByText('B+')).toBeInTheDocument()
    // The overall score in the reader's percent format: 84.2 reads "84%" in
    // English. (It was "84.2%" from toFixed, which printed a decimal point in
    // German too.) Looked up by its element, not a loose /84/: the net profit
    // and the bankroll carry other numbers.
    expect(screen.getByTestId('summary-overall')).toHaveTextContent('84%')
    expect(screen.getByTestId('summary-net')).toHaveTextContent('+$400')
  })

  it("writes the percentages the way the reader's language does", async () => {
    i18next.addResourceBundle('de', 'translation', {}, true, false)
    await act(async () => { await i18next.changeLanguage('de') })
    try {
      renderSummary()
      // German: a space before the sign, never a decimal point.
      expect(screen.getByTestId('summary-overall').textContent).toMatch(/^84\s%$/)
      // Bets 18 of 20.
      expect(within(screen.getByTestId('summary-category-betting')).getByText(/^90\s%$/)).toBeInTheDocument()
    } finally {
      await act(async () => { await i18next.changeLanguage('en') })
    }
  })

  it('survives a session with no recorder attached', () => {
    // `recorder` is nullable and the anomaly count reads through it. A missing
    // recorder must render a summary, not a blank screen.
    expect(() => renderSummary()).not.toThrow()
    expect(screen.queryByTestId('anomaly-warning')).toBeNull()
  })
})

describe('CasinoSessionSummary — Just Blackjack', () => {
  const basic: CasinoSessionResult = { ...RESULT, config: { ...DEFAULT_CONFIG, playStyle: 'basic' } }

  it('says which game was graded', () => {
    render(<CasinoSessionSummary result={basic} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    expect(screen.getByTestId('summary-basic-mode')).toBeTruthy()
  })

  it('does not report a count the player was never asked for', () => {
    // The counting row's detail is the literal "RC: x/y, TC: x/y" — not
    // translated, so it is a safe handle across every locale the tests run in.
    render(<CasinoSessionSummary result={basic} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    expect(screen.queryByText(/RC: \d+\/\d+/)).toBeNull()
  })

  it('still reports the count in a counting session (control)', () => {
    render(<CasinoSessionSummary result={RESULT} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    expect(screen.getByText(/RC: \d+\/\d+/)).toBeTruthy()
    expect(screen.queryByTestId('summary-basic-mode')).toBeNull()
  })
})

describe('the summary of a trial table', () => {
  const show = (handsLeft: number) =>
    render(<CasinoSessionSummary result={RESULT} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} trial={{ handsLeft }} />)

  it('is the ordinary summary, with one line about the trial', () => {
    show(4)
    expect(screen.getByText('B+')).toBeInTheDocument()
    expect(screen.getByTestId('trial-summary-note')).toHaveTextContent('You have 4 free hands left.')
    expect(screen.getByTestId('play-again')).toHaveTextContent('Play Again')
    expect(screen.getByTestId('summary-actions')).not.toHaveClass('max-sm:flex-col')
  })

  it('names the way on honestly once the hands are gone', () => {
    show(0)
    expect(screen.getByTestId('trial-summary-note')).toHaveTextContent('Those were your 10 free hands.')
    expect(screen.getByTestId('play-again')).toHaveTextContent('Keep playing with Pro')
    // Still two ways out and no third.
    expect(screen.getAllByRole('button')).toHaveLength(2)
    // One under the other on a phone: the label is a sentence, not a word.
    expect(screen.getByTestId('summary-actions')).toHaveClass('max-sm:flex-col')
  })

  it('says nothing about a trial after any other session', () => {
    render(<CasinoSessionSummary result={RESULT} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    expect(screen.queryByTestId('trial-summary-note')).toBeNull()
  })
})

describe('a category with nothing to grade', () => {
  it('says so instead of drawing a full bar at 100 %', () => {
    // The audit: "Counting 100.0 % (RC: 0/0)" and "Deviations 100.0 % (0/0)".
    const none: CasinoSessionResult = {
      ...RESULT,
      countAccuracy: 100, totalCountChecks: 0, correctRCChecks: 0, correctTCChecks: 0,
      deviationAccuracy: 100, totalDeviationSituations: 0, correctDeviations: 0,
      insuranceAccuracy: 100, totalInsuranceOffers: 0, correctInsuranceDecisions: 0,
    }
    render(<CasinoSessionSummary result={none} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    for (const id of ['counting', 'deviations', 'insurance']) {
      const row = screen.getByTestId(`summary-category-${id}`)
      expect(row).toHaveAttribute('data-empty', 'true')
      expect(row).toHaveTextContent('—')
      expect(row).not.toHaveTextContent('100')
    }
    expect(screen.getByTestId('summary-category-counting')).toHaveTextContent('No count check this session')
    expect(screen.getByTestId('summary-category-deviations')).toHaveTextContent('No deviation spot came up')
    // A category with data still has its score.
    expect(screen.getByTestId('summary-category-play')).toHaveAttribute('data-empty', 'false')
  })
})

describe('a short session', () => {
  const short: CasinoSessionResult = {
    ...RESULT,
    hands: HANDS.slice(0, 2),
    totalBetDecisions: 2, correctBetDecisions: 1, totalPlayDecisions: 1, correctPlayDecisions: 0,
    overallScore: 19.2, grade: 'F', gradeColor: '#dc2626',
  }

  it('gets no letter after two hands, and says from when it would', () => {
    render(<CasinoSessionSummary result={short} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    expect(screen.queryByText('F')).toBeNull()
    expect(screen.getByTestId('summary-no-grade')).toHaveTextContent('A grade from 10 hands on')
    expect(screen.getByTestId('summary-no-grade')).toHaveTextContent('This session had 2 hands.')
    // The counts are still there: what was right is not hidden, only the letter.
    expect(screen.getByTestId('summary-category-betting')).toHaveTextContent('1 of 2')
  })
})

describe('the hands played wrong', () => {
  it('lists each with the play that was right', () => {
    const missed = hand(3, {
      decisions: [{ action: Action.Stand, correctAction: Action.Hit, isCorrect: false, handValueAfter: 16, handIndex: 0 }],
      playerHands: [[c(Rank.Ten), c(Rank.Six)]],
    })
    const r: CasinoSessionResult = { ...RESULT, hands: [...HANDS.slice(0, 2), missed, ...HANDS.slice(3)] }
    render(<CasinoSessionSummary result={r} onPlayAgain={vi.fn()} onHome={vi.fn()} recorder={null} />)
    const table = screen.getByTestId('summary-misses')
    expect(table).toHaveTextContent('Hard 16 vs. 7')
    expect(within(table).getByText('Stand').tagName).toBe('S')
    expect(within(table).getByText('Hit')).toBeInTheDocument()
  })

  it('says there were none, after a clean session', () => {
    renderSummary()
    expect(screen.getByTestId('summary-perfect')).toHaveTextContent('Not one mistake')
  })
})
