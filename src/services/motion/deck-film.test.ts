import { describe, it, expect } from 'vitest'
import { cardAt, faceOf, filmState, CARD_COUNT, DURATION, HERO_INDEX, STAGE_W, STAGE_H } from './deck-film'

/**
 * "Bloom" is a function, and these are the properties that make it one.
 *
 * Determinism is not a nicety: if the frame at 6,342 ms depended on how it was
 * reached — a `Math.random()` seeded at mount, a value accumulated across
 * frames — the piece could not be scrubbed and two people looking at the same
 * timestamp would be looking at different frames.
 */
describe('faceOf', () => {
  it('never puts two reds next to each other in the ring', () => {
    // The whole reason the rosette reads as a rhythm rather than as four solid
    // quadrants. Losing this would not throw; it would just look worse.
    for (let i = 0; i < CARD_COUNT; i++) {
      const a = faceOf(i)
      const b = faceOf((i + 1) % CARD_COUNT)
      expect(a.red).not.toBe(b.red)
    }
  })

  it('deals a complete deck — 52 distinct rank/suit pairs', () => {
    const seen = new Set(Array.from({ length: CARD_COUNT }, (_, i) => {
      const f = faceOf(i)
      return `${f.rank}${f.suit}`
    }))
    expect(seen.size).toBe(CARD_COUNT)
  })

  it('opens on the ace of spades', () => {
    expect(faceOf(HERO_INDEX)).toMatchObject({ rank: 'A', suit: '♠', red: false })
  })
})

describe('cardAt', () => {
  it('returns the same state for the same (card, time), every time', () => {
    for (const [i, t] of [[3, 1800], [31, 4600], [51, 9200]] as const) {
      const first = cardAt(i, t)
      for (let n = 0; n < 4; n++) expect(cardAt(i, t)).toEqual(first)
    }
  })

  it('opens on one card and nothing else', () => {
    expect(cardAt(HERO_INDEX, 300)).not.toBeNull()
    for (let i = 1; i < CARD_COUNT; i++) expect(cardAt(i, 300)).toBeNull()
  })

  it('has the whole deck out by the time the ring turns', () => {
    for (let i = 0; i < CARD_COUNT; i++) expect(cardAt(i, 3400)).not.toBeNull()
  })

  it('opens the bloom outward from the centre', () => {
    const spread = (t: number) => {
      const d: number[] = []
      for (let i = 0; i < CARD_COUNT; i++) {
        const c = cardAt(i, t)
        if (c) d.push(Math.hypot(c.x - STAGE_W / 2, c.y - STAGE_H * 0.455))
      }
      return d.reduce((a, b) => a + b, 0) / Math.max(d.length, 1)
    }
    expect(spread(3400)).toBeGreaterThan(spread(1200) * 3)
  })

  it('closes the fan back to a stack', () => {
    const width = (t: number) => {
      const xs: number[] = []
      for (let i = 0; i < CARD_COUNT; i++) {
        const c = cardAt(i, t)
        if (c) xs.push(c.x)
      }
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(width(7600)).toBeGreaterThan(500)
    expect(width(10200)).toBeLessThan(90)
  })

  it('gives the last frame back to the card it started with', () => {
    const hero = cardAt(HERO_INDEX, DURATION)!
    expect(hero.scale).toBeGreaterThan(2)
    expect(hero.alpha).toBeGreaterThan(0.9)
    for (let i = 1; i < CARD_COUNT; i++) {
      expect(cardAt(i, DURATION)!.alpha).toBeLessThan(hero.alpha * 0.35)
    }
  })

  it('never places a card at a non-finite coordinate', () => {
    for (let t = 0; t <= DURATION; t += 113) {
      for (let i = 0; i < CARD_COUNT; i += 3) {
        const c = cardAt(i, t)
        if (!c) continue
        expect(Number.isFinite(c.x)).toBe(true)
        expect(Number.isFinite(c.y)).toBe(true)
        expect(Number.isFinite(c.rot)).toBe(true)
        expect(c.scale).toBeGreaterThan(0)
        expect(c.alpha).toBeGreaterThanOrEqual(0)
        expect(c.alpha).toBeLessThanOrEqual(1)
      }
    }
  })

  it('keeps every card inside the frame', () => {
    for (let t = 0; t <= DURATION; t += 97) {
      for (let i = 0; i < CARD_COUNT; i += 5) {
        const c = cardAt(i, t)
        if (!c) continue
        expect(c.x).toBeGreaterThan(-60)
        expect(c.x).toBeLessThan(STAGE_W + 60)
        expect(c.y).toBeGreaterThan(-60)
        expect(c.y).toBeLessThan(STAGE_H + 60)
      }
    }
  })
})

describe('filmState', () => {
  it('lays the table before anything is dealt onto it', () => {
    expect(filmState(0).table).toBe(0)
    expect(filmState(900).table).toBe(1)
  })

  it('holds the title back until the card is up', () => {
    expect(filmState(9000).title).toBe(0)
    expect(filmState(DURATION).title).toBe(1)
  })

  it('turns the ring only after the deck is complete', () => {
    expect(filmState(3400).spin).toBe(0)
    expect(filmState(DURATION).spin).toBeGreaterThan(0.5)
  })
})
