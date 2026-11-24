import { describe, it, expect } from 'vitest'
import { Action } from '../../engine/rules/types'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { PlayDecision, PlayerHandRecord } from '../../engine/casino-session/types'
import { DEFAULT_CONFIG } from './helpers'
import { chartRowForHand, formatTrueCount, handVerdict, reviewHand, sessionMisses, spotName } from './hand-review-model'

const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const d = (action: Action, correctAction: Action, over: Partial<PlayDecision> = {}): PlayDecision =>
  ({ action, correctAction, isCorrect: action === correctAction, handValueAfter: 0, handIndex: 0, ...over })

function record(over: Partial<PlayerHandRecord> = {}): PlayerHandRecord {
  return {
    handNumber: 7, trueCountAtBet: 1, runningCountAtBet: 5, remainingDecks: 5,
    playerBet: 25, correctBet: 25, betCorrect: true, betError: 0,
    playerCards: [c(Rank.Ten), c(Rank.Six)],
    dealerUpCard: c(Rank.Ten, Suit.Clubs), dealerHoleCard: c(Rank.Seven, Suit.Clubs), dealerFinalCards: [c(Rank.Ten, Suit.Clubs), c(Rank.Seven, Suit.Clubs)],
    decisions: [],
    firstAction: '', correctFirstAction: '', firstActionCorrect: true,
    wasDeviationSituation: false, insuranceOffered: false, countChecked: false, actualRC: 0, actualTC: 0,
    playerHandValue: 16, dealerHandValue: 17, result: 'loss', profit: -25, bankrollAfter: 975, botResults: [],
    ...over,
  }
}

const COUNTING = { ...DEFAULT_CONFIG, playStyle: 'counting' as const }
const BASIC = { ...DEFAULT_CONFIG, playStyle: 'basic' as const }

describe('reviewHand', () => {
  it('names the spot of every decision, hit by hit', () => {
    // 5,3 against a 9: hit on 8, a ten; hit on 18 (wrong), a two; stand on 20.
    const r = reviewHand(record({
      dealerUpCard: c(Rank.Nine),
      playerHands: [[c(Rank.Five), c(Rank.Three), c(Rank.Ten), c(Rank.Two)]],
      decisions: [d(Action.Hit, Action.Hit), d(Action.Hit, Action.Stand), d(Action.Stand, Action.Stand)],
    }), BASIC)
    const plays = r.rows.filter(x => x.kind === 'play')
    expect(plays.map(p => p.kind === 'play' && p.spot.hand)).toEqual(['8', '18', '20'])
    expect(plays.every(p => p.kind === 'play' && p.spot.dealer === '9')).toBe(true)
    expect(r.verdict).toBe('wrong')
    expect(r.mistakes).toBe(1)
  })

  it('grades the bet at a counting table and leaves it out of basic play', () => {
    const wrongBet = record({ betCorrect: false, correctBet: 100, playerBet: 25, trueCountAtBet: 3, decisions: [d(Action.Stand, Action.Stand)] })
    const counting = reviewHand(wrongBet, COUNTING)
    expect(counting.bet).toEqual({ amount: 25, trueCount: 3, right: 100, isCorrect: false })
    expect(counting.verdict).toBe('wrong')
    const basic = reviewHand(wrongBet, BASIC)
    expect(basic.bet).toBeNull()
    expect(basic.verdict).toBe('right')
  })

  it('shows an index play with the chart play it replaced and the rule', () => {
    // 16 against a 10 at +2, no surrender: the chart hits, the index stands from 0.
    const noSurrender = { ...COUNTING, surrenderAllowed: false }
    const r = reviewHand(record({
      decisions: [d(Action.Stand, Action.Stand, { trueCount: 2, basicAction: Action.Hit, deviationName: '16 vs 10' })],
    }), noSurrender)
    const play = r.rows[0]
    expect(play.kind).toBe('play')
    if (play.kind !== 'play') return
    expect(play.trueCount).toBe(2)
    expect(play.index).toEqual({ name: '16 vs 10', basic: Action.Hit, rule: { threshold: 0, above: Action.Stand, below: Action.Hit } })
    expect(r.deviation).toBe(true)
    expect(r.chart?.deviation).toBe(true)
  })

  it('says why nothing was decided', () => {
    expect(reviewHand(record({ result: 'blackjack', playerCards: [c(Rank.Ace), c(Rank.King)] }), BASIC).nothing).toBe('blackjack')
    const dealerBj = record({ dealerFinalCards: [c(Rank.Ace), c(Rank.King)] })
    expect(reviewHand(dealerBj, BASIC).nothing).toBe('dealerBlackjack')
    // In basic play a hand with nothing decided is graded on nothing at all.
    expect(reviewHand(dealerBj, BASIC).verdict).toBe('none')
    // At a counting table the bet is still a decision.
    expect(reviewHand(dealerBj, COUNTING).verdict).toBe('right')
  })

  it('numbers the hands after a split and reads each from the felt', () => {
    // 8,8 against a 6: split; hand 1 takes a 3 (11) and doubles; hand 2 takes a 10 and stands.
    const hands = [[c(Rank.Eight), c(Rank.Three), c(Rank.Nine)], [c(Rank.Eight, Suit.Spades), c(Rank.Ten)]]
    const r = reviewHand(record({
      dealerUpCard: c(Rank.Six),
      playerCards: hands[0],
      decisions: [
        d(Action.Split, Action.Split),
        d(Action.Double, Action.Double, { handIndex: 0 }),
        d(Action.Stand, Action.Stand, { handIndex: 1 }),
      ],
    }), COUNTING, hands)
    const plays = r.rows.flatMap(x => (x.kind === 'play' ? [[x.hand, x.spot.hand]] : []))
    expect(plays).toEqual([[1, '8,8'], [1, '11'], [2, '18']])
    expect(r.split).toBe(true)
    expect(r.severalHands).toBe(true)
    // The chart row is the hand as dealt: the pair.
    expect(r.chart?.spot.hand).toBe('8,8')
  })

  it('works out the insurance answer that was right', () => {
    const declinedRight = reviewHand(record({ insuranceOffered: true, playerTookInsurance: false, correctInsuranceDecision: true }), BASIC)
    expect(declinedRight.rows[0]).toMatchObject({ kind: 'insurance', took: false, take: false, isCorrect: true, trueCount: null })
    const declinedWrong = reviewHand(record({ insuranceOffered: true, playerTookInsurance: false, correctInsuranceDecision: false, trueCountAtInsurance: 3.5 }), COUNTING)
    expect(declinedWrong.rows[0]).toMatchObject({ kind: 'insurance', took: false, take: true, isCorrect: false, trueCount: 3.5 })
  })

  it('adds the count check when one was asked', () => {
    const r = reviewHand(record({
      countChecked: true, playerRC: 4, actualRC: 5, rcCorrect: false, playerTC: 1, actualTC: 1, tcCorrect: true,
      decisions: [d(Action.Stand, Action.Stand)],
    }), COUNTING)
    expect(r.rows.at(-1)).toEqual({ kind: 'count', rc: { you: 4, actual: 5, ok: false }, tc: { you: 1, actual: 1, ok: true }, isCorrect: false })
    expect(r.verdict).toBe('wrong')
  })
})

