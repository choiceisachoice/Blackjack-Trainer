# Image credits

Photographs used on the public pages, where they come from, under which licence, and what was
done to them. Add a section here before any new photo ships.

Both are from Pexels and used under the **Pexels License** (https://www.pexels.com/license/):
free for commercial use, attribution not required, editing allowed. What it does not allow is
suggesting that a person shown endorses the product — neither photo shows a face or a casino name,
only hands, cards and chips.

The files live in `src/assets/landing/` and are imported by
`src/components/landing/LandingPhoto.tsx`, so the build serves them as
`/assets/<name>-<hash>.<ext>` with `Cache-Control: public, max-age=31536000, immutable`
(Caddyfile, `@assets`). Replacing a file changes its hash, so a cached copy can never go stale.

## dealer-cards-green-felt

- **Where:** landing page, Pro band, beside the drawn table of the "Full Casino Session" tile,
  captioned as the original the trainer simulates.
- **Source:** https://www.pexels.com/photo/people-playing-poker-3279691/ (Pexels ID 3279691,
  original 6240×4160)
- **Photographer:** Javon Swaby, https://www.pexels.com/@javon-swaby-197616/
- **Licence:** Pexels License, https://www.pexels.com/license/
- **Changes:** downloaded at 3000 px wide; no crop (3:2); graded with a curve that deepens the
  lifted, matte blacks, a slight warm shift that takes the cyan cast out of the felt, and
  saturation −12 %; resized (Lanczos) to 1600×1066 and 800×534; encoded as AVIF (libaom,
  10-bit, BT.709/sRGB) and WebP (libwebp); a 20 px blurred WebP placeholder inlined as a
  `data:` URI. On the page it is shown cropped to 2:1 (`object-position: 50% 70%`).
- **Note:** the Pexels title says "poker"; the scene is blackjack dealing (face-up hands at each
  spot, cards from a tray).

## felt-hands-chips

- **Where:** landing page, background of the closing call to action ("Start free" / "See Pro"),
  under a dark scrim. Decorative (`alt=""`).
- **Source:** https://www.pexels.com/photo/person-playing-poker-1871508/ (Pexels ID 1871508,
  original 5472×3439)
- **Photographer:** Drew Rae, https://www.pexels.com/@drewrae/
- **Licence:** Pexels License, https://www.pexels.com/license/
- **Changes:** downloaded at 3000 px wide; cropped to 16:9 (3000×1688: 60 px off the top,
  137 px off the bottom rail); graded with contrast +5 %, brightness −0.02, saturation −10 % and
  gamma 0.94; resized (Lanczos) to 1600×900 and 800×450; encoded as AVIF and WebP as above; a
  20 px blurred WebP placeholder. On the page it is cropped by the box (`object-fit: cover`,
  `object-position: 50% 40%`) and darkened by a radial scrim of the surface colour.
- **Note:** the Pexels title says "poker"; the picture shows blackjack (face-up hands, printed
  betting spots).

No EXIF, XMP, ICC, GPS or C2PA data was written to any of the files.
