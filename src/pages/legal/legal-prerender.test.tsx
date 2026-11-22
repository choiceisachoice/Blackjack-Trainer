// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { LOCALES, type Locale } from '../../i18n/locales'

/**
 * The legal pages as the build writes them.
 *
 * Runs in `node`, like `entry-prerender.test.tsx` and for the same reason:
 * that is where `scripts/prerender.mjs` renders. What a crawler and a reader
 * without JavaScript get at `/de/privacy` is this HTML — it has to be the
 * German document under a German title, with the notice in it.
 */
type Entry = typeof import('../../entry-prerender')
type Docs = typeof import('./legal-docs')
let entry: Entry
let docs: Docs

beforeAll(async () => {
  const store = new Map<string, string>()
  const g = globalThis as unknown as { localStorage?: Storage }
  g.localStorage ??= {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
  entry = await import('../../entry-prerender')
  docs = await import('./legal-docs')
  // The whole app's module graph, transformed cold for Node.
}, 60_000)

/** What React writes for a string: `&`, `<`, `>`, `"` and `'` escaped. */
const escaped = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

const prefixOf = (locale: Locale) => (locale === 'en' ? '' : `/${locale}`)

describe.each(['privacy', 'terms'] as const)('prerendered /%s', kind => {
  it.each(LOCALES)('%s: carries the document in that language, heading by heading', async locale => {
    const { html, lang } = await entry.render(`/${kind}`, locale, prefixOf(locale))
    const doc = docs.legalDoc(kind, locale)
    expect(lang).toBe(locale)
    expect(html).toContain(`>${escaped(doc.title)}</h1>`)
    for (const section of doc.sections) expect(html).toContain(`>${escaped(section.heading)}</h2>`)
  })

  it.each(LOCALES)('%s: has the translation notice exactly when it is a translation', async locale => {
    const { html } = await entry.render(`/${kind}`, locale, prefixOf(locale))
    if (locale === 'en') {
      expect(html).not.toContain('legal-translation-notice')
      return
    }
    const notice = docs.TRANSLATION_NOTICE[locale]
    expect(html).toContain('data-testid="legal-translation-notice"')
    expect(html).toContain(escaped(notice.before.trim()))
    // The link leaves the language prefix: the English page is at the root.
    expect(html).toMatch(new RegExp(`<a href="/${kind}" hrefLang="en"[^>]*>${escaped(notice.link)}</a>`, 'i'))
  })

  it('gives every language its own title, description and canonical', async () => {
    const metas = []
    for (const locale of LOCALES) {
      const { meta } = await entry.render(`/${kind}`, locale, prefixOf(locale))
      expect(meta.canonical).toBe(`https://black-jack-training.com${prefixOf(locale)}/${kind}`)
      metas.push(meta)
    }
    expect(new Set(metas.map(m => m.title)).size).toBe(LOCALES.length)
    expect(new Set(metas.map(m => m.description)).size).toBe(LOCALES.length)
  })
})