describe('chartRowForHand', () => {
  it('is the row of the table the hand was played at', () => {
    const row = chartRowForHand([c(Rank.Ten), c(Rank.Six)], '10', DEFAULT_CONFIG)
    expect(row?.hand).toBe('16')
    expect(row?.column).toBe(8)
    // Late surrender at the default table: 16 against 9, 10, A surrenders.
    expect(row?.cells).toEqual(['S', 'S', 'S', 'S', 'S', 'H', 'H', 'SU', 'SU', 'SU'])
    // Without surrender the same row hits there.
    const noSur = chartRowForHand([c(Rank.Ten), c(Rank.Six)], '10', { ...DEFAULT_CONFIG, surrenderAllowed: false })
    expect(noSur?.cells.slice(7)).toEqual(['H', 'H', 'H'])
    expect(noSur?.noSurrender).toBe(true)
  })

  it('plays pairs by the table’s double-after-split rule', () => {
    // 4,4 against a 5 splits with DAS and hits without it.
    expect(chartRowForHand([c(Rank.Four), c(Rank.Four, Suit.Clubs)], '5', DEFAULT_CONFIG)?.cells[3]).toBe('SP')
    expect(chartRowForHand([c(Rank.Four), c(Rank.Four, Suit.Clubs)], '5', { ...DEFAULT_CONFIG, doubleAfterSplit: false })?.cells[3]).toBe('H')
  })
})

describe('handVerdict', () => {
  it('agrees with the review it stands for', () => {
    const wrong = record({ decisions: [d(Action.Hit, Action.Stand)] })
    expect(handVerdict(wrong, true)).toBe(reviewHand(wrong, BASIC).verdict)
    const right = record({ decisions: [d(Action.Stand, Action.Stand)] })
    expect(handVerdict(right, false)).toBe('right')
    const nothing = record({ result: 'blackjack' })
    expect(handVerdict(nothing, true)).toBe('none')
  })
})

describe('sessionMisses', () => {
  it('lists every wrong play and insurance answer, in order, with its hand', () => {
    const hands = [
      record({ handNumber: 1, decisions: [d(Action.Stand, Action.Stand)] }),
      record({ handNumber: 2, decisions: [d(Action.Hit, Action.Stand)], playerHands: [[c(Rank.Ten), c(Rank.Six), c(Rank.Two)]] }),
      record({ handNumber: 3, insuranceOffered: true, playerTookInsurance: true, correctInsuranceDecision: false }),
    ]
    const misses = sessionMisses(hands, BASIC)
    expect(misses.map(m => [m.handNumber, m.row.kind])).toEqual([[2, 'play'], [3, 'insurance']])
  })
})

describe('words and numbers', () => {
  it('names a chart hand', () => {
    expect(spotName('16')).toEqual({ key: 'training.flash.hardTotal', values: { n: 16 } })
    expect(spotName('A,7')).toEqual({ key: 'training.flash.softTotal', values: { n: 18 } })
    expect(spotName('8,8')).toEqual({ key: 'training.flash.pairOf', values: { rank: '8' } })
    expect(spotName('A,A')).toEqual({ key: 'training.flash.pairOfAces' })
  })

  it('writes a true count with its sign, in the reader’s format', () => {
    expect(formatTrueCount(1.5, 'en')).toBe('+1.5')
    expect(formatTrueCount(1.5, 'de')).toBe('+1,5')
    expect(formatTrueCount(0, 'en')).toBe('0')
    expect(formatTrueCount(-2, 'en')).toMatch(/^[-−]2$/)
  })
})
