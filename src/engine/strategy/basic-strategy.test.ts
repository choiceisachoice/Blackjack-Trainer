import { describe, it, expect } from 'vitest'
import { getOptimalAction, resolveStrategyAction } from './basic-strategy'
import { Action, DEFAULT_RULES } from '../rules/types'
import type { CasinoRules } from '../rules/types'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

const S17_RULES: CasinoRules = { ...DEFAULT_RULES, dealerHitsSoft17: false }
const H17_RULES: CasinoRules = { ...DEFAULT_RULES, dealerHitsSoft17: true }

// ── Hard Totals ────────────────────────────────────────────────────

describe('Hard Totals', () => {
  it('Hard 8 vs Dealer 6 = Hit', () => {
    expect(getOptimalAction([c(Rank.Five), c(Rank.Three)], c(Rank.Six), S17_RULES))
      .toBe(Action.Hit)
  })

  it('Hard 9 vs Dealer 3 = Double (if allowed), else Hit', () => {
    // 2-card hand → can double
    expect(getOptimalAction([c(Rank.Five), c(Rank.Four)], c(Rank.Three), S17_RULES))
      .toBe(Action.Double)
    // 3-card hand → can't double → falls back to Hit
    expect(getOptimalAction([c(Rank.Three), c(Rank.Four), c(Rank.Two)], c(Rank.Three), S17_RULES))
      .toBe(Action.Hit)
  })

  it('Hard 10 vs Dealer 10 = Hit', () => {
    expect(getOptimalAction([c(Rank.Six), c(Rank.Four)], c(Rank.Ten), S17_RULES))
      .toBe(Action.Hit)
  })

  it('Hard 11 vs Dealer 6 = Double', () => {
    expect(getOptimalAction([c(Rank.Six), c(Rank.Five)], c(Rank.Six), S17_RULES))
      .toBe(Action.Double)
  })

  it('Hard 12 vs Dealer 2 = Hit', () => {
    expect(getOptimalAction([c(Rank.Seven), c(Rank.Five)], c(Rank.Two), S17_RULES))
      .toBe(Action.Hit)
  })

  it('Hard 12 vs Dealer 4 = Stand', () => {
    expect(getOptimalAction([c(Rank.Seven), c(Rank.Five)], c(Rank.Four), S17_RULES))
      .toBe(Action.Stand)
  })

  it('Hard 13 vs Dealer 2 = Stand', () => {
    expect(getOptimalAction([c(Rank.Seven), c(Rank.Six)], c(Rank.Two), S17_RULES))
      .toBe(Action.Stand)
  })

  it('Hard 16 vs Dealer 10 = Surrender (with late surrender), else Hit', () => {
    // With late surrender (default)
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Six)], c(Rank.Ten), S17_RULES))
      .toBe(Action.Surrender)
    // Without surrender
    const noSurrRules: CasinoRules = { ...S17_RULES, surrenderAllowed: 'none' }
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Six)], c(Rank.Ten), noSurrRules))
      .toBe(Action.Hit)
  })

  it('Hard 17+ always Stand (S17 rules)', () => {
    for (const dealerRank of [Rank.Two, Rank.Six, Rank.Ten, Rank.Ace]) {
      expect(getOptimalAction([c(Rank.Ten), c(Rank.Seven)], c(dealerRank), S17_RULES))
        .toBe(Action.Stand)
      expect(getOptimalAction([c(Rank.Ten), c(Rank.Eight)], c(dealerRank), S17_RULES))
        .toBe(Action.Stand)
      expect(getOptimalAction([c(Rank.Ten), c(Rank.Nine)], c(dealerRank), S17_RULES))
        .toBe(Action.Stand)
    }
  })
})

// ── Soft Totals ────────────────────────────────────────────────────

