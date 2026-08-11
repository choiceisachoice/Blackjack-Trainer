/**
 * The guided tour: what gets pointed at, in the order it appears on the page.
 *
 * Anchored to `data-testid` rather than to CSS classes or DOM structure. Those
 * change with every restyle and a tour that silently loses its anchors is worse
 * than no tour — it points at nothing and says something confident.
 *
 * Every stop is optional by design. The home screen shows different things to
 * different accounts (no "up next" once the path is finished, no challenge card
 * before stats load), so a missing anchor skips its stop instead of stalling.
 */

export interface TourStop {
  /** `data-testid` of the element to point at. */
  anchor: string
  /** Translation keys — the tour is the first English a new user would meet. */
  titleKey: string
  bodyKey: string
}

export const TOUR_STOPS: TourStop[] = [
  {
    // Not `training-plan`: that wrapper measured 1235x3954 in the real app, so
    // spotlighting it dimmed nothing and pointed the arrow past the fold. The
    // "up next" card is the part of the plan this sentence is really about.
    anchor: 'plan-up-next',
    titleKey: 'tour.plan.title',
    bodyKey: 'tour.plan.body',
  },
  { anchor: 'daily-challenge-card', titleKey: 'tour.challenge.title', bodyKey: 'tour.challenge.body' },
  { anchor: 'mode-card-speedDrill', titleKey: 'tour.modes.title', bodyKey: 'tour.modes.body' },
  { anchor: 'mode-card-casinoSession', titleKey: 'tour.casino.title', bodyKey: 'tour.casino.body' },
  { anchor: 'learn-button', titleKey: 'tour.learn.title', bodyKey: 'tour.learn.body' },
  { anchor: 'analytics-button', titleKey: 'tour.analytics.title', bodyKey: 'tour.analytics.body' },
  { anchor: 'achievements-button', titleKey: 'tour.awards.title', bodyKey: 'tour.awards.body' },
  { anchor: 'strategy-chart-button', titleKey: 'tour.chart.title', bodyKey: 'tour.chart.body' },
]

/** The stops whose anchors are actually on the page right now. */
export function visibleStops(
  stops: readonly TourStop[],
  exists: (anchor: string) => boolean,
): TourStop[] {
  return stops.filter(s => exists(s.anchor))
}
