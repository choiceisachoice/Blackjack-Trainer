import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TABLE_SOUNDS, pickTake, sampleGain, sampleUrl, tableSamples, type TableSound } from './table-samples'

const SOUNDS = Object.keys(TABLE_SOUNDS) as TableSound[]

describe('table samples', () => {
  it('every take that is listed exists as a file, and the licence is beside them', () => {
    for (const sound of SOUNDS) {
      for (let take = 0; take < TABLE_SOUNDS[sound].takes; take++) {
        expect(existsSync(resolve('public' + sampleUrl(sound, take))), sampleUrl(sound, take)).toBe(true)
      }
    }
    expect(existsSync(resolve('public/sounds/table/LICENSE-kenney-casino-audio.txt'))).toBe(true)
  })

  it('never plays the same take twice in a row', () => {
    for (const takes of [2, 3, 4]) {
      for (let last = 0; last < takes; last++) {
        for (const random of [0, 0.2, 0.5, 0.8, 0.999]) {
          const next = pickTake(takes, last, random)
          expect(next, `${takes} takes, last ${last}, r ${random}`).not.toBe(last)
          expect(next).toBeGreaterThanOrEqual(0)
          expect(next).toBeLessThan(takes)
        }
      }
    }
  })

  it('reaches every other take, so the rotation is not a two-step', () => {
    const reached = new Set([0, 0.34, 0.67, 0.999].map(r => pickTake(4, 0, r)))
    expect([...reached].sort()).toEqual([1, 2, 3])
  })

  it('a single take is that take, and the first play may be any', () => {
    expect(pickTake(1, 0, 0.9)).toBe(0)
    expect(pickTake(4, -1, 0)).toBe(0)
    expect(pickTake(4, -1, 0.999)).toBe(3)
  })

  it('is audible at the default master volume and never clips at the top', () => {
    for (const sound of SOUNDS) {
      expect(sampleGain(sound, 0.15)).toBeGreaterThan(0.2)
      expect(sampleGain(sound, 1)).toBeLessThanOrEqual(1)
      expect(sampleGain(sound, 0)).toBe(0)
    }
  })

  it('reports that nothing played while no recording is loaded, so the caller falls back', () => {
    expect(tableSamples.play({} as AudioContext, 'deal', 0.15)).toBe(false)
  })
})
