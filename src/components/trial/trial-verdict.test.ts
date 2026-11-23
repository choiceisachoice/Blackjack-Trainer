import { describe, it, expect } from 'vitest'
import { chartHand, chartRank, gradeHand, verdictOf, tallyRound, type SettledHand } from './trial-verdict'
import { Action } from '../../engine/rules/types'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { PlayerHandRecord } from '../../engine/casino-session/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

/** A settled hand as the game loop records it; only what a test names differs from a dull default. */
function settled(over: Partial<PlayerHandRecord> & { decisions?: (PlayerHandRecord['decisions'][number] & { handIndex?: number })[] }, hands?: Card[][]): SettledHand {
  const playerCards = over.playerCards ?? [c(Rank.Ten), c(Rank.Six)]
  const record: PlayerHandRecord = {
    handNumber: 1, trueCountAtBet: 0, runningCountAtBet: 0, remainingDecks: 6,
    playerBet: 100, correctBet: 100, betCorrect: true, betError: 0,
    playerCards,
    dealerUpCard: c(Rank.Ten, Suit.Hearts),
    dealerHoleCard: c(Rank.Seven, Suit.Hearts),
    dealerFinalCards: [c(Rank.Ten, Suit.Hearts), c(Rank.Seven, Suit.Hearts)],
    decisions: [],
    firstAction: '', correctFirstAction: '', firstActionCorrect: true,
    wasDeviationSituation: false,
    insuranceOffered: false,
    countChecked: false, actualRC: 0, actualTC: 0,
    playerHandValue: 16, dealerHandValue: 17,
    result: 'loss', profit: -100, bankrollAfter: 900, botResults: [],
    ...over,
  }
  return { record, hands: hands ?? [playerCards] }
}

const play = (action: Action, correct: Action, handIndex = 0) => ({
  action, correctAction: correct, isCorrect: action === correct, handValueAfter: 0, handIndex,
})

describe('the chart’s notation', () => {
  it('writes a hard hand as its total, a soft one by its ace, a pair by its cards', () => {
    expect(chartHand([c(Rank.Ten), c(Rank.Six)])).toBe('16')
    expect(chartHand([c(Rank.Five), c(Rank.Three), c(Rank.Eight)])).toBe('16')
    expect(chartHand([c(Rank.Ace), c(Rank.Seven)])).toBe('A,7')
    // Three cards, one ace counted as eleven: the chart's A,6 (soft 17).
    expect(chartHand([c(Rank.Ace), c(Rank.Two), c(Rank.Four)])).toBe('A,6')
    expect(chartHand([c(Rank.Eight), c(Rank.Eight, Suit.Hearts)])).toBe('8,8')
    expect(chartHand([c(Rank.Ace), c(Rank.Ace, Suit.Hearts)])).toBe('A,A')
    // An ace that can no longer be eleven makes a hard hand.
    expect(chartHand([c(Rank.Ace), c(Rank.Nine), c(Rank.Six)])).toBe('16')
  })

  it('writes every ten-value card as a ten, a king and a queen as a pair of tens', () => {
    expect(chartRank(c(Rank.King))).toBe('10')
    expect(chartRank(c(Rank.Ace))).toBe('A')
    expect(chartHand([c(Rank.King), c(Rank.Queen)])).toBe('10,10')
  })
})

