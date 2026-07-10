import { describe, it, expect } from 'vitest'
import { Rank, Suit } from '../shoe/types'
import type { Card } from '../shoe/types'
import { Action } from '../rules/types'
import { ILLUSTRIOUS_18, FAB_4, getDeviationAction, findMatchingDeviation } from './deviations'
import { getAtTableDeviations, getDeviations } from '../../components/training/deviation-utils'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

// ── Insurance Deviations ──────────────────────────────────────────

describe('Insurance Deviation', () => {
  it('Insurance deviation fires at TC >= +3', () => {
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
    expect(result).toBeNull()
  })

  it('Insurance fires with any hand at TC >= +3', () => {
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

// ── 16 vs 9 Deviation ───────────────────────────────────────────

describe('16 vs 9 Deviation', () => {
  it('16 vs 9 at TC +5 = Stand', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Nine),
      5,
      ILLUSTRIOUS_18
    )
    expect(result).toBe(Action.Stand)
  })

  it('16 vs 9 at TC +4 = null (below threshold)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Six)],
      c(Rank.Nine),
      4,
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
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

// ── Reversed Deviations (I18 #14-18) ────────────────────────────

describe('Reversed Deviations', () => {
  it('13 vs 2: Stand at TC >= -1 (basic strategy)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Three)],
      c(Rank.Two),
      -1,
      ILLUSTRIOUS_18
    )
    // At TC >= -1, basic strategy (Stand) applies
    expect(result).toBe(Action.Stand)
  })

  it('13 vs 2: null at TC < -1 (deviation to Hit, but getDeviationAction only returns actionAbove)', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Three)],
      c(Rank.Two),
      -2,
      ILLUSTRIOUS_18
    )
    // getDeviationAction returns null when TC < threshold;
    // for reversed deviations, the CORRECT play at TC < -1 is Hit,
    // but this function only handles the "above" case.
    expect(result).toBeNull()
  })

  it('12 vs 4: Stand at TC >= 0, null at TC < 0', () => {
    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Two)],
      c(Rank.Four),
      0,
      ILLUSTRIOUS_18
    )).toBe(Action.Stand)

    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Two)],
      c(Rank.Four),
      -1,
      ILLUSTRIOUS_18
    )).toBeNull()
  })

  it('12 vs 5: Stand at TC >= -2, null at TC < -2', () => {
    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Two)],
      c(Rank.Five),
      -2,
      ILLUSTRIOUS_18
    )).toBe(Action.Stand)

    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Two)],
      c(Rank.Five),
      -3,
      ILLUSTRIOUS_18
    )).toBeNull()
  })

  it('12 vs 6: Stand at TC >= -1, null at TC < -1', () => {
    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Two)],
      c(Rank.Six),
      -1,
      ILLUSTRIOUS_18
    )).toBe(Action.Stand)

    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Two)],
      c(Rank.Six),
      -2,
      ILLUSTRIOUS_18
    )).toBeNull()
  })

  it('13 vs 3: Stand at TC >= -2, null at TC < -2', () => {
    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Three)],
      c(Rank.Three),
      -2,
      ILLUSTRIOUS_18
    )).toBe(Action.Stand)

    expect(getDeviationAction(
      [c(Rank.Ten), c(Rank.Three)],
      c(Rank.Three),
      -3,
      ILLUSTRIOUS_18
    )).toBeNull()
  })

  it('reversed deviations have actionAbove=Stand, actionBelow=Hit', () => {
    const reversed = ['13 vs 2', '12 vs 4', '12 vs 5', '12 vs 6', '13 vs 3']
    for (const name of reversed) {
      const dev = ILLUSTRIOUS_18.find(d => d.name === name)!
      expect(dev.actionAbove).toBe(Action.Stand)
      expect(dev.actionBelow).toBe(Action.Hit)
    }
  })
})

// ── Illustrious 18 Structure ─────────────────────────────────────

