/*
  Runs in <head>, before the first paint. Plain script, no module, no build:
  it has to finish before the browser draws anything, and a module is deferred
  by definition.

  One job. The page at an unprefixed URL (`/`, `/learn`, …) is prerendered in
  English. A visitor who reads the site in another language — because they
  chose it before, or because their browser says so — would be shown the
  English page and then watch it become German a moment later, when the app
  has loaded. So in exactly that case the prerendered markup is kept
  invisible; `main.tsx` shows the page once it is drawn in the right language
  (`releaseBootHold`).

  A prefixed URL (`/de/learn`) is already in its language and is never held.
  Neither is the common case, English on an English page: that one is
  readable from the first paint and stays up until the app replaces it.

  A second job, the cookie bar. Every prerendered page carries the bar
  (`data-boot-banner`), so it is painted with the page and not 2-3 s later,
  when it used to become the page's LCP element. For a visitor with nothing
  to answer — an answer already stored, Global Privacy Control, Do Not
  Track: the cases in which `CookieBanner` stays away — this sets
  `data-consent` on <html>, and the rule in index.html hides the bar before
  the first paint. Until the app has mounted, the bar's two buttons are
  answered here, with what `consent-choice.ts` → `setConsent` does; then
  `CookieBanner` adopts the element and renames the marker, and this
  handler no longer matches it.

  The timeout is the way out if the app never arrives: after four seconds the
  English page is shown regardless, because a page in the wrong language is
  worth more than a dark screen.

  A file rather than an inline <script> so the Content-Security-Policy can
  stay at `script-src 'self'`. Keep the locale list and the storage key in
  step with `src/i18n/locales.ts`; `boot-script.test.ts` holds them together.
*/
(function () {
  var CONSENT_KEY = 'bjt_cookie_consent'
  try {
    var answered = null
    try { answered = localStorage.getItem(CONSENT_KEY) } catch (e) { /* storage unavailable */ }
    if (answered === 'accepted' || answered === 'declined' ||
        navigator.globalPrivacyControl === true || navigator.doNotTrack === '1') {
      document.documentElement.setAttribute('data-consent', 'skip')
    }
    document.addEventListener('click', function (e) {
      var button = e.target && e.target.closest && e.target.closest('[data-boot-banner] [data-testid^="cookie-"]')
      if (!button) return
      var id = button.getAttribute('data-testid')
      var answer = id === 'cookie-accept' ? 'accepted' : id === 'cookie-decline' ? 'declined' : null
      if (!answer) return
      try {
        localStorage.setItem(CONSENT_KEY, answer)
        if (answer === 'declined') localStorage.removeItem('bjt_visitor_id')
      } catch (err) { /* storage unavailable — the app will ask again */ }
      document.documentElement.setAttribute('data-consent', 'skip')
    })
  } catch (e) { /* the bar stays up; the app answers it once mounted */ }

  try {
    var LOCALES = ['en', 'de', 'fr', 'it', 'es', 'pt', 'tr']
    var root = document.documentElement
    var prefix = /^\/([a-z]{2})(?=\/|$)/.exec(location.pathname)
    if (prefix && LOCALES.indexOf(prefix[1]) > 0) return

    var wanted = null
    try { wanted = localStorage.getItem('bjt_locale') } catch (e) { /* storage unavailable */ }
    wanted = String(wanted || navigator.language || 'en').toLowerCase().split(/[-_]/)[0]
    if (LOCALES.indexOf(wanted) < 0) wanted = 'en'

    if (wanted !== (root.lang || 'en')) {
      root.setAttribute('data-boot', 'hold')
      setTimeout(function () { root.removeAttribute('data-boot') }, 4000)
    }
  } catch (e) { /* never let this stand between a visitor and the page */ }
})()
