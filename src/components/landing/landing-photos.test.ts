import { describe, it, expect } from 'vitest'
import { statSync } from 'node:fs'
import path from 'node:path'
import { LANDING_PHOTOS, srcSetOf, type LandingPhotoAsset } from './landing-photos'

const PHOTOS = Object.entries(LANDING_PHOTOS) as [string, LandingPhotoAsset][]

/** The file behind an imported URL (`/src/assets/…` under Vitest). */
function fileOf(url: string): string {
  return path.join(process.cwd(), url.replace(/^\//, '').replace(/\?.*$/, ''))
}

describe('LANDING_PHOTOS', () => {
  it('holds two photos — the owner asked for no more', () => {
    expect(PHOTOS).toHaveLength(2)
  })

  it.each(PHOTOS)('%s comes as AVIF and WebP at 800 and 1600 px', (_name, photo) => {
    for (const variants of [photo.avif, photo.webp]) {
      expect(variants.map(v => v.width)).toEqual([800, 1600])
    }
    for (const v of photo.avif) expect(v.url).toMatch(new RegExp(`-${v.width}\\.avif`))
    for (const v of photo.webp) expect(v.url).toMatch(new RegExp(`-${v.width}\\.webp`))
  })

  it('states the size of the largest file and keeps the shapes the layout was measured with', () => {
    expect(LANDING_PHOTOS.dealerCards.width).toBe(1600)
    expect(LANDING_PHOTOS.dealerCards.height / LANDING_PHOTOS.dealerCards.width).toBeCloseTo(2 / 3, 2)
    expect(LANDING_PHOTOS.feltHandsChips.width).toBe(1600)
    expect(LANDING_PHOTOS.feltHandsChips.height / LANDING_PHOTOS.feltHandsChips.width).toBeCloseTo(9 / 16, 3)
  })

  it.each(PHOTOS)('%s carries a placeholder small enough to inline', (_name, photo) => {
    expect(photo.placeholder).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/)
    expect(photo.placeholder.length).toBeLessThan(400)
  })

  it.each(PHOTOS)('%s stays within its weight, and its AVIF stays the smaller file', (_name, photo) => {
    // The prepared files weigh 16–128 KB. A re-export at a careless quality
    // setting would pass every other test here.
    for (const v of [...photo.avif, ...photo.webp]) {
      expect(statSync(fileOf(v.url)).size, v.url).toBeLessThan(v.width === 800 ? 60_000 : 140_000)
    }
    // AVIF is offered first because it is the smaller file; it must stay so.
    for (const [i, a] of photo.avif.entries()) {
      expect(statSync(fileOf(a.url)).size).toBeLessThan(statSync(fileOf(photo.webp[i].url)).size)
    }
  })
})

describe('srcSetOf', () => {
  it('lists each file with its width descriptor', () => {
    expect(srcSetOf([{ url: '/a.avif', width: 800 }, { url: '/b.avif', width: 1600 }])).toBe('/a.avif 800w, /b.avif 1600w')
  })
})