describe('Illustrious 18 Structure', () => {
  it('I18 contains exactly 18 deviations', () => {
    expect(ILLUSTRIOUS_18).toHaveLength(18)
  })

  it('all I18 deviations have correct flags', () => {
    for (const dev of ILLUSTRIOUS_18) {
      expect(dev.isIllustrious18).toBe(true)
      expect(dev.isFab4).toBe(false)
    }
  })

  it('all I18 indices match official values', () => {
    const expected: [string, number][] = [
      ['Insurance', 3],
      ['16 vs 10', 0],
      ['15 vs 10', 4],
      ['10,10 vs 5', 5],
      ['10,10 vs 6', 4],
      ['10 vs 10', 4],
      ['12 vs 3', 2],
      ['12 vs 2', 3],
      ['11 vs A', 1],
      ['9 vs 2', 1],
      ['10 vs A', 4],
      ['9 vs 7', 3],
      ['16 vs 9', 5],
      ['13 vs 2', -1],
      ['12 vs 4', 0],
      ['12 vs 5', -2],
      ['12 vs 6', -1],
      ['13 vs 3', -2],
    ]

    expect(expected).toHaveLength(18)

    for (const [name, threshold] of expected) {
      const dev = ILLUSTRIOUS_18.find(d => d.name === name)
      expect(dev, `Missing deviation: ${name}`).toBeDefined()
      expect(dev!.trueCountThreshold).toBe(threshold)
    }
  })

  it('all I18 actions match official values', () => {
    const byName = (name: string) => ILLUSTRIOUS_18.find(d => d.name === name)!

    // Standard deviations (1-13): actionAbove = deviation, actionBelow = BS
    expect(byName('Insurance').actionAbove).toBe(Action.Insurance)
    expect(byName('16 vs 10').actionAbove).toBe(Action.Stand)
    expect(byName('15 vs 10').actionAbove).toBe(Action.Stand)
    expect(byName('10,10 vs 5').actionAbove).toBe(Action.Split)
    expect(byName('10,10 vs 6').actionAbove).toBe(Action.Split)
    expect(byName('10 vs 10').actionAbove).toBe(Action.Double)
    expect(byName('12 vs 3').actionAbove).toBe(Action.Stand)
    expect(byName('12 vs 2').actionAbove).toBe(Action.Stand)
    expect(byName('11 vs A').actionAbove).toBe(Action.Double)
    expect(byName('9 vs 2').actionAbove).toBe(Action.Double)
    expect(byName('10 vs A').actionAbove).toBe(Action.Double)
    expect(byName('9 vs 7').actionAbove).toBe(Action.Double)
    expect(byName('16 vs 9').actionAbove).toBe(Action.Stand)

    // Reversed deviations (14-18): actionAbove = Stand (BS), actionBelow = Hit (deviation)
    expect(byName('13 vs 2').actionAbove).toBe(Action.Stand)
    expect(byName('13 vs 2').actionBelow).toBe(Action.Hit)
    expect(byName('12 vs 4').actionAbove).toBe(Action.Stand)
    expect(byName('12 vs 4').actionBelow).toBe(Action.Hit)
    expect(byName('12 vs 5').actionAbove).toBe(Action.Stand)
    expect(byName('12 vs 5').actionBelow).toBe(Action.Hit)
    expect(byName('12 vs 6').actionAbove).toBe(Action.Stand)
    expect(byName('12 vs 6').actionBelow).toBe(Action.Hit)
    expect(byName('13 vs 3').actionAbove).toBe(Action.Stand)
    expect(byName('13 vs 3').actionBelow).toBe(Action.Hit)
  })
})

// ── Fab 4 Structure ──────────────────────────────────────────────

describe('Fab 4 Structure', () => {
  it('Fab 4 contains exactly 4 deviations', () => {
    expect(FAB_4).toHaveLength(4)
  })

  it('all Fab 4 have correct flags and Surrender action', () => {
    for (const dev of FAB_4) {
      expect(dev.isIllustrious18).toBe(false)
      expect(dev.isFab4).toBe(true)
      expect(dev.actionAbove).toBe(Action.Surrender)
    }
  })

  it('all Fab 4 indices match official values', () => {
    const expected: [string, number][] = [
      ['14 vs 10', 3],
      ['15 vs 10 (surrender)', 0], // disambiguated from the I18 "15 vs 10" stand
      ['15 vs 9', 2],
      ['15 vs A', 1],
    ]

    for (const [name, threshold] of expected) {
      const dev = FAB_4.find(d => d.name === name)
      expect(dev, `Missing Fab 4 deviation: ${name}`).toBeDefined()
      expect(dev!.trueCountThreshold).toBe(threshold)
    }
  })
})

