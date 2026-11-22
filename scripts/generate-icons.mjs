// The home-screen icons, drawn from the favicon.
//
//   node scripts/generate-icons.mjs
//
// Reads the spade out of `public/favicon.svg` and renders it with Playwright's
// Chromium onto the app's near-black ground, so the icons follow the favicon
// and nobody has to keep four PNGs in step by hand. Run it again after the
// favicon changes and commit the result.
//
//   public/icons/icon-192.png            192  purpose "any"
//   public/icons/icon-512.png            512  purpose "any"
//   public/icons/icon-maskable-512.png   512  purpose "maskable"
//   public/apple-touch-icon.png          180  iOS home screen
//
// All four are full-bleed and opaque: Android and iOS cut their own corners,
// and iOS paints a transparent pixel black anyway. The maskable one keeps the
// spade inside the central safe zone (a circle of 80 % of the width), because
// a launcher may crop everything outside it.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKGROUND = '#070809'

/** The glyph's box inside the favicon's 32-unit viewBox (measured off the path). */
const GLYPH = { cx: 16, cy: 16.3, height: 22.6 }

/**
 * @typedef {object} Icon
 * @property {string} file   Path under `public/`
 * @property {number} size   Edge length in pixels
 * @property {number} glyph  Height of the spade as a fraction of the edge
 */
/** @type {Icon[]} */
const ICONS = [
  { file: 'icons/icon-192.png', size: 192, glyph: 0.58 },
  { file: 'icons/icon-512.png', size: 512, glyph: 0.58 },
  // 0.44 puts the spade's farthest corner at 29 % of the width from the
  // centre; the safe zone ends at 40 %.
  { file: 'icons/icon-maskable-512.png', size: 512, glyph: 0.44 },
  { file: 'apple-touch-icon.png', size: 180, glyph: 0.58 },
]

const favicon = await readFile(path.join(root, 'public/favicon.svg'), 'utf8')
const glyphPath = /<path\b[^>]*\bd="([^"]+)"[^>]*>/s.exec(favicon)
const glyphFill = /<path\b[^>]*\bfill="([^"]+)"/s.exec(favicon)
if (!glyphPath || !glyphFill) throw new Error('public/favicon.svg has no <path d="…" fill="…"> to draw the icon from')

/** @param {Icon} icon */
function svgFor(icon) {
  const scale = (icon.size * icon.glyph) / GLYPH.height
  const half = icon.size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.size}" height="${icon.size}" viewBox="0 0 ${icon.size} ${icon.size}">
  <rect width="100%" height="100%" fill="${BACKGROUND}"/>
  <g transform="translate(${half} ${half}) scale(${scale}) translate(${-GLYPH.cx} ${-GLYPH.cy})">
    <path d="${glyphPath[1]}" fill="${glyphFill[1]}"/>
  </g>
</svg>`
}

const browser = await chromium.launch()
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${BACKGROUND}">${svgFor(icon)}</body></html>`,
    )
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size } })
    const target = path.join(root, 'public', icon.file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, png)
    await page.close()
    console.log(`${icon.file}  ${icon.size}x${icon.size}  ${png.length} bytes`)
  }
} finally {
  await browser.close()
}
