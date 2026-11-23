import { srcSetOf, type LandingPhotoAsset } from './landing-photos'

interface LandingPhotoProps {
  /** One of `LANDING_PHOTOS`. */
  photo: LandingPhotoAsset
  /** What the photo shows, in the reader's language — or `''` when it is decoration. */
  alt: string
  /** The `sizes` attribute: how wide the photo is drawn, per viewport. */
  sizes: string
  /** Classes for the `<img>` — size, shape and fit. */
  className?: string
  /**
   * Which part of the photo stays in view when `object-fit: cover` crops it,
   * as an `object-position` (`"50% 70%"`). The placeholder is cropped the same
   * way, so it does not shift when the photo replaces it.
   */
  position?: string
}

/**
 * A landing photograph (see `landing-photos.ts`): AVIF, then WebP, at the
 * width the layout needs.
 *
 * Both photos sit below the fold, so they load lazily and decode off the
 * main thread; `width`/`height` reserve the box before a byte has arrived,
 * and the blurred placeholder is the `<img>`'s own background until the
 * photo paints over it.
 *
 * Pass `alt=""` for a photo that is only atmosphere: an empty alt is what
 * marks an image as decorative, and a screen reader then skips it.
 */
export function LandingPhoto({ photo, alt, sizes, className = '', position = '50% 50%' }: LandingPhotoProps) {
  const fallback = photo.webp[0]
  return (
    <picture>
      <source type="image/avif" srcSet={srcSetOf(photo.avif)} sizes={sizes} />
      <source type="image/webp" srcSet={srcSetOf(photo.webp)} sizes={sizes} />
      <img
        src={fallback.url}
        srcSet={srcSetOf(photo.webp)}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        style={{
          objectPosition: position,
          backgroundImage: `url("${photo.placeholder}")`,
          backgroundSize: 'cover',
          backgroundPosition: position,
          // Not under a translucent border: there the felt green of the
          // placeholder showed through and the frame read as a green line.
          backgroundClip: 'padding-box',
        }}
      />
    </picture>
  )
}
