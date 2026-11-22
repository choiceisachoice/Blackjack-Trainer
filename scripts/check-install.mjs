// Is the app installable? A Lighthouse-style check, without Lighthouse.
//
//   node scripts/check-install.mjs http://localhost:5173     against a running server
//   node scripts/check-install.mjs --dist                    against `dist`, served here
//
// `--dist` serves the production build with the rules of the repository's
// Caddyfile, read out of that file: the lookup order (`{path}`,
// `{path}/index.html`, `/shell.html`), the cache headers, the manifest's
// content type and the Content-Security-Policy as written — so a policy that
// would block the manifest or an icon in production blocks it here. It is an
// approximation of Caddy, not Caddy.
//
// What is checked:
//   1. the manifest answers 200 with a manifest content type and parses;
//   2. it has the fields a browser needs to offer the install;
//   3. every icon answers 200 as image/png and is the size it states;
//   4. the apple-touch-icon answers and is 180 px;
//   5. HTML entries (the shell and prerendered pages) link the manifest;
//   6. Chromium itself: `Page.getAppManifest` reports no errors,
//      `Page.getInstallabilityErrors` is read out, no CSP violation fires and
//      no service worker is registered (there is none, by decision).
//
// Exits 1 if anything fails.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv[2]
if (!arg) {
  console.error('usage: node scripts/check-install.mjs <base-url> | --dist')
  process.exit(2)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.mp3': 'audio/mpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
}

/** Serve `dist` the way the Caddyfile does. Resolves with the base URL and a close function. */
async function serveDist() {
  const dist = path.join(root, 'dist')
  const caddy = await readFile(path.join(root, 'Caddyfile'), 'utf8')
  const csp = /Content-Security-Policy "([^"]+)"/.exec(caddy)?.[1]
  if (!csp) throw new Error('no Content-Security-Policy found in the Caddyfile')
  const manifestType = /header @manifest Content-Type "([^"]+)"/.exec(caddy)?.[1]
  // Dropped for plain-http localhost only; it has no bearing on what may load from 'self'.
  const policy = csp.replace(/;\s*upgrade-insecure-requests/, '')

  const isFile = async p => { try { return (await stat(p)).isFile() } catch { return false } }
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const safe = path.normalize(pathname).replace(/^([/\\])+/, '')
    // try_files {path} {path}/index.html /shell.html
    let file = path.join(dist, safe)
    if (!file.startsWith(dist) || !(await isFile(file))) file = path.join(dist, safe, 'index.html')
    if (!(await isFile(file))) file = path.join(dist, 'shell.html')
    const headers = {
      'Content-Type': TYPES[path.extname(file)] ?? 'text/plain; charset=utf-8',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': policy,
    }
    // Only what the Caddyfile says: without its rule the type is the fallback above.
    if (pathname === '/manifest.webmanifest' && manifestType) headers['Content-Type'] = manifestType
    res.writeHead(200, headers)
    res.end(await readFile(file))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { base: `http://localhost:${server.address().port}`, close: () => server.close(), policy }
}

const served = arg === '--dist' ? await serveDist() : null
const base = (served?.base ?? arg).replace(/\/$/, '')

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); return ok }

/** Width and height out of a PNG's IHDR chunk. */
function pngSize(bytes) {
  const b = Buffer.from(bytes)
  const isPng = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  return isPng ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'not a PNG'
}

// 1 + 2: the manifest.
const res = await fetch(`${base}/manifest.webmanifest`)
const type = res.headers.get('content-type') ?? ''
check('manifest answers 200', res.status === 200, `status ${res.status}`)
check('manifest content type', /^application\/(manifest\+json|json)\b/.test(type), type || '(none)')
let manifest = null
try { manifest = JSON.parse(await res.text()) } catch (e) { check('manifest is valid JSON', false, String(e)) }
if (manifest) {
  check('manifest is valid JSON', true)
  check('name and short_name', Boolean(manifest.name && manifest.short_name), `${manifest.name} / ${manifest.short_name}`)
  check('start_url /app, scope /', manifest.start_url === '/app' && manifest.scope === '/', `${manifest.start_url} in ${manifest.scope}`)
  check('display standalone', manifest.display === 'standalone', manifest.display)
  check('background and theme colour #070809',
    manifest.background_color === '#070809' && manifest.theme_color === '#070809',
    `${manifest.background_color} / ${manifest.theme_color}`)
  const purposes = (manifest.icons ?? []).map(i => `${i.sizes} ${i.purpose ?? 'any'}`)
  check('icons 192, 512 and maskable 512',
    ['192x192 any', '512x512 any', '512x512 maskable'].every(p => purposes.includes(p)), purposes.join(', '))

  // 3: every icon.
  for (const icon of manifest.icons ?? []) {
    const r = await fetch(new URL(icon.src, `${base}/`))
    const size = r.ok ? pngSize(await r.arrayBuffer()) : '-'
    check(`icon ${icon.src}`,
      r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('image/png') && size === icon.sizes,
      `status ${r.status}, ${r.headers.get('content-type')}, ${size} (states ${icon.sizes})`)
  }
}

// 4: the apple-touch-icon.
{
  const r = await fetch(`${base}/apple-touch-icon.png`)
  const size = r.ok ? pngSize(await r.arrayBuffer()) : '-'
  check('apple-touch-icon 180', r.status === 200 && size === '180x180', `status ${r.status}, ${size}`)
}

// 5: the HTML entries.
for (const page of ['/', '/app', '/learn', '/learn/true-count', '/de', '/de/learn', '/account', '/login']) {
  const html = await (await fetch(base + page)).text()
  const tags = [
    /<link rel="manifest" href="\/manifest\.webmanifest"/.test(html),
    /<link rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/.test(html),
    /<meta name="theme-color" content="#070809"/.test(html),
    /<meta name="apple-mobile-web-app-capable" content="yes"/.test(html),
  ]
  check(`head of ${page}`, tags.every(Boolean), `manifest ${tags[0]}, touch icon ${tags[1]}, theme ${tags[2]}, ios ${tags[3]}`)
}

// 6: what Chromium makes of it.
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', e => {
      window.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`)
    })
  })
  await page.goto(`${base}/app`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  const cdp = await page.context().newCDPSession(page)
  const app = await cdp.send('Page.getAppManifest')
  check('Chromium finds and parses the manifest', Boolean(app.url) && app.errors.length === 0,
    app.url ? `${app.url}${app.errors.length ? ' — ' + app.errors.map(e => e.message).join('; ') : ''}` : 'no manifest found')
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  const ids = installabilityErrors.map(e => e.errorId)
  check('Chromium installability errors', ids.length === 0, ids.length ? ids.join(', ') : 'none')
  const violations = await page.evaluate(() => window.__cspViolations)
  check('no Content-Security-Policy violation', violations.length === 0, violations.join('; ') || (served ? 'policy from the Caddyfile enforced' : 'server sends no policy'))
  const workers = await page.evaluate(async () =>
    'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0)
  check('no service worker registered', workers === 0, `${workers} registration(s)`)
} finally {
  await browser.close()
  served?.close()
}

console.log(`\nInstall check against ${base}${served ? ' (dist, Caddyfile rules)' : ''}\n`)
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? `  —  ${r.detail}` : ''}`)
const failed = results.filter(r => !r.ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
