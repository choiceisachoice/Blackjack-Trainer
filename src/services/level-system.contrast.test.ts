import { describe, it, expect } from 'vitest'
import { LEVELS } from './level-system'

/**
 * Every rung of the ladder has to be readable on every ground it appears on.
 *
 * This exists because four of them were not. Measured on the live app: level 1
 * at **3.71:1**, level 10 at 3.47, level 11 at 4.24, level 12 at 3.15 — and
 * level 1 is what a brand-new account wears in the nav bar, on every screen it
 * ever opens. They were the four darkest rungs, which is the failure mode a
 * dark theme has: dark colours disappear into it.
 *
 * The eye had signed all of them off. Only measuring found them, and only a
 * test keeps them found — a level added later, or a colour nudged for taste,
 * fails here rather than in front of a player.
 */

/** The three backgrounds a level colour is ever painted on. */
const GROUNDS = {
  page: '#070809',      // --color-casino-bg
  topBar: '#090a0c',    // --color-topbar, over the page
  card: '#14171d',      // --color-surface-2
} as const

/** WCAG AA for normal-size text. Level names are body-sized. */
const AA_NORMAL = 4.5

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance(hex: string): number {
  const f = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = channels(hex)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Straight-line distance in RGB — crude, but enough to catch two rungs collapsing. */
function separation(a: string, b: string): number {
  const [x, y] = [channels(a), channels(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

describe('the level ladder is readable', () => {
  it('every level clears AA on every ground it is painted on', () => {
    const failures = LEVELS.flatMap(l =>
      Object.entries(GROUNDS)
        .map(([where, ground]) => ({ level: l.level, where, ratio: +contrast(l.color, ground).toFixed(2) }))
        .filter(x => x.ratio < AA_NORMAL)
    )
    expect(failures).toEqual([])
  })

  /**
   * A ratchet, not a design rule.
   *
   * Contrast alone is not enough: the cheapest way to pass the test above is to
   * lighten a failing rung until it matches the one beside it, and that is
   * exactly the trap this ladder's levels 10 and 12 fell into when they were
   * first lifted — 17 and 9 units from their neighbour.
   *
   * But the floor is 12, not something tidier, because the ladder deliberately
   * runs tight gradients *within* a tier: the greys at 2→3→4, the ambers at
   * 16→17, and the ice pair 24→25, which is the closest at 12. Those are a
   * design choice and this test has no business overruling them. It only says:
   * no future change may make any pair less distinct than the tightest pair
   * already is.
   */
  it('never lets two rungs collapse into each other', () => {
    const tooClose = LEVELS.slice(1)
      .map((l, i) => ({ pair: `${LEVELS[i].level}→${l.level}`, apart: Math.round(separation(LEVELS[i].color, l.color)) }))
      .filter(x => x.apart < 12)
    expect(tooClose).toEqual([])
  })

  it('every glow is built from its own level colour', () => {
    const mismatched = LEVELS.filter(l => {
      const m = l.glowColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (!m) return true
      const [r, g, b] = channels(l.color)
      // Within rounding distance of the hex it is supposed to echo.
      return Math.abs(+m[1] - r) > 2 || Math.abs(+m[2] - g) > 2 || Math.abs(+m[3] - b) > 2
    }).map(l => l.level)
    expect(mismatched).toEqual([])
  })
})
