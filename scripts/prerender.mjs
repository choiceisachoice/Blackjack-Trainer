// Prerender the public routes into `dist` after `vite build`.
//
// Why a script and not a plugin: the pages are React components that need
// the whole app's module graph — stores, i18n, router — and the cleanest way
// to get that graph into Node is Vite's own SSR build. So: build the entry
// for Node, import it, render each route, splice the markup and the page's
// head into the client's index.html, write the file where the server will
// find it. Then throw the SSR build away.
//
// Output layout, matched by the Caddyfile at the repo root:
//   /                 -> dist/index.html          (the prerendered landing)
//   /learn            -> dist/learn/index.html
//   /learn/true-count -> dist/learn/true-count/index.html   (one per chapter)
//   /strategy-chart   -> dist/strategy-chart/index.html
//   /try              -> dist/try/index.html      (the trial round's first screen)
//   /de               -> dist/de/index.html
//   /de/learn         -> dist/de/learn/index.html
//   anything else     -> dist/shell.html          (the empty app shell, for /app etc.)

import { build } from 'vite'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const SITE = 'https://black-jack-training.com'

// Several stores read their saved preferences at import time, inside
// try/catch. A Map-backed storage is cheaper than teaching each of them
// about Node, and it keeps the render deterministic.
const store = new Map()
globalThis.localStorage ??= {
  getItem: k => store.get(k) ?? null,
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
  clear: () => store.clear(),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size },
}

/** Every language version to emit. English lives at the root, the rest under a prefix. */
const LOCALES = ['en', 'de', 'fr', 'it', 'es', 'pt', 'tr']
const prefixOf = locale => (locale === 'en' ? '' : `/${locale}`)

/**
 * The page module behind each prerendered route, as the Vite manifest names
 * it. Mirrors `src/routes/pages.ts`; a route missing here fails the build
 * rather than quietly losing its preloads.
 */
function pageModule(route) {
  if (route === '/') return 'src/pages/LandingPage.tsx'
  if (route === '/learn') return 'src/pages/LearnPublicPage.tsx'
  if (route.startsWith('/learn/')) return 'src/pages/LearnTopicPage.tsx'
  if (route === '/strategy-chart') return 'src/pages/StrategyChartPublicPage.tsx'
  if (route === '/try') return 'src/pages/TryPage.tsx'
  if (route === '/terms') return 'src/pages/legal/TermsPage.tsx'
  if (route === '/privacy') return 'src/pages/legal/PrivacyPage.tsx'
  if (route === '/contact') return 'src/pages/legal/ContactPage.tsx'
  throw new Error(`prerender: no page module known for ${route}`)
}

/**
 * `<link rel="modulepreload">` for what a page needs before `main.tsx` can
 * render it: the page's chunk, its static imports, and the language's
 * messages (every language, English too). `main.tsx` waits for exactly these
 * (`route.preload()`, `localeReady`), and without the links the browser only
 * learns of them once the entry has downloaded and run — a waterfall of
 * 0.5–1 s on a slow phone (measured 28 Nov 2026).
 *
 * Static imports only. A page's dynamic imports (the landing's Three.js
 * hero, the PDF and Word exports) load when the page asks for them, and
 * preloading them would put megabytes in front of the page on every visit.
 * Chunks the entry imports itself are already on their way and are skipped.
 */
function preloadLinks(manifest, route, locale) {
  const entry = Object.values(manifest).find(c => c.isEntry)
  if (!entry) throw new Error('prerender: the Vite manifest has no entry chunk')
  const loaded = new Set()
  const walk = (key, into) => {
    const chunk = manifest[key]
    if (!chunk || into.has(chunk.file)) return
    into.add(chunk.file)
    for (const k of chunk.imports ?? []) walk(k, into)
  }
  walk(Object.keys(manifest).find(k => manifest[k] === entry), loaded)

  const wanted = new Set()
  const page = pageModule(route)
  if (!manifest[page]) throw new Error(`prerender: ${page} is not in the Vite manifest`)
  walk(page, wanted)
  // Every language, English included: since 28 Nov 2026 English is a chunk
  // of its own too, not part of the entry, so an English page that did not
  // preload it would fetch it only after the entry had run.
  const messages = `src/i18n/messages/${locale}.json`
  if (!manifest[messages]) throw new Error(`prerender: ${messages} is not in the Vite manifest`)
  walk(messages, wanted)
  return [...wanted]
    .filter(file => !loaded.has(file))
    .map(file => `    <link rel="modulepreload" crossorigin href="/${file}">`)
    .join('\n')
}

/** The display face's preloads, which only the app shell uses (see index.html). */
const DISPLAY_FONT_PRELOAD = /^\s*<link rel="preload" href="\/fonts\/instrument-sans-[^"]+"[^>]*>\r?\n/gm

const escapeAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const escapeText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Rewrite the head of the client template for one page. */
function applyHead(template, { meta, lang, alternates }) {
  let out = template
  const swap = (re, replacement) => {
    if (!re.test(out)) throw new Error(`template lacks ${re}`)
    out = out.replace(re, replacement)
  }
  swap(/<html lang="[^"]*">/, `<html lang="${lang}">`)
  swap(/<title>[^<]*<\/title>/, `<title>${escapeText(meta.title)}</title>`)
  swap(/(<meta\s+name="description"\s+content=")[^"]*(")/s, `$1${escapeAttr(meta.description)}$2`)
  swap(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(meta.title)}$2`)
  swap(/(<meta\s+property="og:description"\s+content=")[^"]*(")/s, `$1${escapeAttr(meta.description)}$2`)
  swap(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeAttr(meta.canonical)}$2`)
  swap(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeAttr(meta.canonical)}$2`)
  // hreflang: every language version of this page, plus x-default on English.
  const links = alternates
    .map(a => `    <link rel="alternate" hreflang="${a.lang}" href="${escapeAttr(a.href)}" />`)
    .concat(`    <link rel="alternate" hreflang="x-default" href="${escapeAttr(alternates[0].href)}" />`)
    .join('\n')
  out = out.replace(/(<link rel="canonical"[^>]*>)/, `$1\n${links}`)
  return out
}

async function main() {
  const template = await readFile(path.join(root, 'dist/index.html'), 'utf8')
  if (!template.includes('<div id="root"></div>')) throw new Error('dist/index.html has no empty #root — was the client built?')
  // The empty shell survives as the fallback for the routes that are not
  // prerendered (/app, /account, /login): those must not flash the landing.
  await writeFile(path.join(root, 'dist/shell.html'), template)

  const manifestFile = path.join(root, 'dist/.vite/manifest.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  // The preloads go last in <head>, after the entry script and the
  // stylesheet: ahead of the stylesheet, two dozen of them held the
  // render-blocking CSS back on a slow line and the landing's first paint
  // came later (measured 28 Nov 2026, +0.4 s).
  const headEnd = /^\s*<\/head>$/m
  if (!headEnd.test(template)) throw new Error('dist/index.html has no </head> to put the preloads before')

  // Two inputs, one bundle: the cookie bar is rendered by the same module
  // graph as the pages, so it shares their i18next instance and comes out in
  // the language `render` just switched to.
  await build({
    root,
    logLevel: 'warn',
    build: {
      ssr: true,
      manifest: false,
      outDir: 'dist-ssr',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          'entry-prerender': 'src/entry-prerender.tsx',
          'cookie-banner-prerender': 'src/components/common/cookie-banner-prerender.tsx',
        },
      },
    },
  })
  const entry = await import(pathToFileURL(path.join(root, 'dist-ssr/entry-prerender.js')).href)
  const banner = await import(pathToFileURL(path.join(root, 'dist-ssr/cookie-banner-prerender.js')).href)

  let written = 0
  for (const { path: route } of entry.PRERENDER_ROUTES) {
    const alternates = LOCALES.map(l => ({
      lang: l,
      href: `${SITE}${prefixOf(l)}${route === '/' ? (l === 'en' ? '/' : '') : route}`,
    }))
    for (const locale of LOCALES) {
      const prefix = prefixOf(locale)
      const { html, meta, lang } = await entry.render(route, locale, prefix)
      // Rendered after the page, in the language `render` switched to, and
      // written *after* #root: the app's first render replaces everything
      // inside #root, and a replaced bar is a new paint — on a phone it came
      // out a few pixels larger and was the LCP again. Outside, CookieBanner
      // adopts this element instead. It is `fixed`, so where it sits in the
      // markup does not move it on screen.
      const bar = banner.renderCookieBannerMarkup(prefix, lang)
      const preloads = preloadLinks(manifest, route, locale)
      const page = applyHead(template, { meta, lang, alternates })
        .replace(DISPLAY_FONT_PRELOAD, '')
        .replace(headEnd, m => (preloads ? `${preloads}\n${m}` : m))
        // `data-prerendered` is how `main.tsx` tells this page from the empty
        // shell: over a page the visitor can already read it waits until it
        // can replace the markup in one commit, instead of clearing it first.
        .replace('<div id="root"></div>', () => `<div id="root" data-prerendered="${lang}">${html}</div>${bar}`)
      const rel = route === '/' ? `${prefix}/index.html` : `${prefix}${route}/index.html`
      const file = path.join(root, 'dist', rel)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, page)
      written += 1
    }
  }
  await writeFile(path.join(root, 'dist/sitemap.xml'), sitemap(entry.PRERENDER_ROUTES))
  await rm(path.join(root, 'dist-ssr'), { recursive: true, force: true })
  // The manifest has done its job; the server should not hand out the map.
  await rm(path.join(root, 'dist/.vite'), { recursive: true, force: true })
  console.log(`prerendered ${written} pages (${entry.PRERENDER_ROUTES.length} routes × ${LOCALES.length} languages) + sitemap.xml`)
}

/**
 * The sitemap, generated from the same list the pages come from, so it can
 * neither name a page that was not built nor miss one that was. Every URL
 * lists its language versions, which is the form Google asks for when a
 * site carries the same page in several languages.
 */
function sitemap(routes) {
  // The chapters, the chart and the trial round are the pages meant to rank; the hub above
  // them; the legal pages exist and that is all a crawler needs to know.
  const isContent = route => route.startsWith('/learn/') || route === '/strategy-chart' || route === '/try'
  const priority = route => (route === '/' ? '1.0' : route === '/learn' ? '0.9' : isContent(route) ? '0.8' : '0.3')
  const changefreq = route => (route === '/' ? 'weekly' : route === '/learn' || isContent(route) ? 'monthly' : 'yearly')
  const urls = []
  for (const { path: route } of routes) {
    const alternates = LOCALES.map(l => ({ lang: l, href: `${SITE}${prefixOf(l)}${route === '/' ? (l === 'en' ? '/' : '') : route}` }))
    for (const a of alternates) {
      const links = alternates.map(b => `    <xhtml:link rel="alternate" hreflang="${b.lang}" href="${b.href}" />`)
      links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${alternates[0].href}" />`)
      urls.push(`  <url>
    <loc>${a.href}</loc>
    <changefreq>${changefreq(route)}</changefreq>
    <priority>${priority(route)}</priority>
${links.join('\n')}
  </url>`)
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/prerender.mjs from the prerendered routes. Do not edit. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

main().catch(e => {
  console.error('prerender failed:', e)
  process.exit(1)
})
