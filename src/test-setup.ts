import '@testing-library/jest-dom'

// jsdom ships no IntersectionObserver, but anything using viewport-triggered
// animation (framer-motion's `whileInView`, the hero's off-screen render pause)
// constructs one on mount. Stub it so those components render in tests; the
// stub never fires, which matches "nothing has scrolled into view yet".
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = '0px'
  readonly thresholds: ReadonlyArray<number> = [0]
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

if (!('IntersectionObserver' in globalThis)) {
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
}

/**
 * Real English strings in tests, not raw translation keys.
 *
 * Without an initialised i18next, `t('session.paused')` returns the key. Every
 * assertion on visible text would then have to be rewritten to match dotted
 * paths — which is a test suite that no longer checks what a user reads, and
 * would happily pass on a screen showing `session.paused` to a real person.
 *
 * English only, loaded synchronously: the other six are fetched on demand in
 * the browser, and no test asserts on a translation. One that needs to can
 * `addResourceBundle` for the locale it cares about.
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './i18n/messages/en.json'

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})
