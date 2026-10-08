import { describe, it, expect } from 'vitest'
import { SOCIAL_LINKS } from './social-links'

/** The channel list itself: every entry a distinct, secure account page. */
describe('SOCIAL_LINKS', () => {
  it('points every channel at an https page of its own', () => {
    for (const s of SOCIAL_LINKS) expect(new URL(s.href).protocol).toBe('https:')
    expect(new Set(SOCIAL_LINKS.map((s) => s.href)).size).toBe(SOCIAL_LINKS.length)
    expect(new Set(SOCIAL_LINKS.map((s) => s.network)).size).toBe(SOCIAL_LINKS.length)
  })

  it('keeps each link on its own platform', () => {
    const host = (network: string) => new URL(SOCIAL_LINKS.find((s) => s.network === network)!.href).hostname
    expect(host('YouTube')).toBe('www.youtube.com')
    expect(host('X')).toBe('x.com')
    expect(host('Instagram')).toBe('www.instagram.com')
    expect(host('Facebook')).toBe('www.facebook.com')
  })
})
