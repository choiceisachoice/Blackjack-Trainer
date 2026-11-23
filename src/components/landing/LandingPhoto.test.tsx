import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LandingPhoto } from './LandingPhoto'
import { LANDING_PHOTOS, srcSetOf } from './landing-photos'

afterEach(cleanup)

const sizes = '(min-width: 768px) 225px, calc(100vw - 136px)'

describe('LandingPhoto', () => {
  it('offers AVIF first, then WebP, each at both widths with the same sizes', () => {
    const { container } = render(<LandingPhoto photo={LANDING_PHOTOS.dealerCards} alt="A dealer" sizes={sizes} />)
    const sources = [...container.querySelectorAll('picture > source')]
    expect(sources.map(s => s.getAttribute('type'))).toEqual(['image/avif', 'image/webp'])
    expect(sources[0].getAttribute('srcset')).toBe(srcSetOf(LANDING_PHOTOS.dealerCards.avif))
    expect(sources[1].getAttribute('srcset')).toBe(srcSetOf(LANDING_PHOTOS.dealerCards.webp))
    for (const s of sources) expect(s.getAttribute('sizes')).toBe(sizes)
  })

  it('is lazy, decodes off the main thread and reserves its box', () => {
    render(<LandingPhoto photo={LANDING_PHOTOS.dealerCards} alt="A dealer" sizes={sizes} />)
    const img = screen.getByRole('img', { name: 'A dealer' })
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
    expect(img).toHaveAttribute('width', '1600')
    expect(img).toHaveAttribute('height', '1066')
    expect(img).toHaveAttribute('sizes', sizes)
    // The fallback for a browser that reads neither <source>: the small WebP.
    expect(img).toHaveAttribute('src', LANDING_PHOTOS.dealerCards.webp[0].url)
  })

  it('paints the blurred placeholder underneath until the photo arrives, cropped the same way', () => {
    render(<LandingPhoto photo={LANDING_PHOTOS.dealerCards} alt="A dealer" sizes={sizes} position="50% 70%" />)
    const img = screen.getByRole('img', { name: 'A dealer' })
    expect(img.style.backgroundImage).toContain('data:image/webp;base64,')
    expect(img.style.objectPosition).toBe('50% 70%')
    expect(img.style.backgroundPosition).toBe('50% 70%')
  })

  it('keeps a decorative photo out of the accessibility tree', () => {
    const { container } = render(<LandingPhoto photo={LANDING_PHOTOS.feltHandsChips} alt="" sizes="100vw" />)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
