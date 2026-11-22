import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

/**
 * The home-screen install, checked as files.
 *
 * No service worker by decision — so the manifest, its icons and the tags in
 * the HTML are all there is, and each of them fails silently when wrong: a
 * browser simply does not offer the install.
 */

const root = process.cwd()
const pub = (file: string) => path.join(root, 'public', file.replace(/^\//, ''))

interface ManifestIcon { src: string; sizes: string; type: string; purpose?: string }
interface Manifest {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  background_color: string
  theme_color: string
  icons: ManifestIcon[]
}

const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8')) as Manifest
const html = readFileSync(path.join(root, 'index.html'), 'utf8')

/** Width and height out of a PNG's IHDR chunk. */
function pngHeader(file: string) {
  const bytes = readFileSync(file)
  return {
    isPng: bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
      && bytes.subarray(12, 16).toString('latin1') === 'IHDR',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

describe('manifest.webmanifest', () => {
  it('names the app', () => {
    expect(manifest.name.length).toBeGreaterThan(0)
    // Launchers cut a home-screen label at about twelve characters.
    expect(manifest.short_name.length).toBeGreaterThan(0)
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('opens the trainer in its own window', () => {
    expect(manifest.start_url).toBe('/app')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
  })

  it('starts on the near-black of the app, so the splash does not flash', () => {
    expect(manifest.background_color).toBe('#070809')
    expect(manifest.theme_color).toBe('#070809')
  })

  it('has a 192, a 512 and a maskable 512 icon', () => {
    const has = (sizes: string, purpose: string) =>
      manifest.icons.some(i => i.sizes === sizes && (i.purpose ?? 'any').split(' ').includes(purpose))
    expect(has('192x192', 'any')).toBe(true)
    expect(has('512x512', 'any')).toBe(true)
    expect(has('512x512', 'maskable')).toBe(true)
  })

  it.each(manifest.icons)('icon $src is a PNG of the size it states', icon => {
    expect(icon.type).toBe('image/png')
    expect(icon.src.startsWith('/')).toBe(true)
    expect(existsSync(pub(icon.src))).toBe(true)
    const png = pngHeader(pub(icon.src))
    expect(png.isPng).toBe(true)
    expect(`${png.width}x${png.height}`).toBe(icon.sizes)
  })
})

describe('the apple-touch-icon', () => {
  it('is a 180 px PNG', () => {
    const png = pngHeader(pub('apple-touch-icon.png'))
    expect(png.isPng).toBe(true)
    expect([png.width, png.height]).toEqual([180, 180])
  })
})

describe('index.html — the template every prerendered page is cut from', () => {
  it('links the manifest', () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"\s*\/>/)
  })

  it('links the apple-touch-icon', () => {
    expect(html).toMatch(/<link rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/)
  })

  it('states the theme colour the manifest states', () => {
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`)
  })

  it('asks iOS for standalone mode', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="[^"]+" \/>/)
  })

  it('registers no service worker', () => {
    expect(html).not.toMatch(/serviceWorker/)
  })
})

describe('the Caddyfile', () => {
  const caddy = readFileSync(path.join(root, 'Caddyfile'), 'utf8')

  it('allows the manifest and the icons under the enforced policy', () => {
    expect(caddy).toMatch(/Content-Security-Policy "[^"]*manifest-src 'self'/)
    expect(caddy).toMatch(/Content-Security-Policy "[^"]*img-src 'self'/)
  })

  it('serves the manifest with its registered type', () => {
    expect(caddy).toContain('header @manifest Content-Type "application/manifest+json"')
  })
})
