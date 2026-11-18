import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

/**
 * A card shown for 600 ms must not arrive as a white rectangle that fills in
 * later (audit, 18 Nov 2026: the Speed Drill's queen was a blank card).
 */
describe('preloadCardImages', () => {
  it('asks for all 52 faces, once', async () => {
    const asked: string[] = []
    vi.stubGlobal('Image', class { decoding = ''; set src(v: string) { asked.push(v) } })
    const { preloadCardImages, cardImageUrl } = await import('./card-suits')
    preloadCardImages()
    preloadCardImages()
    expect(asked).toHaveLength(52)
    expect(new Set(asked).size).toBe(52)
    expect(asked).toContain(cardImageUrl('Q', 'Spades'))
    expect(asked).toContain(cardImageUrl('10', 'Hearts'))
  })
})
