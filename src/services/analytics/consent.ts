import { isSupabaseConfigured } from '../supabase/client'
import { getConsent } from './consent-choice'

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
 * And, since 18 Nov 2026, a fifth: the visitor has not said yes. The banner's
 * answer is read here, as one more `return false`, and nothing else in the
 * tracker had to change. No answer counts as no.
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
  if (getConsent() !== 'accepted') return false
  return true
}

/**
 * Whether there is anything to ask this visitor.
 *
 * Not where nothing would be counted whatever they answered: a build without
 * a database, or a browser that already says no on the visitor's behalf
 * (Global Privacy Control, Do Not Track). Asking someone who has told every
 * site "no" whether this one may is the kind of banner people hate.
 *
 * Automation is *not* excluded here, unlike in `analyticsAllowed`: a test
 * that drives the real site has to be able to see and answer the banner.
 *
 * @param nav - The navigator, injectable for tests
 */
export function consentQuestionApplies(nav: Navigator | null = typeof navigator === 'undefined' ? null : navigator): boolean {
  if (nav === null) return false
  // In development the banner can be looked at without a database: ?consent
  if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('consent')) return true
  if (!isSupabaseConfigured) return false
  const gpc = (nav as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
  if (gpc === true) return false
  if (nav.doNotTrack === '1') return false
  return true
}
