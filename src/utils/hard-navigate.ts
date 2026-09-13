/**
 * A full navigation — the browser loads the URL, the app restarts.
 *
 * The router cannot leave its own basename: on `/de/learn` it is rooted at
 * `/de`, and `/learn` (English) is outside that root. Switching language on a
 * public page therefore has to be a real navigation, not a route change. One
 * function so it can be replaced in tests, where `window.location` cannot be.
 *
 * @param url - Where to go, as a path
 */
export function hardNavigate(url: string): void {
  window.location.assign(url)
}
