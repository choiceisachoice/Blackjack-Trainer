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
  // Its own limit. This import is the whole app's module graph, transformed
  // cold for Node, and it had crept to 9.6 s against the 10 s default — one
  // more component in the landing page and the suite failed without a single
  // assertion running (14 Nov 2026). A minute is not a target, it is room.
}, 60_000)

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

  it('renders every chapter on a page of its own, with its own head', async () => {
    const routes = entry.PRERENDER_ROUTES.map(r => r.path)
    expect(routes.filter(p => p.startsWith('/learn/'))).toHaveLength(8)
    expect(routes).toContain('/strategy-chart')
    const { html, meta } = await entry.render('/learn/illustrious-18-fab-4', 'en')
    expect(html).toMatch(/<h1/)
    expect(html).toMatch(/Illustrious 18/)
    expect(html).toMatch(/data-testid="table-i18"/)
    expect(meta.title).toMatch(/Illustrious 18/)
    expect(meta.canonical).toBe('https://black-jack-training.com/learn/illustrious-18-fab-4')
    const de = await entry.render('/learn/true-count', 'de', '/de')
    expect(de.meta.canonical).toBe('https://black-jack-training.com/de/learn/true-count')
    expect(de.meta.title).toMatch(/True Count/)
  })

  it('renders the strategy chart with every cell in the HTML', async () => {
    const { html, meta } = await entry.render('/strategy-chart', 'en')
    expect(html).toMatch(/<h1/)
    // The chart is a grid of cells, not a <table>; a crawler still gets every
    // hand-versus-upcard decision as text. 10 upcards × 28 rows or more.
    expect((html.match(/data-testid="chart-cell"/g) ?? []).length).toBeGreaterThan(250)
    expect(meta.canonical).toBe('https://black-jack-training.com/strategy-chart')
  })

  it('renders the trial round’s first screen — the same for every visitor — with its own head', async () => {
    expect(entry.PRERENDER_ROUTES.map(r => r.path)).toContain('/try')
    const { html, meta } = await entry.render('/try', 'en')
    expect(html).toMatch(/<h1/)
    expect(html).toMatch(/data-testid="try-start"/)
    // No hand in the HTML: a hand dealt at build time would be swapped for
    // another one the moment the page starts.
    expect(html).not.toMatch(/data-testid="player-hand"/)
    expect(meta.title).toMatch(/basic strategy/i)
    expect(meta.canonical).toBe('https://black-jack-training.com/try')
    const de = await entry.render('/try', 'de', '/de')
    expect(de.meta.canonical).toBe('https://black-jack-training.com/de/try')
    expect(de.html).toMatch(/Basisstrategie/)
    expect(de.meta.title).not.toBe(meta.title)
  })

  it('writes every public path, and nothing else — the sitemap and the language menu read the same list', async () => {
    const { PUBLIC_PATHS } = await import('./i18n/locales')
    expect([...entry.PRERENDER_ROUTES.map(r => r.path)].sort()).toEqual([...PUBLIC_PATHS].sort())
  })

  it('links the hub to the chapters instead of repeating them', async () => {
    const { html } = await entry.render('/learn', 'en')
    expect(html).toMatch(/href="\/learn\/hi-lo-system"/)
    // The chapter paragraphs live on the chapter pages only.
    expect(html).not.toMatch(/data-testid="table-i18"/)
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
