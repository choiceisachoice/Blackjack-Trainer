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
  title: string
  body: string
}

export const TOUR_STOPS: TourStop[] = [
  {
    // Not `training-plan`: that wrapper measured 1235x3954 in the real app, so
    // spotlighting it dimmed nothing and pointed the arrow past the fold. The
    // "up next" card is the part of the plan this sentence is really about.
    anchor: 'plan-up-next',
    title: 'This is your plan, and this is next',
    body: 'One ordered path from where you are to counting a live table, and the stage you are on now. Finish its drill to the bar it names and the next one opens — nothing here unlocks by being read.',
  },
  {
    anchor: 'daily-challenge-card',
    title: 'Today’s challenge',
    body: 'A small daily target picked to match the stage you are on. It is a nudge, not a requirement — skipping it costs you nothing but the streak.',
  },
  {
    anchor: 'mode-card-speedDrill',
    title: 'The training modes',
    body: 'Each drill trains one skill: counting speed here, correct play in Flashcards, bet sizing in Bet Spread. Your plan sends you to the right one, but they are all open whenever you want them.',
  },
  {
    anchor: 'mode-card-casinoSession',
    title: 'The real thing',
    body: 'A full multi-seat table where you hold the count, play the hands and size the bets at once. This is what all the drills are practice for.',
  },
  {
    anchor: 'learn-button',
    title: 'Learn — the theory',
    body: 'Every stage of the plan has a chapter here, written for someone starting from nothing. If a drill stops making sense, this is where the answer is.',
  },
  {
    anchor: 'analytics-button',
    title: 'Analytics',
    body: 'Your accuracy over time, which hands you get wrong most, and how much you have actually practised. Worth a look after a few sessions — it is thin before that, and honestly so.',
  },
  {
    anchor: 'achievements-button',
    title: 'Awards',
    body: 'Milestones you unlock by training. They track real progress rather than time spent, so they are also a rough map of what the app expects you to be able to do.',
  },
  {
    anchor: 'strategy-chart-button',
    title: 'The strategy chart',
    body: 'The whole basic-strategy table in one place, to look up rather than memorise. Keep it open beside a drill while the moves are still new.',
  },
]

/** The stops whose anchors are actually on the page right now. */
export function visibleStops(
  stops: readonly TourStop[],
  exists: (anchor: string) => boolean,
): TourStop[] {
  return stops.filter(s => exists(s.anchor))
}
