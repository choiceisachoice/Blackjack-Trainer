/**
 * The visitor's answer to "may we count your visit?".
 *
 * The visit statistics put a random id into the browser's storage. That id is
 * not needed to show anyone a page, so under the ePrivacy rules that apply to
 * visitors from the EU it wants a yes first — and the site is read in German,
 * French, Italian, Spanish and Portuguese (Darius, 18 Nov 2026).
 *
 * Three states: no answer yet (the banner asks, nothing is counted),
 * `accepted`, `declined`. The answer belongs to the device, like the language
 * and the sound switch: it is asked once, it survives signing out, and it is
 * the same whether or not anyone is signed in.
 */

/** Storage key. Listed as a device preference in `local-reset.ts`, so the sign-out wipe leaves it. */
export const CONSENT_KEY = 'bjt_cookie_consent'

export type Consent = 'accepted' | 'declined'

type Listener = () => void
const listeners = new Set<Listener>()

/** The stored answer, or null when the visitor has not been asked or has not answered. */
export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'accepted' || v === 'declined' ? v : null
  } catch {
    // Storage unavailable: nothing can be remembered, so nothing is counted.
    return null
  }
}

/**
 * Record the answer. Declining also removes the visitor id a previous yes
 * may have left behind — "no" has to undo what "yes" stored.
 *
 * @param consent - The visitor's answer
 */
export function setConsent(consent: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent)
    if (consent === 'declined') localStorage.removeItem('bjt_visitor_id')
  } catch {
    /* storage unavailable — the banner will ask again on the next visit */
  }
  listeners.forEach(l => l())
}

/** Forget the answer, so the banner asks again. Used by "Cookie settings". */
export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    /* storage unavailable */
  }
  listeners.forEach(l => l())
}

/**
 * Hear about every change of the answer.
 *
 * @param listener - Called after the answer changed
 * @returns A function that stops listening
 */
export function onConsentChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