describe('gradeHand — which hand each decision was made on', () => {
  it('names the hand before each hit, and the one that was stood on', () => {
    // 5,3 against a 9: hit (8), hit (18 after a ten — wrong), stand at 20.
    const s = settled({
      playerCards: [c(Rank.Five), c(Rank.Three), c(Rank.Ten), c(Rank.Two)],
      dealerUpCard: c(Rank.Nine),
      decisions: [play(Action.Hit, Action.Hit), play(Action.Hit, Action.Stand), play(Action.Stand, Action.Stand)],
    })
    expect(gradeHand(s).map(d => d.kind === 'play' && [d.hand, d.dealer, d.chosen, d.correct, d.isCorrect])).toEqual([
      ['8', '9', Action.Hit, Action.Hit, true],
      ['18', '9', Action.Hit, Action.Stand, false],
      ['20', '9', Action.Stand, Action.Stand, true],
    ])
  })

  it('follows a split: the pair, then each hand from its own two cards', () => {
    // 8,8 against a 6: split; hand 1 is 8,3 and doubles; hand 2 is 8,9 and stands.
    const s = settled({
      playerCards: [c(Rank.Eight), c(Rank.Three), c(Rank.Ten)],
      dealerUpCard: c(Rank.Six),
      decisions: [
        play(Action.Split, Action.Split, 0),
        play(Action.Double, Action.Double, 0),
        play(Action.Stand, Action.Stand, 1),
      ],
    }, [[c(Rank.Eight), c(Rank.Three), c(Rank.Ten)], [c(Rank.Eight, Suit.Hearts), c(Rank.Nine)]])
    expect(gradeHand(s).map(d => d.hand)).toEqual(['8,8', '11', '17'])
  })

  it('starts a re-split hand over', () => {
    // 8,8: split, the first hand catches another 8 and is split again, then 8,2 hits to 8,2,9.
    const s = settled({
      decisions: [
        play(Action.Split, Action.Split, 0),
        play(Action.Split, Action.Split, 0),
        play(Action.Hit, Action.Hit, 0),
        play(Action.Stand, Action.Stand, 0),
      ],
    }, [[c(Rank.Eight), c(Rank.Two), c(Rank.Nine)], [c(Rank.Eight), c(Rank.Ten)], [c(Rank.Eight), c(Rank.Jack)]])
    expect(gradeHand(s).map(d => d.hand)).toEqual(['8,8', '8,8', '10', '19'])
  })

  it('asks about insurance first, on the hand as it was dealt', () => {
    const s = settled({
      playerCards: [c(Rank.Ten), c(Rank.Two), c(Rank.Nine)],
      dealerUpCard: c(Rank.Ace),
      insuranceOffered: true,
      playerTookInsurance: true,
      correctInsuranceDecision: false,
      decisions: [play(Action.Hit, Action.Hit)],
    })
    const [insurance, hit] = gradeHand(s)
    expect(insurance).toMatchObject({ kind: 'insurance', hand: '12', dealer: 'A', took: true, isCorrect: false })
    expect(hit).toMatchObject({ kind: 'play', hand: '12' })
  })

  it('names a split pair as dealt when insurance was asked before the split', () => {
    const s = settled({
      dealerUpCard: c(Rank.Ace),
      insuranceOffered: true, playerTookInsurance: false, correctInsuranceDecision: true,
      decisions: [play(Action.Split, Action.Split, 0)],
    }, [[c(Rank.Eight), c(Rank.Ten)], [c(Rank.Eight), c(Rank.Nine)]])
    expect(gradeHand(s)[0]).toMatchObject({ kind: 'insurance', hand: '8,8', isCorrect: true })
  })
})

describe('verdictOf', () => {
  it('is right when every decision was', () => {
    const s = settled({ decisions: [play(Action.Hit, Action.Hit), play(Action.Stand, Action.Stand)], playerCards: [c(Rank.Five), c(Rank.Six), c(Rank.Nine)] })
    expect(verdictOf(s)).toEqual({ kind: 'right', decisions: 2 })
  })

  it('names the first decision that was not, and how many were not', () => {
    const s = settled({
      dealerUpCard: c(Rank.Ace),
      insuranceOffered: true, playerTookInsurance: true, correctInsuranceDecision: false,
      decisions: [play(Action.Stand, Action.Surrender)],
    })
    const v = verdictOf(s)
    expect(v.kind).toBe('wrong')
    if (v.kind !== 'wrong') return
    expect(v.first.kind).toBe('insurance')
    expect(v.wrong).toBe(2)
    expect(v.decisions).toBe(2)
  })

  it('says why nothing was decided', () => {
    expect(verdictOf(settled({ result: 'blackjack', profit: 150, playerCards: [c(Rank.Ace), c(Rank.King)] }))).toEqual({ kind: 'none', reason: 'blackjack' })
    expect(verdictOf(settled({ dealerFinalCards: [c(Rank.Ace), c(Rank.Queen)] }))).toEqual({ kind: 'none', reason: 'dealerBlackjack' })
  })
})

describe('tallyRound', () => {
  it('adds up the decisions, the hands by what they paid, and the money', () => {
    const round = [
      settled({ decisions: [play(Action.Stand, Action.Stand)], profit: 100, result: 'win' }),
      settled({ decisions: [play(Action.Hit, Action.Stand)], profit: -100 }),
      settled({ decisions: [], profit: 0, result: 'push' }),
      // Insured against a dealer blackjack: lost the hand, even on the money.
      settled({ insuranceOffered: true, playerTookInsurance: true, correctInsuranceDecision: false, profit: 0, dealerUpCard: c(Rank.Ace), dealerFinalCards: [c(Rank.Ace), c(Rank.King)] }),
    ]
    const tally = tallyRound(round)
    expect(tally).toMatchObject({ hands: 4, decisions: 3, correct: 1, won: 1, lost: 1, pushed: 2, net: 0 })
    expect(tally.misses.map(m => m.kind)).toEqual(['play', 'insurance'])
  })
})
