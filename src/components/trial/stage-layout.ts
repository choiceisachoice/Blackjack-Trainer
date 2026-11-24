import { stackedTableSize } from '../casino-session/helpers'
import type { InitialTableFit } from '../casino-session/CasinoTable'

/**
 * The height of the guest table, the same in every state and on both pages.
 *
 * As tall as a screen allows below the page's header and above the cookie
 * bar, and no taller than a table needs: the dealer, the player's hand and
 * the buttons have to be on screen together during a hand, with nothing to
 * scroll. `--stage-top` is what the host page has above the stage once it is
 * scrolled into view (its sticky header and a little air); `--cookie-bar` is
 * published by the consent bar while it is up. A phone held sideways has no
 * height to give, so there the stage takes the screen and the controls move
 * beside the felt.
 */
export const STAGE_HEIGHT = [
  'h-[min(38rem,calc(100dvh_-_var(--stage-top,4.75rem)_-_0.75rem_-_var(--cookie-bar,0px)))]',
  'md:h-[min(36rem,calc(100dvh_-_var(--stage-top,4.75rem)_-_1rem_-_var(--cookie-bar,0px)))]',
  'short:h-[calc(100dvh_-_var(--stage-top,4.75rem)_-_0.5rem_-_var(--cookie-bar,0px))]',
  'min-h-[21rem] short:min-h-[15rem]',
].join(' ')

/**
 * The window shape at which `/try` puts its words beside the stage: at least
 * 1200px wide and wider than 8:5 — the `try-wide` variant in `index.css`.
 *
 * Stacked, the heading costs the table some 12rem of height, and on a wide,
 * low window height is what the table is short of: at 2000×720 it came out
 * 558×239. Beside the words it loses 28% of the width instead, which a table
 * about 2.3 times as wide as it is tall can spare there. Measured, the two
 * layouts give about the same table at 8:5 (1440×900); above it the columns
 * win, more the wider the window, and below it (1440×1000, 1280×1024, tablets)
 * the stacked table already spans the page and stays the better one. Under
 * 1200px the words' column would be too narrow for the heading.
 */
export const TRY_WIDE_QUERY = '(min-width: 1200px) and (min-aspect-ratio: 8/5)'

/**
 * The stage's floor in rem — the `min-h-[21rem]` above, as a number for the
 * one place that has to reason about it in script (`arrivalStageTop`). A test
 * keeps the two in step.
 */
export const STAGE_FLOOR_REM = 21

/** The air the `md:` height leaves under the stage, in rem (the `1rem` above). */
const STAGE_AIR_REM = 1

/**
 * Where to count the stage's height from so that it fits the **first** screen
 * under a heading, or null when it cannot.
 *
 * `--stage-top` normally names the header and some air — the room above the
 * stage once it has been scrolled to, which is what the landing does. On
 * `/try` the stage is the page and arrives under its heading, and at 720px
 * that put the deal button 115px below the screen. Counting from the stage's
 * real place on the page fits it there instead, a little smaller, so the
 * visitor sees the table and the button before scrolling.
 *
 * Only when the stage keeps at least its floor that way. Below that (a phone
 * held sideways, a very short window) the table would be smaller than it may
 * be, for a fit that cannot happen anyway: the caller keeps the scrolled-to
 * height. The cookie bar is left out of the decision on purpose — the height
 * itself still subtracts it, so the stage is held above the bar while the bar
 * is up and grows back the moment it is answered, without asking again.
 *
 * @param offsetTop - The stage's distance from the top of the document, in px
 * @param viewportHeight - The window's inner height, in px
 * @param remPx - The root font size, in px (it scales with the window here)
 * @returns The px value for `--stage-top`, or null to keep the default
 */
export function arrivalStageTop(offsetTop: number, viewportHeight: number, remPx: number): number | null {
  if (![offsetTop, viewportHeight, remPx].every(Number.isFinite) || remPx <= 0) return null
  const room = viewportHeight - offsetTop - STAGE_AIR_REM * remPx
  return room >= STAGE_FLOOR_REM * remPx ? Math.round(offsetTop) : null
}

/**
 * The same height as a floor, for the summary that takes the stage's place:
 * the page does not move up when the felt gives way to it.
 */
export const STAGE_MIN_HEIGHT = [
  'min-h-[min(38rem,calc(100dvh_-_var(--stage-top,4.75rem)_-_0.75rem_-_var(--cookie-bar,0px)))]',
  'md:min-h-[min(36rem,calc(100dvh_-_var(--stage-top,4.75rem)_-_1rem_-_var(--cookie-bar,0px)))]',
].join(' ')

/** The frame around the stage and the summary: one panel, edge to edge on a phone. */
export const STAGE_FRAME = 'bg-surface border-y sm:border sm:rounded-2xl border-contrast/10 shadow-[0_30px_80px_-40px_rgba(0,0,0,.9)] overflow-hidden'

/**
 * The felt as the prerendered HTML draws it, before a box has been measured:
 * the upright layout at the size of a small phone's screen. On a phone that
 * is about the size it will be; on a wide screen it is a small table in the
 * middle until the page's script draws it to its box a moment later — which
 * is before anyone has scrolled down to it.
 */
export const PRERENDER_FIT: InitialTableFit = (() => {
  const { width, height } = stackedTableSize(0, 1)
  return { scale: 0.6, sceneWidth: width, sceneHeight: height, stacked: true }
})()
