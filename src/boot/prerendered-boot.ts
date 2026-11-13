/**
 * The first commit over a prerendered page.
 *
 * The public pages are in the HTML the server sends, so a visitor reads them
 * before any script has run. React then replaces that markup with its own —
 * the pages are not hydrated, see `entry-prerender.tsx` for why — and until
 * 13 Nov 2026 the replacement was visible three times over: the page was
 * cleared to a blank fallback, a five-second welcome screen went over it, and
 * when the page came back every section faded in again from nothing. Measured
 * on the live site, a chapter was readable after 0.17 s and usable again after
 * 5.5 s.
 *
 * The replacement is still a replacement. What changed is that it waits until
 * the whole page can be rendered in one commit (`main.tsx` loads the route's
 * chunk and the language first), and that for the length of that one commit
 * this flag is up, so anything that would announce itself on mount — an
 * entrance, a scroll reset — stays still. The visitor is looking at the same
 * pixels before and after.
 *
 * Module state rather than context: it is read by leaf components during the
 * very first render and is over before the second one, and a provider would
 * re-render the tree to say so.
 */

let active = false

/** Mark the commit that replaces prerendered markup as in progress. */
export function beginPrerenderedBoot(): void {
  active = true
}

/** The replacing commit is done; everything mounted from here on is ordinary. */
export function endPrerenderedBoot(): void {
  active = false
}

/**
 * Whether the render in progress is replacing markup the visitor already sees.
 *
 * Read it once, at mount (a `useState` initialiser), never in an effect that
 * can run later: the answer is only meaningful for the first commit.
 */
export function isPrerenderedBoot(): boolean {
  return active
}

/**
 * The attribute `public/boot.js` sets when the prerendered page is in a
 * different language from the one this visitor reads the site in.
 *
 * The English page is what `/` carries; a visitor whose stored or browser
 * language is German would otherwise read English for a moment and then
 * watch it turn into German. `boot.js` hides the markup before the first
 * paint in that one case, and this lets it out again once the app has drawn
 * the page in the right language.
 */
export const BOOT_HOLD_ATTR = 'data-boot'

/** Show the page. Safe to call when nothing was held. */
export function releaseBootHold(): void {
  if (typeof document === 'undefined') return
  document.documentElement.removeAttribute(BOOT_HOLD_ATTR)
}
