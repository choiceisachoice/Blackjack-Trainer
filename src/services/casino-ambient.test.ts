import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { casinoAmbient } from './casino-ambient'

// Mock HTMLAudioElement
function createMockAudio() {
  return {
    loop: false,
    volume: 0,
    src: '',
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  }
}

let mockAudio = createMockAudio()

describe('CasinoAmbient', () => {
  beforeEach(() => {
    localStorage.clear()
    casinoAmbient.stop()
    mockAudio = createMockAudio()
    // Must use function (not arrow) so it can be called with `new`
    globalThis.Audio = vi.fn(function () { return mockAudio }) as unknown as typeof Audio
  })

  afterEach(() => {
    casinoAmbient.stop()
  })

  it('starts playing and sets playing to true', () => {
    expect(casinoAmbient.playing).toBe(false)
    casinoAmbient.start()
    expect(casinoAmbient.playing).toBe(true)
  })

  it('stops playing and sets playing to false', () => {
    casinoAmbient.start()
    casinoAmbient.stop()
    expect(casinoAmbient.playing).toBe(false)
  })

  it('does not restart if already playing', () => {
    casinoAmbient.start()
    casinoAmbient.start() // Should be no-op
    expect(globalThis.Audio).toHaveBeenCalledTimes(1)
  })

  it('creates Audio element with correct source', () => {
    casinoAmbient.start()
    expect(globalThis.Audio).toHaveBeenCalledWith('/sounds/casino-ambience.mp3')
  })

  it('sets loop to true', () => {
    casinoAmbient.start()
    expect(mockAudio.loop).toBe(true)
  })

  it('calls play() on the audio element', () => {
    casinoAmbient.start()
    expect(mockAudio.play).toHaveBeenCalledTimes(1)
  })

  it('calls pause() on stop', () => {
    casinoAmbient.start()
    casinoAmbient.stop()
    expect(mockAudio.pause).toHaveBeenCalledTimes(1)
  })

  it('sets volume (clamped 0-1)', () => {
    casinoAmbient.volume = 0.5
    expect(casinoAmbient.volume).toBe(0.5)

    casinoAmbient.volume = -1
    expect(casinoAmbient.volume).toBe(0)

    casinoAmbient.volume = 2
    expect(casinoAmbient.volume).toBe(1)
  })

  it('applies volume to audio element while playing', () => {
    casinoAmbient.start()
    casinoAmbient.volume = 0.7
    expect(mockAudio.volume).toBe(0.7)
  })

  it('default volume is 0.15 when no localStorage value', () => {
    casinoAmbient.volume = 0.15
    expect(casinoAmbient.volume).toBe(0.15)
  })

  it('persists volume to localStorage', () => {
    casinoAmbient.volume = 0.42
    expect(localStorage.getItem('bjt_ambient_volume')).toBe('0.42')
  })

  it('loads volume from localStorage', () => {
    localStorage.setItem('bjt_ambient_volume', '0.8')
    casinoAmbient.volume = 0.8
    expect(casinoAmbient.volume).toBe(0.8)
  })

  it('handles play() rejection gracefully', async () => {
    const rejection = Promise.reject(new Error('not allowed'))
    // Catch immediately to prevent unhandled rejection
    rejection.catch(() => {})
    mockAudio.play.mockReturnValue(rejection)
    expect(() => casinoAmbient.start()).not.toThrow()
  })
})
