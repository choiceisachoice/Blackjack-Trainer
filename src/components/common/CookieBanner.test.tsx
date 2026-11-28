import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ configured: true }))
vi.mock('../../services/supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  supabase: null,
}))

import { CookieBanner, CookieSettingsLink } from './CookieBanner'
import { getConsent, setConsent } from '../../services/analytics/consent-choice'
import { clearLocalAppData } from '../../services/storage/local-reset'

const show = () => render(<MemoryRouter><CookieBanner /><CookieSettingsLink /></MemoryRouter>)

beforeEach(() => { state.configured = true; localStorage.clear() })
afterEach(cleanup)

/**
 * The cookie question (Darius, 18 Nov 2026): accept or decline, asked once.
 */
describe('CookieBanner', () => {
  it('asks a visitor who has not answered, with both answers side by side', () => {
    show()
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument()
    expect(screen.getByTestId('cookie-accept')).toHaveTextContent('Accept')
    expect(screen.getByTestId('cookie-decline')).toHaveTextContent('Decline')
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/privacy')
  })

  it('goes away on Accept and remembers the yes', () => {
    show()
    fireEvent.click(screen.getByTestId('cookie-accept'))
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(getConsent()).toBe('accepted')
  })

  it('goes away on Decline and remembers the no', () => {
    show()
    fireEvent.click(screen.getByTestId('cookie-decline'))
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(getConsent()).toBe('declined')
  })

  it('does not come back for someone who has already answered', () => {
    setConsent('accepted')
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    cleanup()
    setConsent('declined')
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
  })

  it('does not come back after signing out: the answer belongs to the device', () => {
    setConsent('accepted')
    clearLocalAppData()
    expect(getConsent()).toBe('accepted')
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
  })

  it('is asked again from "Cookie settings"', () => {
    setConsent('accepted')
    show()
    act(() => { fireEvent.click(screen.getByTestId('cookie-settings')) })
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument()
    expect(getConsent()).toBeNull()
  })

  it('is not shown, and offers no settings, where nothing is counted', () => {
    state.configured = false
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(screen.queryByTestId('cookie-settings')).toBeNull()
  })
})

/**
 * The prerendered bar is replaced by the live one when the app mounts. Same
 * markup, same size: then the swap is not a new largest paint and does not
 * move anything (28 Nov 2026, LCP).
 */
describe('CookieBanner and its prerendered copy', () => {
  it('render the same bar, the copy only adding its marker', async () => {
    const { renderCookieBannerMarkup } = await import('./cookie-banner-prerender')
    const { container } = show()
    const live = container.querySelector('[data-testid="cookie-banner"]')!.outerHTML
    expect(renderCookieBannerMarkup().replace(' data-boot-banner="en"', '')).toBe(live)
  })
})

/**
 * The prerendered bar sits beside `#root` and is adopted, not replaced: a
 * replaced bar is a new paint and became the LCP on phones (28 Nov 2026).
 */
describe('CookieBanner over a prerendered bar', () => {
  async function prerendered(lang = 'en') {
    const { renderCookieBannerMarkup } = await import('./cookie-banner-prerender')
    const holder = document.createElement('div')
    holder.innerHTML = renderCookieBannerMarkup('', lang)
    const el = holder.firstElementChild as HTMLElement
    document.body.appendChild(el)
    return el
  }
  afterEach(() => { document.querySelectorAll('body > [data-testid="cookie-banner"]').forEach(e => e.remove()) })

  it('takes the element over instead of drawing a second bar', async () => {
    const el = await prerendered()
    show()
    expect(screen.getAllByTestId('cookie-banner')).toHaveLength(1)
    expect(el.isConnected).toBe(true)
    expect(el.hasAttribute('data-boot-banner')).toBe(false)
    expect(el.style.display).toBe('')
  })

  it('answers its buttons and hides it', async () => {
    const el = await prerendered()
    show()
    fireEvent.click(el.querySelector('[data-testid="cookie-decline"]')!)
    expect(getConsent()).toBe('declined')
    expect(el.style.display).toBe('none')
  })

  it('brings it back from "Cookie settings"', async () => {
    const el = await prerendered()
    show()
    fireEvent.click(el.querySelector('[data-testid="cookie-accept"]')!)
    expect(el.style.display).toBe('none')
    fireEvent.click(screen.getByTestId('cookie-settings'))
    expect(el.style.display).toBe('')
  })

  it('keeps it hidden for a visitor who answered before', async () => {
    setConsent('accepted')
    const el = await prerendered()
    show()
    expect(el.style.display).toBe('none')
  })

  it('replaces a bar in another language with its own', async () => {
    const el = await prerendered('de')
    show()
    expect(el.isConnected).toBe(false)
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument()
    expect(screen.getByTestId('cookie-accept')).toHaveTextContent('Accept')
  })
})
