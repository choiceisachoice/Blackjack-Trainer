import { describe, it, expect } from 'vitest'
import { Rank } from '../../types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'
import { Action } from '../../engine/rules/types'
import {
  CARD_STEP, FELT_GAP, FELT_LABEL, MAX_CARD, MAX_ROW_GAP, MIN_CARD,
  dealQuestionCards, feltLayout, handName, hardSplits,
} from './flash-scene'

/** A small seeded generator, so a failure names a reproducible deal. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function question(hand: string, dealer: string, kind: FlashQuestion['handKind']): FlashQuestion {
  return {
    handKind: kind, hand, dealer, trueCount: null, correctAction: Action.Hit,
    basicAction: Action.Hit, isDeviation: false, noSurrender: false,
  }
}

const value = (rank: Rank): number =>
  rank === Rank.Ace ? 11 : ['10', 'J', 'Q', 'K'].includes(rank) ? 10 : Number(rank)

describe('hardSplits', () => {
  it('gives two different values from 2 to 10 for every drilled hard total', () => {
    for (let total = 9; total <= 17; total++) {
      const splits = hardSplits(total)
      expect(splits.length).toBeGreaterThan(0)
      for (const [a, b] of splits) {
        expect(a + b).toBe(total)
        expect(a).not.toBe(b)
        expect(Math.min(a, b)).toBeGreaterThanOrEqual(2)
        expect(Math.max(a, b)).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('dealQuestionCards', () => {
  const rand = seeded(42)
  const dealers = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A']

  it('deals a hard total as two cards that add up to it — never a pair, never an ace', () => {
    for (let total = 9; total <= 17; total++) {
      for (let i = 0; i < 40; i++) {
        const { player } = dealQuestionCards(question(String(total), '7', 'hard'), rand)
        expect(player).toHaveLength(2)
        expect(value(player[0].rank) + value(player[1].rank)).toBe(total)
        expect(value(player[0].rank)).not.toBe(value(player[1].rank))
        expect(player.some(c => c.rank === Rank.Ace)).toBe(false)
      }
    }
  })

  it('deals a soft hand as an ace and its other card', () => {
    for (const x of ['2', '3', '4', '5', '6', '7', '8', '9']) {
      const { player } = dealQuestionCards(question(`A,${x}`, '5', 'soft'), rand)
      expect(player.map(c => c.rank)).toEqual([Rank.Ace, x as Rank])
    }
  })

  it('deals a pair as two cards of one rank, picture cards included for tens', () => {
    const tenRanks = new Set<string>()
    for (let i = 0; i < 80; i++) {
      const { player } = dealQuestionCards(question('10,10', '6', 'pair'), rand)
      expect(player[0].rank).toBe(player[1].rank)
      expect(player[0].suit).not.toBe(player[1].suit)
      tenRanks.add(player[0].rank)
    }
    expect([...tenRanks].sort()).toEqual(['10', 'J', 'K', 'Q'])
    expect(dealQuestionCards(question('8,8', '6', 'pair'), rand).player.map(c => c.rank)).toEqual([Rank.Eight, Rank.Eight])
    expect(dealQuestionCards(question('A,A', '6', 'pair'), rand).player.map(c => c.rank)).toEqual([Rank.Ace, Rank.Ace])
  })

  it('shows the dealer the up card the question names', () => {
    for (const d of dealers) {
      const { dealer } = dealQuestionCards(question('16', d, 'hard'), rand)
      expect(dealer.rank === Rank.Ace ? 'A' : String(value(dealer.rank))).toBe(d)
    }
  })

  it('gives three cards three different suits', () => {
    for (let i = 0; i < 50; i++) {
      const { player, dealer } = dealQuestionCards(question('A,7', '9', 'soft'), rand)
      expect(new Set([...player, dealer].map(c => c.suit)).size).toBe(3)
    }
  })

  it('deals no player cards for insurance, which is about any hand', () => {
    const q = { ...question('*', 'A', 'hard'), isDeviation: true, trueCount: 3 }
    const { player, dealer } = dealQuestionCards(q, rand)
    expect(player).toEqual([])
    expect(dealer.rank).toBe(Rank.Ace)
  })
})

describe('handName', () => {
  it('names a hand the way a player says it', () => {
    expect(handName(question('15', '6', 'hard'))).toEqual({ key: 'training.flash.hardTotal', values: { n: 15 } })
    expect(handName(question('A,7', '9', 'soft'))).toEqual({ key: 'training.flash.softTotal', values: { n: 18 } })
    expect(handName(question('8,8', '10', 'pair'))).toEqual({ key: 'training.flash.pairOf', values: { rank: '8' } })
    expect(handName(question('A,A', '10', 'pair'))).toEqual({ key: 'training.flash.pairOfAces' })
    expect(handName(question('*', 'A', 'hard'))).toEqual({ key: 'training.flash.anyHand' })
  })
})

describe('feltLayout', () => {
  it('lays the dealer above the player on a phone', () => {
    expect(feltLayout(340, 360).arrangement).toBe('stacked')
  })

  it('lays the dealer above the player on a laptop', () => {
    expect(feltLayout(960, 620).arrangement).toBe('stacked')
  })

  it('puts the hands side by side on a wide, low felt, where stacking would leave them small', () => {
    const wide = feltLayout(1100, 420)
    expect(wide.arrangement).toBe('row')
    expect(wide.cardHeight).toBeGreaterThan(feltLayout(340, 420).cardHeight)
  })

  it('fits the stacked hands in the height it is given', () => {
    for (const [w, h] of [[340, 300], [360, 420], [700, 520], [960, 640]]) {
      const { arrangement, cardHeight } = feltLayout(w, h)
      if (arrangement !== 'stacked' || cardHeight === MIN_CARD) continue
      expect(2 * (FELT_LABEL + cardHeight) + FELT_GAP).toBeLessThanOrEqual(h + 1)
      expect(cardHeight * (5 / 7) * (1 + CARD_STEP)).toBeLessThanOrEqual(w + 1)
    }
  })

  it('moves the hands apart on a wide felt, within a limit', () => {
    const narrow = feltLayout(700, 300)
    const wide = feltLayout(1300, 420)
    expect(narrow.arrangement).toBe('row')
    expect(wide.gap).toBeGreaterThan(narrow.gap)
    expect(wide.gap).toBeLessThanOrEqual(MAX_ROW_GAP)
    expect(feltLayout(340, 360).gap).toBe(FELT_GAP)
  })

  it('lays the hands below the count chip only when they would run under it', () => {
    const chip = { right: 120, bottom: 70 }
    // Laptop: the dealer card is centred well clear of a chip in the corner.
    expect(feltLayout(960, 620, chip).offsetTop).toBe(0)
    // Phone: the dealer card reaches under it, so the hands move down.
    const phone = feltLayout(300, 260, { right: 150, bottom: 60 })
    expect(phone.offsetTop).toBe(60)
    expect(phone.cardHeight).toBeLessThan(feltLayout(300, 260).cardHeight + 1)
  })

  it('never draws a card larger than a card on a table or smaller than its index can be read', () => {
    expect(feltLayout(4000, 3000).cardHeight).toBe(MAX_CARD)
    expect(feltLayout(80, 60).cardHeight).toBe(MIN_CARD)
  })
})
