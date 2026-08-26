import type { LevelDefinition } from './level-system'

/**
 * Level colours, made readable on whichever surface they land on.
 *
 * The ladder in `level-system.ts` is a deliberate progression — grey, green,
 * blue, violet, gold, and finally the pale near-white of the diamond tier — and
 * it is tuned for the dark theme, where pale reads as *brilliant*. On the light
 * theme's `#f4f5f7` the top of that ladder inverts into its own opposite:
 * measured in the browser, level 23 rendered at **1.05:1**, level 22 at 1.10,
 * level 25 at 1.12. Nine levels sat below 2:1. The most aspirational part of
 * the product was the least visible part of it.
 *
 * Two ways to fix that. Hand-pick a second colour for all 25 levels, which
 * doubles a table that must then be kept in step by hand and puts the guarantee
 * in a reviewer's eye; or derive the light variant and *assert* the guarantee.
 * This is the second: one source of truth stays in `LEVELS`, and the test walks
 * the whole table, so a level added later cannot quietly reintroduce the bug.
 *
 * The derivation works in HSL and holds the hue fixed, because the hue is what
 * carries the tier: gold must stay gold, diamond must stay diamond.
 *
 * It also *raises* saturation on the way down, and that part was learned the
 * expensive way. The first version only mixed toward black. Every level cleared
 * AA and the test went green — and the elite tier came out a uniform olive-grey
 * in which gold and diamond were indistinguishable. Darkening a pale colour
 * makes it muddy, not rich: pale gold `#ffec80` is only readable *because* it
 * is pale, and taking the light away without giving back chroma leaves nothing
 * behind. Compensating turns it into a deep amber, and pale diamond `#b9f2ff`
 * into a deep teal, which is what those tiers mean.
 *
 * Neutral greys (levels 1–5) are exempt: they have no hue to protect, and
 * saturating them would invent a colour the ladder never had.
 */

/** WCAG relative luminance of an sRGB triplet. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const f = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Parse `#rgb` or `#rrggbb` into an sRGB triplet. */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function toHex([r, g, b]: readonly [number, number, number]): string {
  const p = (v: number): string => Math.round(v).toString(16).padStart(2, '0')
  return `#${p(r)}${p(g)}${p(b)}`
}

/** WCAG contrast ratio between two sRGB triplets. */
export function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The light theme's page surface — `--color-casino-bg` under `[data-theme="light"]`. */
export const LIGHT_SURFACE: readonly [number, number, number] = [244, 245, 247]

/** WCAG AA for normal-size text. Level titles are body-sized, so 4.5 applies. */
export const AA_NORMAL = 4.5

/**
 * What the derivation actually aims for.
 *
 * A quarter-step above AA, because `LIGHT_SURFACE` is the *page*, and these
 * colours are read on cards that sit slightly darker than it — the level rail
 * lives on `--color-surface-2`. Landing exactly on 4.5 against the page meant
 * arriving at 4.43 on the card, which is a failure produced entirely by a
 * margin nobody left. The cost is a barely perceptible extra darkening.
 */
export const PALETTE_TARGET = 4.75

/** sRGB → HSL, all components 0..1 except hue in degrees. */
function toHsl([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return [h, s, l]
}

/** HSL → sRGB. */
function fromHsl([h, s, l]: readonly [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const seg = Math.floor(h / 60) % 6
  const [r, g, b] =
    seg === 0 ? [c, x, 0] :
    seg === 1 ? [x, c, 0] :
    seg === 2 ? [0, c, x] :
    seg === 3 ? [0, x, c] :
    seg === 4 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Below this, a colour is a neutral grey and gets no chroma compensation. */
const CHROMA_FLOOR = 0.15

/**
 * Darken `hex` far enough to clear `target` contrast against `surface`, keeping
 * its hue and compensating the chroma it loses on the way down.
 *
 * Walks lightness down in 2% steps and returns the first stop that clears, so a
 * colour already dark enough comes back untouched and one that needs help is
 * changed no more than the requirement demands. Saturation rises with the
 * distance travelled — a colour dragged far down gets the most compensation,
 * which is exactly the pale ones — and neutral greys are left neutral.
 * Lightness zero always clears against a light surface, so the loop terminates.
 *
 * @param hex - Source colour, `#rgb` or `#rrggbb`
 * @param surface - Background it will be read against
 * @param target - Minimum contrast ratio to reach
 * @returns A `#rrggbb` colour of the same hue, dark enough to read
 */
export function darkenToContrast(
  hex: string,
  surface: readonly [number, number, number] = LIGHT_SURFACE,
  target: number = AA_NORMAL
): string {
  const src = parseHex(hex)
  if (contrastRatio(src, surface) >= target) return toHex(src)

  const [h, s0, l0] = toHsl(src)
  const neutral = s0 < CHROMA_FLOOR
  for (let l = l0; l >= 0; l -= 0.02) {
    // Give back roughly what the darkening took, capped at fully saturated.
    const s = neutral ? s0 : Math.min(1, s0 + (l0 - l) * 1.1)
    const hex8 = toHex(fromHsl([h, s, Math.max(0, l)]))
    // Measure what actually ships, not the unrounded candidate. Rounding to
    // 8 bits per channel can cost enough to drop a borderline colour back
    // under the threshold — level 4 landed at 4.47 that way, and the
    // table-wide test caught it.
    if (contrastRatio(parseHex(hex8), surface) >= target) return hex8
  }
  return '#000000'
}

/**
 * The level's colours as they should render under the given theme.
 *
 * Dark theme returns the definition untouched — it is what the ladder was
 * designed for. Light theme darkens the text colour to clear AA, and rebuilds
 * the glow from the same darkened value so the badge's tint, border and halo
 * stay one family instead of drifting apart.
 *
 * @param level - A level definition from `LEVELS`
 * @param theme - The active theme
 */
export function levelPalette(
  level: LevelDefinition,
  theme: 'light' | 'dark'
): LevelDefinition {
  if (theme !== 'light') return level
  const color = darkenToContrast(level.color, LIGHT_SURFACE, PALETTE_TARGET)
  const [r, g, b] = parseHex(color)
  return { ...level, color, glowColor: `rgba(${r},${g},${b},0.28)` }
}
