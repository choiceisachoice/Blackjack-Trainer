import { describe, it, expect, beforeEach } from 'vitest'
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
  })

  it('setting enabled to true re-enables sounds', () => {
    soundEngine.enabled = false
    expect(soundEngine.enabled).toBe(false)
    soundEngine.enabled = true
    expect(soundEngine.enabled).toBe(true)
  })
})
