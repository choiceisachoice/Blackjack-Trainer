import { describe, it, expect } from 'vitest'
import { paintFilm } from './paint-film'
import { DURATION } from './deck-film'

/**
 * Recording stand-in for a 2D context.
 *
 * jsdom has no canvas, and installing one would be a second rendering engine
 * that agrees with no real browser anyway. What is worth asserting here is not
 * the pixels — it is that the *instructions* are a pure function of `t`. If the
 * same moment ever produced a different call sequence, the film would no longer
 * be seekable and no amount of scrubbing would show the truth.
 */
function recorder() {
  const log: string[] = []
  const gradient = {
    addColorStop: (o: number, c: string) => log.push(`stop ${o.toFixed(3)} ${c}`),
  }
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...a: number[]) => {
          log.push(`${prop}(${a.map(n => n.toFixed(2)).join(',')})`)
          return gradient
        }
      }
      if (prop in target) return target[prop]
      return (...a: unknown[]) => {
        log.push(`${prop}(${a.map(v => (typeof v === 'number' ? v.toFixed(3) : String(v))).join(',')})`)
      }
    },
    set(target, prop: string, value) {
      log.push(`${prop}=${typeof value === 'number' ? value.toFixed(3) : String(value)}`)
      target[prop] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log }
}

const frameAt = (t: number) => {
  const { ctx, log } = recorder()
  paintFilm(ctx, t)
  return log
}

describe('paintFilm', () => {
  it('draws the identical frame for the identical moment', () => {
    for (const t of [0, 2400, 5800, 8600, 11900]) {
      expect(frameAt(t)).toEqual(frameAt(t))
    }
  })

  it('draws a different frame for a different moment', () => {
    // The complement of the test above, and the one that would catch a frame
    // accidentally hard-coded or cached.
    expect(frameAt(2400)).not.toEqual(frameAt(5800))
  })

  it('never leaves the composite mode set to lighter', () => {
    // The trails are drawn additively. Leaving that mode on would make every
    // later draw — including the vignette — glow instead of cover.
    for (const t of [1500, 3000, 6000, 9000]) {
      const modes = frameAt(t).filter(l => l.startsWith('globalCompositeOperation='))
      if (modes.length === 0) continue
      expect(modes.at(-1)).toBe('globalCompositeOperation=source-over')
    }
  })

  it('balances every save with a restore', () => {
    // An unbalanced save leaks a transform into the next frame, which is the
    // classic canvas bug: it looks fine once and drifts on every repaint.
    for (const t of [1800, 4600, 7800, 10600]) {
      const log = frameAt(t)
      const saves = log.filter(l => l.startsWith('save(')).length
      const restores = log.filter(l => l.startsWith('restore(')).length
      expect(saves).toBe(restores)
    }
  })

  it('clears before it paints, so nothing survives from the last frame', () => {
    const log = frameAt(6200)
    expect(log[0]).toMatch(/^clearRect/)
  })

  it('paints something at every moment of the piece', () => {
    for (let t = 0; t <= DURATION; t += 400) {
      expect(frameAt(t).length).toBeGreaterThan(10)
    }
  })

  it('emits no NaN coordinates anywhere in the timeline', () => {
    for (let t = 0; t <= DURATION; t += 173) {
      const bad = frameAt(t).filter(l => l.includes('NaN') || l.includes('Infinity'))
      expect(bad).toEqual([])
    }
  })
})