describe('Soft Totals', () => {
  it('Soft 13 (A,2) vs Dealer 5 = Double, else Hit', () => {
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Two)], c(Rank.Five), S17_RULES))
      .toBe(Action.Double)
  })

  it('Soft 17 (A,6) vs Dealer 3 = Double, else Hit', () => {
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Six)], c(Rank.Three), S17_RULES))
      .toBe(Action.Double)
  })

  it('Soft 18 (A,7) vs Dealer 2 = Double, else Stand', () => {
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Seven)], c(Rank.Two), S17_RULES))
      .toBe(Action.Double)
  })

  it('Soft 18 (A,7) vs Dealer 9 = Hit', () => {
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Seven)], c(Rank.Nine), S17_RULES))
      .toBe(Action.Hit)
  })

  it('Soft 19 (A,8) vs Dealer 6 = Double, else Stand', () => {
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Eight)], c(Rank.Six), S17_RULES))
      .toBe(Action.Double)
  })

  it('Soft 20 (A,9) always Stand', () => {
    for (const dealerRank of [Rank.Two, Rank.Six, Rank.Ten, Rank.Ace]) {
      expect(getOptimalAction([c(Rank.Ace), c(Rank.Nine)], c(dealerRank), S17_RULES))
        .toBe(Action.Stand)
    }
  })
})

// ── Pairs ──────────────────────────────────────────────────────────

describe('Pairs', () => {
  it('8,8 vs Dealer A = Split', () => {
    expect(getOptimalAction([c(Rank.Eight, Suit.Spades), c(Rank.Eight, Suit.Hearts)], c(Rank.Ace), S17_RULES))
      .toBe(Action.Split)
  })

  it('8,8 always Split', () => {
    for (const dealerRank of [Rank.Two, Rank.Five, Rank.Seven, Rank.Ten, Rank.Ace]) {
      expect(getOptimalAction([c(Rank.Eight, Suit.Spades), c(Rank.Eight, Suit.Hearts)], c(dealerRank), S17_RULES))
        .toBe(Action.Split)
    }
  })

  it('A,A always Split', () => {
    for (const dealerRank of [Rank.Two, Rank.Five, Rank.Seven, Rank.Ten, Rank.Ace]) {
      expect(getOptimalAction([c(Rank.Ace, Suit.Spades), c(Rank.Ace, Suit.Hearts)], c(dealerRank), S17_RULES))
        .toBe(Action.Split)
    }
  })

  it('10,10 never Split (always Stand)', () => {
    for (const dealerRank of [Rank.Two, Rank.Five, Rank.Six, Rank.Ten, Rank.Ace]) {
      expect(getOptimalAction([c(Rank.Ten, Suit.Spades), c(Rank.Ten, Suit.Hearts)], c(dealerRank), S17_RULES))
        .toBe(Action.Stand)
      // Also verify with face cards (J+K)
      expect(getOptimalAction([c(Rank.Jack, Suit.Spades), c(Rank.King, Suit.Hearts)], c(dealerRank), S17_RULES))
        .toBe(Action.Stand)
    }
  })

  it('4,4 vs Dealer 5 = Split, vs Dealer 2 = Hit', () => {
    expect(getOptimalAction([c(Rank.Four, Suit.Spades), c(Rank.Four, Suit.Hearts)], c(Rank.Five), S17_RULES))
      .toBe(Action.Split)
    expect(getOptimalAction([c(Rank.Four, Suit.Spades), c(Rank.Four, Suit.Hearts)], c(Rank.Two), S17_RULES))
      .toBe(Action.Hit)
  })

  it('5,5 never Split (treat as Hard 10)', () => {
    // 5,5 vs 6 should be Double (treated as hard 10), not Split
    expect(getOptimalAction([c(Rank.Five, Suit.Spades), c(Rank.Five, Suit.Hearts)], c(Rank.Six), S17_RULES))
      .toBe(Action.Double)
    // 5,5 vs 10 should be Hit, not Split
    expect(getOptimalAction([c(Rank.Five, Suit.Spades), c(Rank.Five, Suit.Hearts)], c(Rank.Ten), S17_RULES))
      .toBe(Action.Hit)
  })
})

