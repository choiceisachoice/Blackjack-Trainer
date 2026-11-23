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
