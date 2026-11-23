import { describe, it, expect } from 'vitest'
import {
  EASE, MAX_XP_ROWS, ROLL_DELAY_MS, SETTLE_BUDGET_MS,
  ink, levelUpTimeline, picturesFor, rollDuration, sparks, tierChanged, tint, xpRows,
} from './level-up-moment'
import { LEVELS } from '../../services/level-system'

describe('the level-up timeline', () => {
  it('settles inside the budget for every jump the ladder allows', () => {
    // A celebration that outlasts about a second stops reading as a reward and
    // starts reading as a wait. The longest roll (24 levels at once) included.
    for (let steps = 1; steps <= LEVELS.length - 1; steps++) {
      for (const withTier of [false, true]) {
        const t = levelUpTimeline(steps, withTier)
        expect(t.settledAt, `steps ${steps}, tier ${withTier}`).toBeLessThan(SETTLE_BUDGET_MS)
      }
    }
    expect(SETTLE_BUDGET_MS).toBe(1200)
  })

  it('rolls further in more time, but never past the long band', () => {
    // Duration scales with distance: one level is a short roll, a burst of four
    // is a longer one, and anything beyond that is capped rather than slowed.
    expect(rollDuration(1)).toBe(450)
    expect(rollDuration(2)).toBe(500)
    expect(rollDuration(3)).toBe(550)
    expect(rollDuration(4)).toBe(600)
    expect(rollDuration(24)).toBe(600)
    expect(rollDuration(0)).toBe(450)
  })

  it('lands the number after the card has arrived, and bursts on the landing', () => {
    const t = levelUpTimeline(2, false)
    expect(t.roll.delay).toBe(ROLL_DELAY_MS)
    expect(t.landAt).toBe(ROLL_DELAY_MS + rollDuration(2))
    // The burst starts a beat before the landing, so it reads as caused by it.
    expect(t.burst.delay).toBeLessThan(t.landAt)
    expect(t.burst.delay).toBeGreaterThan(t.landAt - 100)
    // The title arrives with the number, not before it.
    expect(t.title.delay).toBeGreaterThan(t.roll.delay)
  })

  it('staggers the reward column inside half a second', () => {
    const t = levelUpTimeline(1, false)
    const starts = t.column.map(c => c.delay)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    const last = t.column[t.column.length - 1]
    expect(last.delay + last.duration - t.column[0].delay).toBeLessThan(500)
  })

  it('gives a tier change its own beat only when there is one', () => {
    expect(levelUpTimeline(1, false).tier).toBeNull()
    const t = levelUpTimeline(1, true)
    expect(t.tier).not.toBeNull()
    expect(t.tier!.sweep.delay).toBeGreaterThanOrEqual(t.tier!.pop.delay)
  })

  it('never puts an overshooting curve on a fade', () => {
    // Overshoot is for things with a position. The effect curves stay inside 0–1.
    // The y values of a cubic-bezier(x1, y1, x2, y2): above 1 is overshoot.
    const y = (curve: string) => {
      const [, y1, , y2] = curve.slice(curve.indexOf('(') + 1, -1).split(',').map(Number)
      return [y1, y2]
    }
    for (const curve of [EASE.effects, EASE.entrance, EASE.decelerate, EASE.standard]) {
      for (const v of y(curve)) expect(v).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...y(EASE.spatial))).toBeGreaterThan(1)
  })
})

describe('the pictures a climb hands out', () => {
  it('lists one picture per level gained, newest last', () => {
    expect(picturesFor(1, 3)).toEqual({ shown: [2, 3], more: 0 })
    expect(picturesFor(4, 5)).toEqual({ shown: [5], more: 0 })
  })

  it('shows the newest few and counts the rest', () => {
    expect(picturesFor(1, 8)).toEqual({ shown: [5, 6, 7, 8], more: 3 })
  })

  it('has nothing to show when nothing was gained', () => {
    expect(picturesFor(3, 3)).toEqual({ shown: [], more: 0 })
  })
})

describe('a tier change', () => {
  it('is a change of tier, not of level', () => {
    expect(tierChanged(LEVELS[4], LEVELS[5])).toBe(true)   // 5 beginner → 6 mid
    expect(tierChanged(LEVELS[0], LEVELS[2])).toBe(false)  // 1 → 3, both beginner
    expect(tierChanged(LEVELS[9], LEVELS[10])).toBe(true)  // 10 mid → 11 advanced
    expect(tierChanged(LEVELS[16], LEVELS[17])).toBe(true) // 17 advanced → 18 elite
  })
})

describe('the XP lines', () => {
  it('lists each payout once, in the order it was paid', () => {
    expect(xpRows([
      { labelKey: 'xp.source.challenge', amount: 100 },
      { labelKey: 'xp.source.achievements', amount: 225 },
    ])).toEqual([
      { labelKey: 'xp.source.challenge', amount: 100 },
      { labelKey: 'xp.source.achievements', amount: 225 },
    ])
  })

  it('folds two lines with the same name into one', () => {
    // A daily and a weekly challenge in the same burst are both "Challenge".
    const rows = xpRows([
      { labelKey: 'xp.source.session', amount: 75 },
      { labelKey: 'xp.source.challenge', amount: 100 },
      { labelKey: 'xp.source.challenge', amount: 300 },
    ])
    expect(rows).toEqual([
      { labelKey: 'xp.source.session', amount: 75 },
      { labelKey: 'xp.source.challenge', amount: 400 },
    ])
  })

  it('keeps lines with different parameters apart', () => {
    const rows = xpRows([
      { labelKey: 'xp.source.weekStreak', labelParams: { n: '2' }, amount: 50 },
      { labelKey: 'xp.source.weekStreak', labelParams: { n: '3' }, amount: 50 },
    ])
    expect(rows).toHaveLength(2)
  })

  it('caps the list and still adds up to the total', () => {
    const parts = [10, 20, 30, 40, 50].map((amount, i) => ({ labelKey: `xp.source.k${i}`, amount }))
    const rows = xpRows(parts)
    expect(rows).toHaveLength(MAX_XP_ROWS)
    expect(rows[rows.length - 1]).toEqual({ labelKey: 'xp.part.other', amount: 30 })
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(150)
  })

  it('leaves out lines that paid nothing', () => {
    expect(xpRows([{ labelKey: 'xp.source.session', amount: 0 }])).toEqual([])
  })
})

describe('a level colour as a wash', () => {
  it('turns the table colour into rgba', () => {
    expect(tint('#d4a847', 0.2)).toBe('rgba(212, 168, 71, 0.2)')
  })

  it('passes anything else through untouched', () => {
    expect(tint('var(--color-gold)', 0.2)).toBe('var(--color-gold)')
  })
})

describe('a level colour as small type', () => {
  it('is the same colour, lifted toward white', () => {
    expect(ink('#9266f7')).toBe('color-mix(in oklab, #9266f7 78%, white)')
  })
})

describe('the sparks', () => {
  it('are the same every time, spread all the way round', () => {
    const a = sparks(12)
    expect(a).toEqual(sparks(12))
    expect(a).toHaveLength(12)
    const angles = a.map(s => s.angle)
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...angles)).toBeLessThan(360)
    // No two on top of each other.
    const sorted = [...angles].sort((x, y) => x - y)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(10)
    for (const s of a) {
      expect(s.distance).toBeGreaterThan(0)
      expect(s.delay).toBeGreaterThanOrEqual(0)
    }
  })
})
