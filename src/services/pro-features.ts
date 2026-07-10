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

/** A subscription plan shown on the paywall. Prices are display-only — the real
 * amounts live in Stripe and are chosen server-side by price id. Adjust these to
 * match the Stripe Prices you create. */
export interface PlanOption {
  id: 'monthly' | 'yearly'
  label: string
  price: string
  cadence: string
  note?: string
}

export const PLAN_OPTIONS: PlanOption[] = [
  { id: 'yearly', label: 'Yearly', price: 'CHF 59', cadence: '/year', note: 'Best value — 2 months free' },
  { id: 'monthly', label: 'Monthly', price: 'CHF 7.90', cadence: '/month' },
]

/** The headline Pro benefits, shown on the paywall. */
export const PRO_BENEFITS: string[] = [
  'Full Casino Session table with bots, splits and payouts',
  'Bet Spread and Deck Estimation training',
  'Illustrious 18 & Fab 4 deviations on the Strategy Chart',
  'Bankroll Tracker & Simulator for real-money sessions',
  'The complete analytics picture — trend, heatmap, skill radar, weakest hands',
]
