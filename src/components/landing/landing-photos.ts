/**
 * The two photographs on the landing page: which files, at which sizes.
 *
 * Real photographs, because a page made only of the product's own drawings
 * never shows the thing those drawings are of: the casino table. One sits
 * beside the drawn table in the Pro band ("this is what the trainer
 * simulates"), one under the closing call to action. Two, and only two — the
 * owner asked for a page that feels alive without getting busier.
 *
 * Both are Pexels photos (licence and edits in `docs/IMAGE-CREDITS.md`),
 * imported through Vite rather than put in `public/`, so they leave the build
 * as `/assets/<name>-<hash>.<ext>` — the one path the Caddyfile marks
 * `immutable`, and the only kind of name for which that is safe. The SSR
 * build behind the prerender hashes the same bytes the same way, so the
 * prerendered HTML points at the files the client build wrote.
 *
 * Drawn by `LandingPhoto`. Kept apart from it because a component file that
 * also exports data loses fast refresh.
 */
import dealerAvif800 from '../../assets/landing/dealer-cards-green-felt-800.avif'
import dealerAvif1600 from '../../assets/landing/dealer-cards-green-felt-1600.avif'
import dealerWebp800 from '../../assets/landing/dealer-cards-green-felt-800.webp'
import dealerWebp1600 from '../../assets/landing/dealer-cards-green-felt-1600.webp'
import feltAvif800 from '../../assets/landing/felt-hands-chips-800.avif'
import feltAvif1600 from '../../assets/landing/felt-hands-chips-1600.avif'
import feltWebp800 from '../../assets/landing/felt-hands-chips-800.webp'
import feltWebp1600 from '../../assets/landing/felt-hands-chips-1600.webp'

/** One encoded file of a photo: its URL and its width in pixels. */
export interface PhotoVariant {
  url: string
  width: number
}

/** A photo in every encoding and size the landing serves. */
export interface LandingPhotoAsset {
  /** Smallest first. Offered first, because it is the smaller file. */
  avif: readonly PhotoVariant[]
  /** Smallest first. The fallback for a browser without AVIF. */
  webp: readonly PhotoVariant[]
  /** Pixel size of the largest file — for `width`/`height`, i.e. the aspect ratio. */
  width: number
  height: number
  /**
   * A 20 px wide, blurred WebP as a `data:` URI (a few hundred bytes, allowed
   * by the page's `img-src 'self' data:`), shown until the photo has loaded.
   */
  placeholder: string
}

/** The landing's two photographs. */
export const LANDING_PHOTOS = {
  /** A dealer's hands turning cards on green felt (Javon Swaby, Pexels 3279691). 3:2. */
  dealerCards: {
    avif: [{ url: dealerAvif800, width: 800 }, { url: dealerAvif1600, width: 1600 }],
    webp: [{ url: dealerWebp800, width: 800 }, { url: dealerWebp1600, width: 1600 }],
    width: 1600,
    height: 1066,
    placeholder: 'data:image/webp;base64,UklGRrIAAABXRUJQVlA4IKYAAACQBQCdASoUAA4APu1iqU2ppaOiMAgBMB2JbACxGcAljv+AuP+5ACpAFoQhINkLl80rAqR+AAD+7ov9poqSW4NqqkUyZyNucK7TrfPwydyG/m3NrRTWTtt61OEjva6uuMeg7l0c/DB/OMftMV4IiayZxlB0grWpflYZbXUS1p7kdil2TGE1M/GF3Ps8cSacfl0XR3hcer4WdtHLXZizZpx5SXoThAAA',
  },
  /** Players' hands and chips on green felt, warm low light (Drew Rae, Pexels 1871508). 16:9. */
  feltHandsChips: {
    avif: [{ url: feltAvif800, width: 800 }, { url: feltAvif1600, width: 1600 }],
    webp: [{ url: feltWebp800, width: 800 }, { url: feltWebp1600, width: 1600 }],
    width: 1600,
    height: 900,
    placeholder: 'data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAABwBACdASoUAAwAPu1iqU2ppaQiMAgBMB2JbACdMoLT+z/4DzO9Hsa6cVVkAAD+3UHjYzhhPi5gBkZdxfnoJEBKdFjp5gZwvY8Ot5oeJ39HFKj5Wscamg/yktmZaD/KP4nHnWlBtsB6J/sT7rZnwIdhg68CypR9+2AAAA==',
  },
} as const satisfies Record<string, LandingPhotoAsset>

/** `srcset` for a list of variants: `"a.avif 800w, b.avif 1600w"`. */
export function srcSetOf(variants: readonly PhotoVariant[]): string {
  return variants.map(v => `${v.url} ${v.width}w`).join(', ')
}