// ── Edge Cases ─────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('Double not allowed → falls back to Hit or Stand', () => {
    // Hard 9 vs 3: table says D, 3-card hand → can't double → Hit
    expect(getOptimalAction([c(Rank.Two), c(Rank.Three), c(Rank.Four)], c(Rank.Three), S17_RULES))
      .toBe(Action.Hit)
    // Soft 18 (A,7) vs 2: table says Ds, 3-card hand → can't double → Stand
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Three), c(Rank.Four)], c(Rank.Two), S17_RULES))
      .toBe(Action.Stand)
  })

  it('Surrender not allowed → falls back to Hit', () => {
    const noSurrRules: CasinoRules = { ...S17_RULES, surrenderAllowed: 'none' }
    // 16 vs 10: table says Rh → no surrender → Hit
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Six)], c(Rank.Ten), noSurrRules))
      .toBe(Action.Hit)
    // 15 vs 10: table says Rh → no surrender → Hit
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Five)], c(Rank.Ten), noSurrRules))
      .toBe(Action.Hit)
  })

  it('S17 vs H17 differ on specific hands (all 6 cells)', () => {
    // 1. Hard 11 vs A:  S17=Double, H17=Hit
    expect(getOptimalAction([c(Rank.Six), c(Rank.Five)], c(Rank.Ace), S17_RULES))
      .toBe(Action.Double)
    expect(getOptimalAction([c(Rank.Six), c(Rank.Five)], c(Rank.Ace), H17_RULES))
      .toBe(Action.Hit)

    // 2. Hard 15 vs A:  S17=Hit, H17=Surrender
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Five)], c(Rank.Ace), S17_RULES))
      .toBe(Action.Hit)
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Five)], c(Rank.Ace), H17_RULES))
      .toBe(Action.Surrender)

    // 3. Hard 17 vs A:  S17=Stand, H17=Surrender
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Seven)], c(Rank.Ace), S17_RULES))
      .toBe(Action.Stand)
    expect(getOptimalAction([c(Rank.Ten), c(Rank.Seven)], c(Rank.Ace), H17_RULES))
      .toBe(Action.Surrender)

    // 4. Soft 17 (A,6) vs 2:  S17=Hit, H17=Double
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Six)], c(Rank.Two), S17_RULES))
      .toBe(Action.Hit)
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Six)], c(Rank.Two), H17_RULES))
      .toBe(Action.Double)

    // 5. Soft 18 (A,7) vs 2:  S17=Double, H17=Stand
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Seven)], c(Rank.Two), S17_RULES))
      .toBe(Action.Double)
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Seven)], c(Rank.Two), H17_RULES))
      .toBe(Action.Stand)

    // 6. Soft 19 (A,8) vs 6:  S17=Double, H17=Stand
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Eight)], c(Rank.Six), S17_RULES))
      .toBe(Action.Double)
    expect(getOptimalAction([c(Rank.Ace), c(Rank.Eight)], c(Rank.Six), H17_RULES))
      .toBe(Action.Stand)
  })
})

// ── resolveStrategyAction ──────────────────────────────────────────

describe('resolveStrategyAction', () => {
  it('resolves D → Double when allowed, Hit when not', () => {
    expect(resolveStrategyAction('D', true, false)).toBe(Action.Double)
    expect(resolveStrategyAction('D', false, false)).toBe(Action.Hit)
  })

  it('resolves Ds → Double when allowed, Stand when not', () => {
    expect(resolveStrategyAction('Ds', true, false)).toBe(Action.Double)
    expect(resolveStrategyAction('Ds', false, false)).toBe(Action.Stand)
  })

  it('resolves Rh → Surrender when allowed, Hit when not', () => {
    expect(resolveStrategyAction('Rh', false, true)).toBe(Action.Surrender)
    expect(resolveStrategyAction('Rh', false, false)).toBe(Action.Hit)
  })

  it('resolves Rs → Surrender when allowed, Stand when not', () => {
    expect(resolveStrategyAction('Rs', false, true)).toBe(Action.Surrender)
    expect(resolveStrategyAction('Rs', false, false)).toBe(Action.Stand)
  })

  it('resolves simple actions directly', () => {
    expect(resolveStrategyAction('H', true, true)).toBe(Action.Hit)
    expect(resolveStrategyAction('S', true, true)).toBe(Action.Stand)
    expect(resolveStrategyAction('P', true, true)).toBe(Action.Split)
  })
})
