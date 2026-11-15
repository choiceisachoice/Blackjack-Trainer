import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BET_RAMP, rampStepIndex, rampUnits } from './bet-ramp'
import en from '../../i18n/messages/en.json'

describe('the bet ramp', () => {
  it('stays at one unit until the edge exists — +1 is about even', () => {
    for (const tc of [-6, -1, 0, 1, 1.5, 1.99]) expect(rampUnits(tc), String(tc)).toBe(1)
  })

  it('doubles with each point from +2 and tops out at sixteen', () => {
    expect(rampUnits(2)).toBe(2)
    expect(rampUnits(3)).toBe(4)
    expect(rampUnits(4)).toBe(8)
    expect(rampUnits(5)).toBe(16)
    expect(rampUnits(11)).toBe(16)
  })

  it('floors a fractional count rather than rounding it up', () => {
    expect(rampUnits(2.5)).toBe(2)
    expect(rampUnits(3.9)).toBe(4)
    expect(rampUnits(4.99)).toBe(8)
  })

  it('covers every true count with exactly one step, in order', () => {
    for (let tc = -10; tc <= 12; tc++) {
      const hits = BET_RAMP.filter(s => tc >= s.minTC && tc <= s.maxTC)
      expect(hits, String(tc)).toHaveLength(1)
    }
    const units = BET_RAMP.map(s => s.units)
    expect(units).toEqual([...units].sort((a, b) => a - b))
    expect(new Set(units).size).toBe(units.length)
    expect(rampStepIndex(-3)).toBe(0)
    expect(rampStepIndex(7)).toBe(BET_RAMP.length - 1)
  })

  it('is the ramp the Learn chapter teaches', () => {
    // The chapter is the reference a learner reads. If one of the two
    // changes, this fails until the other follows.
    const learn = JSON.stringify(en)
    expect(learn).toMatch(/one unit at a true count of <g>\+1 or below<\/g>, two units at <g>\+2<\/g>, four at <g>\+3<\/g>, eight at <g>\+4<\/g>/)
  })

  it('is the only ramp in the source', () => {
    // The drill and the table each carried a copy, and the copies were the
    // ones that disagreed with the chapter.
    for (const file of ['src/engine/casino-session/session-engine.ts', 'src/components/training/bet-spread-math.ts', 'src/components/training/BetSpread.tsx']) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/multiplier:\s*12|:\s*12,\s*\/\/ TC|\[1, 2, 4, 8, 12, 16\]/)
    }
  })
})
