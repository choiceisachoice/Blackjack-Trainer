import { isSupabaseConfigured } from '../supabase/client'

/**
 * The one gate in front of the website analytics.
 *
 * Everything the tracker does passes through here first, so the answer to
 * "how do I switch it off for someone" is always this function. Today it
 * says no in four cases:
 *
 * - Supabase is not configured — offline builds, tests, the demo recorder.
 * - The browser is driven by automation (`navigator.webdriver`): Playwright
 *   filming the product is not a visitor.
 * - The visitor sends Global Privacy Control. It is a legal signal in some
 *   places and a preference everywhere; honouring it costs nothing.
 * - The visitor sends Do Not Track. Weaker than GPC and mostly retired, but a
 *   person who set it meant it.
 *
 * If a consent banner ever becomes necessary, its answer belongs here — as
 * one more `return false` — and nothing else in the tracker has to change.
 *
 * @param nav - The navigator, injectable for tests; null when there is none (prerender)
 */
export function analyticsAllowed(nav: Navigator | null = typeof navigator === 'undefined' ? null : navigator): boolean {
  if (!isSupabaseConfigured) return false
  if (nav === null) return false
  if (nav.webdriver) return false
  const gpc = (nav as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
  if (gpc === true) return false
  if (nav.doNotTrack === '1') return false
  return true
}