// ── 15 vs 10 Priority (I18 + Fab 4 interaction) ─────────────────

describe('15 vs 10 Priority', () => {
  const allDeviations = [...ILLUSTRIOUS_18, ...FAB_4]
  const hand15 = [c(Rank.Ten), c(Rank.Five)]
  const dealer10 = c(Rank.Ten)

  it('TC >= +4 → Stand (I18 takes priority over Fab4)', () => {
    const result = getDeviationAction(hand15, dealer10, 4, allDeviations)
    expect(result).toBe(Action.Stand)
  })

  it('TC +5 → Stand (I18 still applies)', () => {
    const result = getDeviationAction(hand15, dealer10, 5, allDeviations)
    expect(result).toBe(Action.Stand)
  })

  it('TC 0 to +3 → Surrender (Fab4 applies, I18 threshold not met)', () => {
    for (const tc of [0, 1, 2, 3]) {
      const result = getDeviationAction(hand15, dealer10, tc, allDeviations)
      expect(result).toBe(Action.Surrender)
    }
  })

  it('TC < 0 → null (use basic strategy: Hit)', () => {
    const result = getDeviationAction(hand15, dealer10, -1, allDeviations)
    expect(result).toBeNull()
  })
})

// ── No Match / Edge Cases ───────────────────────────────────────

describe('No Match', () => {
  it('getDeviationAction returns null when no deviation matches', () => {
    const result = getDeviationAction(
      [c(Rank.Ten), c(Rank.Seven)],
      c(Rank.Two),
      5,
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('getDeviationAction returns null for soft hands against hard total deviations', () => {
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
    const result = findMatchingDeviation(
      [c(Rank.Ten), c(Rank.Seven)],
      c(Rank.Two),
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })

  it('soft hand does not match hard total deviation', () => {
    const result = findMatchingDeviation(
      [c(Rank.Ace), c(Rank.Five)],
      c(Rank.Ten),
      ILLUSTRIOUS_18
    )
    expect(result).toBeNull()
  })
})

// ── At-Table Deviations (Insurance excluded) ─────────────────

describe('getAtTableDeviations', () => {
  it('excludes Insurance from i18 set', () => {
    const atTable = getAtTableDeviations('i18')
    const full = getDeviations('i18')
    expect(atTable).toHaveLength(full.length - 1)
    expect(atTable.find(d => d.name === 'Insurance')).toBeUndefined()
  })

  it('excludes Insurance from all set', () => {
    const atTable = getAtTableDeviations('all')
    expect(atTable.find(d => d.name === 'Insurance')).toBeUndefined()
  })

  it('fab4 set is unchanged (no Insurance)', () => {
    const atTable = getAtTableDeviations('fab4')
    const full = getDeviations('fab4')
    expect(atTable).toHaveLength(full.length)
  })

  it('findMatchingDeviation with filtered list does not match Insurance vs Ace', () => {
    const atTable = getAtTableDeviations('i18')
    const result = findMatchingDeviation(
      [c(Rank.Ten), c(Rank.Ten)],
      c(Rank.Ace),
      atTable
    )
    // With Insurance filtered out, 10,10 vs A does not match any deviation
    expect(result).toBeNull()
  })

  it('findMatchingDeviation with filtered list still matches 11 vs A', () => {
    const atTable = getAtTableDeviations('i18')
    const result = findMatchingDeviation(
      [c(Rank.Five), c(Rank.Six)],
      c(Rank.Ace),
      atTable
    )
    expect(result).not.toBeNull()
    expect(result!.name).toBe('11 vs A')
  })
})
