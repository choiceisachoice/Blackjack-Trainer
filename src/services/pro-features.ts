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
 * A subscription plan shown on the paywall.
 *
 * `amount` is the number, not a formatted string, so the price label and the
 * yearly saving are **derived** rather than written by hand. The previous copy
 * claimed "2 months free" while the real discount was ~4.5 months — prose next
 * to numbers drifts, arithmetic doesn't.
 *
 * Display-only: the real amounts live in Stripe and are chosen server-side by
 * price id. Keep these in sync with the Stripe Prices you create.
 */
export interface PlanOption {
  id: 'monthly' | 'yearly'
  /** Amount charged per billing period, in CHF. */
  amount: number
  cadence: string
}

export const PLAN_OPTIONS: PlanOption[] = [
  { id: 'monthly', amount: 8.9, cadence: '/month' },
  { id: 'yearly', amount: 69, cadence: '/year' },
]

/** Format a CHF amount, dropping the decimals on whole francs (59 → "CHF 59"). */
export function formatCHF(amount: number): string {
  return `CHF ${amount.toFixed(2).replace(/\.00$/, '')}`
}

/**
 * Swiss VAT rate, as a percentage.
 *
 * A single constant because it appears in the price note, the Terms and — when
 * the tax rate is configured in Stripe — on the invoice. Three places that must
 * agree, and the one that is easiest to forget is the one nobody looks at.
 */
export const CH_VAT_PERCENT = 8.1


/** What paying yearly saves against twelve monthly payments. */
export interface YearlySaving {
  /** What a year of monthly billing would cost. */
  monthlyTotal: number
  /** Francs kept by paying yearly. */
  saved: number
  /** Discount as a whole percent. */
  percent: number
}

/**
 * Derive the yearly discount from the two plan amounts.
 *
 * @throws if either plan is missing — a paywall that can't price itself should
 *   fail loudly in tests, not quietly render "NaN" at a customer.
 */
export function yearlySaving(plans: PlanOption[] = PLAN_OPTIONS): YearlySaving {
  const monthly = plans.find(p => p.id === 'monthly')
  const yearly = plans.find(p => p.id === 'yearly')
  if (!monthly || !yearly) throw new Error('PLAN_OPTIONS must contain a monthly and a yearly plan')

  const monthlyTotal = monthly.amount * 12
  const saved = monthlyTotal - yearly.amount
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
