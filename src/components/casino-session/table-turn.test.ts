import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { turnOptions, useAutoStand } from './table-turn'
import { Action } from '../../engine/rules/types'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { HandInfo } from './helpers'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })
const RULES = { maxSplitHands: 4, doubleAfterSplit: true, surrenderAllowed: true }

function turn(hands: Card[][], over: {
  info?: HandInfo[]; active?: number; doubled?: number[]; surrendered?: number[]; bet?: number; step?: 'human_playing' | 'settlement'
} = {}) {
  return {
    gameStep: over.step ?? 'human_playing' as const,
    humanHands: hands,
    humanHandInfo: over.info ?? hands.map(() => ({ box: 0, split: hands.length > 1 })),
    activeHandIndex: over.active ?? 0,
    currentBet: over.bet ?? 100,
    surrenderedHands: new Set(over.surrendered ?? []),
    handDoubled: new Set(over.doubled ?? []),
  }
}

describe('turnOptions', () => {
  it('offers everything but a split on a first decision that is not a pair', () => {
    expect(turnOptions(turn([[c(Rank.Ten), c(Rank.Six)]]), RULES, 900)).toEqual({
      canHit: true, canStand: true, canDouble: true, canSplit: false, canSurrender: true, humanBusted: false,
    })
  })

  it('offers a split on a pair the bankroll covers, and not beyond the hand limit', () => {
    expect(turnOptions(turn([[c(Rank.Eight), c(Rank.Eight, Suit.Hearts)]]), RULES, 900).canSplit).toBe(true)
    expect(turnOptions(turn([[c(Rank.Eight), c(Rank.Eight, Suit.Hearts)]]), RULES, 50).canSplit).toBe(false)
    const four = [[c(Rank.Eight), c(Rank.Eight)], [c(Rank.Eight), c(Rank.Two)], [c(Rank.Eight), c(Rank.Three)], [c(Rank.Eight), c(Rank.Four)]]
    expect(turnOptions(turn(four), RULES, 900).canSplit).toBe(false)
  })

  it('takes double and surrender away after the first card is drawn', () => {
    const o = turnOptions(turn([[c(Rank.Five), c(Rank.Three), c(Rank.Two)]]), RULES, 900)
    expect(o.canDouble).toBe(false)
    expect(o.canSurrender).toBe(false)
    expect(o.canHit).toBe(true)
  })

  it('never surrenders a split hand, and doubles one only where the table allows it', () => {
    const split = turn([[c(Rank.Eight), c(Rank.Three)], [c(Rank.Eight), c(Rank.Nine)]])
    expect(turnOptions(split, RULES, 900).canSurrender).toBe(false)
    expect(turnOptions(split, RULES, 900).canDouble).toBe(true)
    expect(turnOptions(split, { ...RULES, doubleAfterSplit: false }, 900).canDouble).toBe(false)
  })

  it('leaves a doubled hand nothing to do', () => {
    const o = turnOptions(turn([[c(Rank.Five), c(Rank.Six), c(Rank.Two)]], { doubled: [0] }), RULES, 900)
    expect(o.canHit || o.canStand || o.canDouble).toBe(false)
  })

  it('lets a split ace only split again or stand on a second ace', () => {
    const aces = turn([[c(Rank.Ace), c(Rank.Ace, Suit.Hearts)], [c(Rank.Ace, Suit.Clubs), c(Rank.Nine)]])
    const o = turnOptions(aces, RULES, 900)
    expect(o).toMatchObject({ canHit: false, canDouble: false, canStand: true, canSplit: true })
    const done = turnOptions(turn([[c(Rank.Ace), c(Rank.Nine)], [c(Rank.Ace, Suit.Clubs)]]), RULES, 900)
    expect(done).toMatchObject({ canHit: false, canStand: false })
  })

  it('reports a bust', () => {
    expect(turnOptions(turn([[c(Rank.Ten), c(Rank.Six), c(Rank.King)]]), RULES, 900).humanBusted).toBe(true)
  })
})

describe('useAutoStand', () => {
  afterEach(() => vi.useRealTimers())

  it('stands a 21 that would otherwise wait for a click, half a second later', () => {
    vi.useFakeTimers()
    const act = vi.fn()
    renderHook(() => useAutoStand(turn([[c(Rank.Seven), c(Rank.Four), c(Rank.King)]]), act))
    vi.advanceTimersByTime(499)
    expect(act).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(act).toHaveBeenCalledWith(Action.Stand)
  })

  it('leaves a doubled hand, a split ace and a hand that is not 21 alone', () => {
    vi.useFakeTimers()
    const act = vi.fn()
    renderHook(() => useAutoStand(turn([[c(Rank.Five), c(Rank.Six), c(Rank.King)]], { doubled: [0] }), act))
    renderHook(() => useAutoStand(turn([[c(Rank.Ace), c(Rank.King)], [c(Rank.Ace, Suit.Clubs)]]), act))
    renderHook(() => useAutoStand(turn([[c(Rank.Ten), c(Rank.Nine)]]), act))
    renderHook(() => useAutoStand(turn([[c(Rank.Seven), c(Rank.Four), c(Rank.King)]], { step: 'settlement' }), act))
    vi.advanceTimersByTime(2000)
    expect(act).not.toHaveBeenCalled()
  })
})
