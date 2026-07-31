const KEY = 'bjt_level_intro_seen'

/**
 * Whether the one-time "what is a level" explainer has been shown.
 *
 * Kept out of the level store on purpose: the store is reset and re-hydrated
 * on sign-in, and this must survive that — it is a fact about *this browser
 * having seen the message once*, not about progress.
 *
 * It also decouples the explainer from `oldLevel === 1`, which was the real
 * bug: a fresh account levels up several times in one burst, only the last hop
 * survived the popup, and its `oldLevel` was 2 — so the beginner who most
 * needed the explanation was the one guaranteed never to see it.
 */
export function hasSeenLevelIntro(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    // Storage unavailable — showing the intro again is a far smaller failure
    // than never showing it.
    return false
  }
}

/** Record that the explainer has been shown. Idempotent. */
export function markLevelIntroSeen(): void {
  try {
    localStorage.setItem(KEY, 'true')
  } catch {
    /* storage unavailable — worst case is the intro repeating once */
  }
}
