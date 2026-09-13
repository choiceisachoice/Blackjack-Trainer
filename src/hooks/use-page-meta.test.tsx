import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import i18next from 'i18next'
import { applyPageMeta, pageMeta, usePageMeta, SITE_ORIGIN } from './use-page-meta'

beforeEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('pageMeta', () => {
  it('reads the landing from the keys it always had', () => {
    const m = pageMeta(i18next.t, 'landing', '/')
    expect(m.title).toMatch(/blackjack/i)
    expect(m.description.length).toBeGreaterThan(40)
    expect(m.canonical).toBe(`${SITE_ORIGIN}/`)
  })

  it('gives every other page a title of its own', () => {
    // Every route used to share the landing's title; Google listed /terms
    // under the home page's name.
    const landing = pageMeta(i18next.t, 'landing', '/').title
    for (const page of ['learn', 'login', 'account', 'terms', 'privacy', 'contact', 'app'] as const) {
      const m = pageMeta(i18next.t, page, `/${page}`)
      expect(m.title, page).not.toBe(landing)
      expect(m.title.length, page).toBeGreaterThan(8)
      expect(m.description.length, page).toBeGreaterThan(40)
    }
  })
})

describe('applyPageMeta', () => {
  const meta = { title: 'T', description: 'D', canonical: 'https://x.test/p' }

  it('creates the tags when the head has none', () => {
    applyPageMeta(document, meta)
    expect(document.title).toBe('T')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('D')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://x.test/p')
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://x.test/p')
  })

  it('updates the existing tags rather than adding a second set', () => {
    // index.html ships description, og:* and canonical already; a second
    // canonical is worse than none, because crawlers then pick one at random.
    document.head.innerHTML =
      '<meta name="description" content="old"><link rel="canonical" href="https://x.test/old"><meta property="og:title" content="old">'
    applyPageMeta(document, meta)
    applyPageMeta(document, meta)
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('D')
  })
})

describe('usePageMeta', () => {
  function Page({ page, path }: { page: 'terms' | 'landing'; path: string }) {
    usePageMeta(page, path)
    return null
  }

  it('sets the head for the page it is used on', () => {
    render(<Page page="terms" path="/terms" />)
    expect(document.title).toBe(pageMeta(i18next.t, 'terms', '/terms').title)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_ORIGIN}/terms`)
  })

  it('follows a language change', async () => {
    render(<Page page="terms" path="/terms" />)
    const english = document.title
    const { default: de } = await import('../i18n/messages/de.json')
    i18next.addResourceBundle('de', 'translation', de, true, true)
    await i18next.changeLanguage('de')
    // Give React the render the language event triggers.
    await new Promise(r => setTimeout(r, 0))
    expect(document.title).not.toBe(english)
    expect(document.title).toBe(i18next.t('meta.pages.terms.title'))
    await i18next.changeLanguage('en')
  })
})
