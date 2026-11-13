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

  The timeout is the way out if the app never arrives: after four seconds the
  English page is shown regardless, because a page in the wrong language is
  worth more than a dark screen.

  A file rather than an inline <script> so the Content-Security-Policy can
  stay at `script-src 'self'`. Keep the locale list and the storage key in
  step with `src/i18n/locales.ts`; `boot-script.test.ts` holds them together.
*/
(function () {
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
