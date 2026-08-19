import type { AppMode } from '../store/app-store'

/**
 * Training modes that require Pro. Free users can see them in the nav (with a
 * lock) but hit the upgrade paywall instead of the mode. Kept in one place so
 * the nav, the router and any deep link agree on what is gated.
 *
 * Free (deliberately enough to genuinely learn): Home, Speed Drill, Flashcards,
 * Strategy Chart (without the deviations overlay), basic Analytics, Awards, Learn.
 */
export const PRO_MODES: ReadonlySet<AppMode> = new Set<AppMode>([
  'casinoSession',
  'betSpread',
  'deckEstimation',
  'bankrollSim',
  'casinoSessionTracker',
])

export function isProMode(mode: AppMode): boolean {
  return PRO_MODES.has(mode)
}

/**
 * The plans the paywall offers, in the order it shows them.
 *
 * Ids only. The amounts are **not** here: they used to be, as literals beside a
 * comment asking the next person to keep them in step with Stripe, and on
 * 10 August 2026 they went out of step — the prices were re-cut for Swiss VAT
 * and the page went on advertising CHF 8.90 while the configured price charged
 * 7.90. A comment is not a mechanism. Amounts now come from Stripe at runtime
 * via `plan-price-store`, so there is one number and it is the one that bills.
 */
export const PLAN_IDS = ['monthly', 'yearly'] as const

export type PlanId = (typeof PLAN_IDS)[number]

/**
 * Format an amount the way Stripe stores it — in the currency's smallest unit.
 *
 * How small that unit is depends on the currency: CHF and EUR have two decimal
 * places, JPY has none. Asking `Intl` rather than dividing by a hard-coded 100
 * is the difference between ¥1,000 and ¥100,000 on a page selling to Japan.
 *
 * Whole amounts lose their decimals (`CHF 69`, not `CHF 69.00`) because a price
 * with `.00` on it reads as a form field rather than a price.
 */
export function formatMoney(minorUnits: number, currency: string, locale: string): string {
  const code = currency.toUpperCase()
  const decimals =
    new Intl.NumberFormat(locale, { style: 'currency', currency: code })
      .resolvedOptions().maximumFractionDigits ?? 2
  const major = minorUnits / 10 ** decimals
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: Number.isInteger(major) ? 0 : decimals,
  }).format(major)
}

/**
 * A plain decimal in the reader's language.
 *
 * The VAT rate reaches the page as the number 8.1 and was interpolated raw, so
 * a German sentence read "8.1%" where it should read "8,1%". Small, and exactly
 * the kind of small that makes a page look translated rather than written — in
 * a sentence about tax, which is the worst place to look careless.
 */
export function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

/**
 * Swiss VAT rate, as a percentage.
 *
 * A single constant because it appears in the price note, the Terms and — when
 * the tax rate is configured in Stripe — on the invoice. Three places that must
 * agree, and the one that is easiest to forget is the one nobody looks at.
 */
export const CH_VAT_PERCENT = 8.1


/** What paying yearly saves against twelve monthly payments, in minor units. */
export interface YearlySaving {
  /** What a year of monthly billing would cost. */
  monthlyTotal: number
  /** Kept by paying yearly. */
  saved: number
  /** Discount as a whole percent. */
  percent: number
}

/**
 * Derive the yearly discount from the two amounts, in minor units.
 *
 * Takes the numbers rather than reading them from a module constant: they now
 * arrive from Stripe at runtime, and a function that could only price the pair
 * it was compiled with is the problem this replaced.
 *
 * @throws on a monthly total of zero — the percentage would be `NaN`, and a
 *   paywall is better off rendering nothing than "Save NaN%".
 */
export function yearlySaving(monthlyMinor: number, yearlyMinor: number): YearlySaving {
  const monthlyTotal = monthlyMinor * 12
  if (monthlyTotal <= 0) throw new Error('cannot derive a saving from a zero monthly price')

  const saved = monthlyTotal - yearlyMinor
  return {
    monthlyTotal,
    saved,
    percent: Math.round((saved / monthlyTotal) * 100),
  }
}

/** How much of a capability the free tier gets. */
export type FreeLevel = 'full' | 'partial' | 'none'

/**
 * One capability, compared across the two tiers.
 *
 * Carries translation keys, not English. The paywall, the landing page and the
 * pricing card all read this list, so an English string here would be an
 * English string in three places that only English readers ever see corrected.
 */
export interface ComparisonRow {
  /** Key under `paywall` naming the capability the way a user thinks of it. */
  labelKey: string
  free: FreeLevel
  /** Key for the qualifier shown on the free side when `free` is `'partial'`. */
  freeNoteKey?: string
}

export interface FeatureGroup {
  /** Key under `paywall` for the group heading. */
  titleKey: string
  rows: ComparisonRow[]
}

/**
 * The paywall comparison, grouped by the path a counter actually takes:
 * drill it, take it to the table, then read your own edge.
 *
 * Grouping matters more than it looks. A flat list of eight items reads as
 * noise; four short groups let someone find the one capability they came for.
 * The order mirrors the landing page's "Learn it. Drill it. Play it."
 *
 * This is the single source of truth — the benefit lists below are derived from
 * it, so the paywall, the landing page and the pricing card cannot disagree.
 */
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    titleKey: 'g1',
    rows: [
      { labelKey: 'r1', free: 'full' },
      { labelKey: 'r2', free: 'none' },
      { labelKey: 'r3', free: 'none' },
    ],
  },
  {
    titleKey: 'g2',
    rows: [
      { labelKey: 'r4', free: 'none' },
      { labelKey: 'r5', free: 'partial', freeNoteKey: 'basics' },
      { labelKey: 'r6', free: 'none' },
    ],
  },
  {
    titleKey: 'g3',
    rows: [
      { labelKey: 'r7', free: 'partial', freeNoteKey: 'basics' },
      { labelKey: 'r8', free: 'none' },
    ],
  },
  {
    titleKey: 'g4',
    rows: [
      { labelKey: 'r9', free: 'full' },
    ],
  },
]

/** Every row, flattened — handy for counting and for the derived lists. */
const ALL_ROWS: ComparisonRow[] = FEATURE_GROUPS.flatMap(g => g.rows)

/**
 * What Pro adds. Derived: anything the free tier doesn't get in full, including
 * the partial ones (free has the basics, Pro completes them).
 */
export const PRO_BENEFITS: string[] = ALL_ROWS
  .filter(r => r.free !== 'full')
  .map(r => r.labelKey)

/**
 * What the free tier already includes. Shown beside the Pro column so the
 * paywall compares instead of only advertising — seeing what you *do* have
 * makes the gap concrete, and keeps the free tier an honest offer.
 */
export const FREE_BENEFITS: ComparisonRow[] = ALL_ROWS.filter(r => r.free !== 'none')
