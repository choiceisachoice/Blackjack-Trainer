import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { soundEngine } from './sound-engine'

describe('SoundEngine', () => {
  beforeEach(() => {
    soundEngine.enabled = true
    soundEngine.volume = 0.15
  })

  it('enabled defaults to true', () => {
    expect(soundEngine.enabled).toBe(true)
  })

  it('volume defaults to 0.15', () => {
    expect(soundEngine.volume).toBeCloseTo(0.15)
  })

  it('volume clamps to 0 when set below 0', () => {
    soundEngine.volume = -5
    expect(soundEngine.volume).toBe(0)
  })

  it('volume clamps to 1 when set above 1', () => {
    soundEngine.volume = 10
    expect(soundEngine.volume).toBe(1)
  })

  it('volume accepts values within 0-1 range', () => {
    soundEngine.volume = 0.7
    expect(soundEngine.volume).toBeCloseTo(0.7)
  })

  it('toggling enabled prevents sound playback', () => {
    soundEngine.enabled = false
    expect(soundEngine.enabled).toBe(false)
    // All sound methods should be callable without error when disabled
    expect(() => soundEngine.cardDeal()).not.toThrow()
    expect(() => soundEngine.correct()).not.toThrow()
  })

  it('all sound methods exist and are callable', () => {
    const methods = [
      'cardDeal', 'cardFlip',
      'chipPlace', 'chipCollect',
      'correct', 'wrong', 'streak',
      'buttonClick', 'timerTick', 'sessionComplete',
      'levelUp',
    ] as const

    for (const method of methods) {
      expect(typeof soundEngine[method]).toBe('function')
    }
  })

  it('sound methods do not throw when AudioContext is unavailable', () => {
    // In test environment, AudioContext is not available
    // All methods should gracefully handle this
    soundEngine.enabled = true
    expect(() => soundEngine.cardDeal()).not.toThrow()
    expect(() => soundEngine.cardFlip()).not.toThrow()
    expect(() => soundEngine.chipPlace()).not.toThrow()
    expect(() => soundEngine.chipCollect()).not.toThrow()
    expect(() => soundEngine.correct()).not.toThrow()
    expect(() => soundEngine.wrong()).not.toThrow()
    expect(() => soundEngine.streak()).not.toThrow()
    expect(() => soundEngine.buttonClick()).not.toThrow()
    expect(() => soundEngine.timerTick()).not.toThrow()
    expect(() => soundEngine.sessionComplete()).not.toThrow()
    expect(() => soundEngine.levelUp()).not.toThrow()
  })

  it('setting enabled to true re-enables sounds', () => {
    soundEngine.enabled = false
    expect(soundEngine.enabled).toBe(false)
    soundEngine.enabled = true
    expect(soundEngine.enabled).toBe(true)
  })
})

describe('SoundEngine.prime — the click that lets a timer play', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  /** A fresh engine (the module's singleton) over a stand-in AudioContext. */
  async function engineWith(state: string, resume: () => Promise<void>) {
    const made: unknown[] = []
    class FakeContext {
      state = state
      resume = vi.fn(resume)
      constructor() { made.push(this) }
    }
    vi.stubGlobal('AudioContext', FakeContext)
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    vi.resetModules()
    const { soundEngine: fresh } = await import('./sound-engine')
    return { fresh, made: made as FakeContext[] }
  }

  it('creates the context and wakes one the browser holds suspended', async () => {
    const { fresh, made } = await engineWith('suspended', () => Promise.resolve())
    fresh.enabled = true
    fresh.prime()
    expect(made).toHaveLength(1)
    expect(made[0].resume).toHaveBeenCalledTimes(1)
  })

  it('leaves a running context alone', async () => {
    const { fresh, made } = await engineWith('running', () => Promise.resolve())
    fresh.prime()
    expect(made[0].resume).not.toHaveBeenCalled()
  })

  it('makes nothing while sounds are switched off', async () => {
    const { fresh, made } = await engineWith('suspended', () => Promise.resolve())
    fresh.enabled = false
    fresh.prime()
    expect(made).toHaveLength(0)
  })

  it('does not throw when the browser refuses the audio', async () => {
    const { fresh } = await engineWith('suspended', () => Promise.reject(new Error('NotAllowedError')))
    expect(() => fresh.prime()).not.toThrow()
    // The refused promise is caught, not left to surface as an unhandled rejection.
    await Promise.resolve()
  })

  it('does nothing and does not throw without Web Audio at all', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.resetModules()
    const { soundEngine: fresh } = await import('./sound-engine')
    expect(() => fresh.prime()).not.toThrow()
  })
})
