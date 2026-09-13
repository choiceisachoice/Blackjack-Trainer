// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * Runs in the `node` environment on purpose — no window, no document, no
 * localStorage — because that is what the build script has. A test under
 * jsdom would pass while the real prerender crashed on the first module
 * that touches the browser at import time.
 */
type Entry = typeof import('./entry-prerender')
let entry: Entry

beforeAll(async () => {
  // The one shim the build script also provides: several stores read their
  // saved preferences at import time, inside try/catch, and a Map-backed
  // storage is cheaper than teaching every one of them about Node.
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
  entry = await import('./entry-prerender')
})

describe('prerender entry', () => {
  it('renders the landing with its content in the HTML, not at opacity zero', async () => {
    const { html, meta } = await entry.render('/', 'en')
    expect(html).toMatch(/<h1/)
    expect(html).toMatch(/Hi-Lo/)
    expect(html).not.toMatch(/opacity:\s*0/)
    expect(meta.canonical).toBe('https://black-jack-training.com/')
  })

  it('renders the theory with every topic expanded', async () => {
    const { html, meta } = await entry.render('/learn', 'en')
    expect(html).toMatch(/Illustrious 18/)
    expect(html).toMatch(/true count/i)
    expect((html.match(/aria-expanded="true"/g) ?? []).length).toBe(8)
    expect(meta.title).toMatch(/learn/i)
  })

  it('renders the legal pages', async () => {
    for (const path of ['/terms', '/privacy', '/contact']) {
      const { html } = await entry.render(path, 'en')
      expect(html, path).toMatch(/<h1/)
    }
  })

  it('renders a language version in that language, under its prefix', async () => {
    const { html, meta, lang } = await entry.render('/learn', 'de', '/de')
    expect(lang).toBe('de')
    expect(html).toMatch(/Kartenzählen|Lernen/)
    expect(meta.canonical).toBe('https://black-jack-training.com/de/learn')
    const home = await entry.render('/', 'de', '/de')
    expect(home.meta.canonical).toBe('https://black-jack-training.com/de')
  })

  it('refuses a route that is not public', async () => {
    await expect(entry.render('/app', 'en')).rejects.toThrow()
  })
})
