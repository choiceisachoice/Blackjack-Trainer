import { describe, it, expect } from 'vitest'
import { LEVELS } from './level-system'
import {
  levelPalette,
  darkenToContrast,
  contrastRatio,
  LIGHT_SURFACE,
  AA_NORMAL,
} from './level-palette'

/** Parse `#rrggbb` for assertions. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

describe('levelPalette', () => {
  it('leaves the dark theme untouched — the ladder was designed for it', () => {
    for (const level of LEVELS) {
      expect(levelPalette(level, 'dark')).toBe(level)
    }
  })

  /**
   * The point of the whole module. Measured before the fix: level 23 rendered
   * at 1.05:1 on the light surface, level 22 at 1.10, level 25 at 1.12 — nine
   * levels below 2:1. This walks the entire table, so a level added later
   * cannot reintroduce it unnoticed.
   */
  it('every level clears AA on the light surface', () => {
    const failures = LEVELS
      .map(level => ({
        level: level.level,
        ratio: contrastRatio(rgb(levelPalette(level, 'light').color), LIGHT_SURFACE),
      }))
      .filter(x => x.ratio < AA_NORMAL)
    expect(failures).toEqual([])
  })

  it('keeps the hue — gold stays gold, diamond stays diamond', () => {
    // Level 21 is pure gold (#ffd700): red highest, blue absent. Darkening may
    // not reorder the channels, or the tier stops reading as its metal.
    const gold = rgb(levelPalette(LEVELS[20], 'light').color)
    expect(LEVELS[20].level).toBe(21)
    expect(gold[0]).toBeGreaterThan(gold[1])
    expect(gold[1]).toBeGreaterThan(gold[2])

    // Level 25 is diamond (#b9f2ff): blue highest, red lowest.
    const diamond = rgb(levelPalette(LEVELS[24], 'light').color)
    expect(LEVELS[24].level).toBe(25)
    expect(diamond[2]).toBeGreaterThan(diamond[1])
    expect(diamond[1]).toBeGreaterThan(diamond[0])
  })

  it('changes a colour no more than the requirement demands', () => {
    // A colour that already clears is returned untouched, not darkened anyway.
    const alreadyDark = '#1a1a1a'
    expect(darkenToContrast(alreadyDark)).toBe(alreadyDark)
  })

  it('rebuilds the glow from the darkened colour, not the original', () => {
    const lit = levelPalette(LEVELS[24], 'light')
    const [r, g, b] = rgb(lit.color)
    expect(lit.glowColor).toBe(`rgba(${r},${g},${b},0.28)`)
    expect(lit.glowColor).not.toBe(LEVELS[24].glowColor)
  })
})
