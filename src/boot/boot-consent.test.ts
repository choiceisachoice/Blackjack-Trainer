import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONSENT_KEY, getConsent } from '../services/analytics/consent-choice'

/**
 * `public/boot.js` and the prerendered cookie bar (28 Nov 2026): the bar is in
 * every public page's HTML, and the script hides it before the first paint for
 * a visitor with nothing to answer, and answers its buttons until the app has
 * mounted.
 */
describe('public/boot.js — the prerendered cookie bar', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/boot.js'), 'utf8')
  const html = document.documentElement

  function run(nav: Partial<Navigator> & { globalPrivacyControl?: boolean } = {}) {
    window.history.replaceState({}, '', '/de/learn')
    html.lang = 'de'
    new Function('document', 'location', 'localStorage', 'navigator', 'setTimeout', source)(
      document, window.location, localStorage, { language: 'de-DE', ...nav }, () => 0,
    )
    return html.getAttribute('data-consent')
  }

  function bar() {
    document.body.innerHTML = `<div id="root" data-prerendered="de"><div data-testid="cookie-banner" data-boot-banner="">
      <button data-testid="cookie-decline">Ablehnen</button><button data-testid="cookie-accept">Akzeptieren</button></div></div>`
  }

  beforeEach(() => {
    localStorage.clear()
    html.removeAttribute('data-consent')
    document.body.innerHTML = ''
  })

  it('keeps the bar for a visitor who has not answered', () => {
    expect(run()).toBeNull()
  })

  it('hides it for a stored answer, either one, on a prefixed page too', () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    expect(run()).toBe('skip')
    html.removeAttribute('data-consent')
    localStorage.setItem(CONSENT_KEY, 'declined')
    expect(run()).toBe('skip')
  })

  it('hides it where CookieBanner stays away: Global Privacy Control and Do Not Track', () => {
    expect(run({ globalPrivacyControl: true })).toBe('skip')
    html.removeAttribute('data-consent')
    expect(run({ doNotTrack: '1' })).toBe('skip')
  })

  it('answers the prerendered buttons the way setConsent does, before the app is there', () => {
    run()
    bar()
    localStorage.setItem('bjt_visitor_id', 'v1')
    document.querySelector<HTMLButtonElement>('[data-testid="cookie-decline"]')!.click()
    expect(getConsent()).toBe('declined')
    expect(localStorage.getItem('bjt_visitor_id')).toBeNull()
    expect(html.getAttribute('data-consent')).toBe('skip')
  })

  it('stores a yes from the accept button', () => {
    run()
    bar()
    document.querySelector<HTMLButtonElement>('[data-testid="cookie-accept"]')!.click()
    expect(getConsent()).toBe('accepted')
  })

  it('leaves the live bar to React: only the prerendered copy is answered here', () => {
    run()
    document.body.innerHTML = '<div data-testid="cookie-banner"><button data-testid="cookie-accept">Accept</button></div>'
    document.querySelector<HTMLButtonElement>('[data-testid="cookie-accept"]')!.click()
    expect(getConsent()).toBeNull()
  })
})
