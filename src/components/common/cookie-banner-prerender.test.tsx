import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ configured: true }))
vi.mock('../../services/supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  supabase: null,
}))

import { renderCookieBannerMarkup } from './cookie-banner-prerender'

beforeEach(() => { state.configured = true })

/** The prerendered copy of the cookie bar (28 Nov 2026, LCP). */
describe('renderCookieBannerMarkup', () => {
  it('writes the bar with the marker boot.js hides it by, and both answers', () => {
    const html = renderCookieBannerMarkup()
    expect(html).toContain('data-testid="cookie-banner"')
    expect(html).toContain('data-boot-banner="en"')
    expect(html).toContain('data-testid="cookie-accept"')
    expect(html).toContain('data-testid="cookie-decline"')
    expect(html).toContain('href="/privacy"')
  })

  it('keeps the privacy link under the language prefix', () => {
    const de = renderCookieBannerMarkup('/de', 'de')
    expect(de).toContain('href="/de/privacy"')
    expect(de).toContain('data-boot-banner="de"')
  })

  it('writes nothing in a build that asks no one', () => {
    state.configured = false
    expect(renderCookieBannerMarkup()).toBe('')
  })
})
