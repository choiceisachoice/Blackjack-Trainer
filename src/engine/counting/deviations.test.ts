import { describe, it, expect } from 'vitest'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'
import { Action } from '../rules/types'
import { ILLUSTRIOUS_18, FAB_4, getDeviationAction, findMatchingDeviation } from './deviations'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

// ── Insurance Deviations ──────────────────────────────────────────

describe('Insurance Deviation', () => {
  it('Insurance deviation fires at TC >= +3', () => {
    // Any hand, dealer Ace, TC = 3
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Ace),
      3,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Insurance)
  })

  it('Insurance deviation does NOT fire at TC +2', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Ace),
      2,
      ILLUSTRIOUS_18
    )
    // At TC +2, Insurance doesn't fire. The 16 vs A deviation doesn't exist
    // in Illustrious 18 either, so returns null.
    expect(result).toBeNull()
  })

  it('Insurance fires with any hand at TC >= +3', () => {
    // Soft 18 hand with dealer Ace
    const result = getDeviationAction(
      [c(Rank.Ace), c(Rank.Seven)],
      c(Rank.Ace),
      5,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Insurance)
  })
})

// ── 16 vs 10 Deviation ───────────────────────────────────────────

describe('16 vs 10 Deviation', () => {
  it('16 vs 10 at TC 0 = Stand (deviation)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Ten),
      0,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Stand)
  })

  it('16 vs 10 at TC -1 = null (use basic strategy)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Ten),
      -1,
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('16 vs 10 at TC +3 = Stand (deviation still applies)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Ten),
      3,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Stand)
  })

  it('16 vs Jack = Stand at TC 0 (Jack maps to 10)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Jack),
      0,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Stand)
  })
})

// ── Pair Deviations ──────────────────────────────────────────────

describe('Pair Deviations', () => {
  it('10,10 vs 5 at TC +5 = Split', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Ten)],
      c(Rank.Five),
      5,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Split)
  })

  it('10,10 vs 5 at TC +4 = null (below threshold)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Ten)],
      c(Rank.Five),
      4,
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('J,K vs 6 at TC +4 = Split (face cards count as 10-pair)', () => {
    const result = getDeviationAction(
      [c(Rank.Jack), c(Rank.King)],
      c(Rank.Six),
      4,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Split)
  })
})

// ── Illustrious 18 Structure ─────────────────────────────────────

describe('Illustrious 18 Structure', () => {
  it('All 18 Illustrious deviations have correct thresholds', () => {
    expect(ILLUSTRIOUS_18).toHaveLength(18)

    // All must be marked isIllustrious18
    for (const dev of ILLUSTRIOUS_18) {
      expect(dev.isIllustrious18).toBe(true)
      expect(dev.isFab4).toBe(false)
    }

    // Verify specific thresholds by name
    const byName = (name: string) => ILLUSTRIOUS_18.find(d => d.name === name)

    expect(byName('Insurance')?.trueCountThreshold).toBe(3)
    expect(byName('16 vs 10')?.trueCountThreshold).toBe(0)
    expect(byName('15 vs 10')?.trueCountThreshold).toBe(4)
    expect(byName('10,10 vs 5')?.trueCountThreshold).toBe(5)
    expect(byName('10,10 vs 6')?.trueCountThreshold).toBe(4)
    expect(byName('10 vs 10')?.trueCountThreshold).toBe(4)
    expect(byName('12 vs 3')?.trueCountThreshold).toBe(2)
    expect(byName('12 vs 2')?.trueCountThreshold).toBe(3)
    expect(byName('11 vs A')?.trueCountThreshold).toBe(1)
    expect(byName('9 vs 2')?.trueCountThreshold).toBe(1)
    expect(byName('10 vs A')?.trueCountThreshold).toBe(4)
    expect(byName('9 vs 7')?.trueCountThreshold).toBe(3)
    expect(byName('16 vs 9')?.trueCountThreshold).toBe(5)
    expect(byName('13 vs 2')?.trueCountThreshold).toBe(-1)
    expect(byName('12 vs 4')?.trueCountThreshold).toBe(0)
    expect(byName('12 vs 5')?.trueCountThreshold).toBe(-2)
    expect(byName('12 vs 6')?.trueCountThreshold).toBe(-1)
    expect(byName('13 vs 3')?.trueCountThreshold).toBe(-2)
  })
})

// ── Fab 4 Structure ──────────────────────────────────────────────

describe('Fab 4 Structure', () => {
  it('All 4 Fab 4 deviations have correct thresholds', () => {
    expect(FAB_4).toHaveLength(4)

    for (const dev of FAB_4) {
      expect(dev.isIllustrious18).toBe(false)
      expect(dev.isFab4).toBe(true)
      expect(dev.actionAbove).toBe(Action.Surrender)
    }

    const byName = (name: string) => FAB_4.find(d => d.name === name)

    expect(byName('14 vs 10')?.trueCountThreshold).toBe(3)
    expect(byName('15 vs 10')?.trueCountThreshold).toBe(0)
    expect(byName('15 vs 9')?.trueCountThreshold).toBe(2)
    expect(byName('15 vs A')?.trueCountThreshold).toBe(1)
  })
})

// ── No Match ─────────────────────────────────────────────────────

describe('No Match', () => {
  it('getDeviationAction returns null when no deviation matches', () => {
    // Hard 17 vs 2 — not in Illustrious 18
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Seven)],
      c(Rank.Two),
      5,
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('getDeviationAction returns null for soft hands against hard total deviations', () => {
    // Soft 16 (A+5) vs 10 should NOT match hard 16 vs 10 deviation
    const result = getDeviationAction(
      [c(Rank.Ace), c(Rank.Five)],
      c(Rank.Ten),
      0,
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('Fab 4: 14 vs 10 at TC +3 = Surrender', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Four)],
      c(Rank.Ten),
      3,
      FAB_4
    )
    expect(result).toBe(Action.Surrender)
  })

  it('Fab 4: 15 vs A at TC +1 = Surrender', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Five)],
      c(Rank.Ace),
      1,
      FAB_4
    )
    expect(result).toBe(Action.Surrender)
  })

  it('Fab 4: 15 vs A at TC 0 = null (below threshold)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Five)],
      c(Rank.Ace),
      0,
      FAB_4
    )
    expect(result).toBeNull()
  })
})

// ── findMatchingDeviation ─────────────────────────────────────

describe('findMatchingDeviation', () => {
  it('matches hard total deviation (16 vs 10)', () => {
    const result = findMatchingDeviation(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Ten),
      ILLUSTRIOUS_18
    )
    expect(result).not.toBeNull()
    expect(result!.name).toBe('16 vs 10')
  })

  it('matches pair deviation (10,10 vs 5)', () => {
    const result = findMatchingDeviation(
      [c(Rank.Ten), c(Rank.Ten)],
      c(Rank.Five),
      ILLUSTRIOUS_18
    )
    expect(result).not.toBeNull()
    expect(result!.name).toBe('10,10 vs 5')
  })

  it('matches wildcard Insurance (any hand vs A)', () => {
    const result = findMatchingDeviation(
      [c(Rank.Seven), c(Rank.Three)],
      c(Rank.Ace),
      ILLUSTRIOUS_18
    )
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Insurance')
  })

  it('maps face cards to 10 for dealer upcard', () => {
    const result = findMatchingDeviation(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Queen),
      ILLUSTRIOUS_18
    )
    expect(result).not.toBeNull()
    expect(result!.name).toBe('16 vs 10')
  })

  it('returns null when no deviation matches', () => {
    // 17 vs 2 — not in any deviation set
    const result = findMatchingDeviation(
      [c(Rank.Ten), c(Rank.Seven)],
      c(Rank.Two),
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('soft hand does not match hard total deviation', () => {
    // Soft 16 (A+5) should NOT match hard 16 vs 10
    const result = findMatchingDeviation(
      [c(Rank.Ace), c(Rank.Five)],
      c(Rank.Ten),
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })
})
