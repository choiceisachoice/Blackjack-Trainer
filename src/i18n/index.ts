import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES, resolveLocale, type Locale } from './locales'
import en from './messages/en.json'

/**
 * Translation setup.
 *
 * ── Why English is bundled and the rest are not ──
 * English is the source language and the fallback: every missing key lands
 * there, so it has to be present before the first paint or a gap would render
 * as a raw key. The other six are fetched on demand — bundling all seven would
 * put six languages nobody is reading into every visitor's download.
 *
 * ── Why no automatic detection beyond the first visit ──
 * The browser's language is a starting guess, not an instruction. Once someone
 * picks a language it is remembered and wins, because a person who chose
 * English on a German browser meant it, and being corrected on every visit is
 * infuriating in a way that no amount of clever detection makes up for.
 */

export type Messages = typeof en

/** Locales already fetched, so a second switch back is instant. */
const loaded = new Set<Locale>([DEFAULT_LOCALE])

/**
 * One loader per translatable language — English excluded, because it is
 * bundled.
 *
 * Written out rather than built from a template literal. A
 * `import(\`./messages/${locale}.json\`)` covering all seven would include
 * English in the dynamic set while it is also imported statically, and Vite
 * warns that it cannot then move it into its own chunk. The warning is
 * harmless and the noise is not: a build that always prints something is a
 * build whose output stops being read.
 */
const LOADERS: Record<Exclude<Locale, 'en'>, () => Promise<{ default: unknown }>> = {
  de: () => import('./messages/de.json'),
  fr: () => import('./messages/fr.json'),
  it: () => import('./messages/it.json'),
  es: () => import('./messages/es.json'),
  pt: () => import('./messages/pt.json'),
  tr: () => import('./messages/tr.json'),
}

/**
 * Fetch a language's messages and register them.
 *
 * A failed load is not fatal: i18next falls back to English, which is worse
 * than the right language and much better than a screen of dotted key paths.
 */
async function loadLocale(locale: Locale): Promise<void> {
  if (loaded.has(locale)) return
  try {
    const mod = await LOADERS[locale as Exclude<Locale, 'en'>]()
    i18next.addResourceBundle(locale, 'translation', mod.default, true, true)
    loaded.add(locale)
  } catch (e) {
    console.error(`could not load the ${locale} translation; staying on ${i18next.language}`, e)
  }
}

/** The language remembered from a previous visit, or the browser's, or English. */
export function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored) return resolveLocale(stored)
  } catch { /* storage unavailable — fall through to the browser */ }
  return resolveLocale(typeof navigator === 'undefined' ? null : navigator.language)
}

/**
 * Reflect the current language in the document itself.
 *
 * `lang` is what a screen reader picks its pronunciation from, and the title is
 * what the tab, the bookmark and the history entry say — the one piece of copy
 * that stays on screen after someone has navigated away.
 *
 * The `<title>` in `index.html` stays English on purpose and is not a fallback
 * worth apologising for: this is a static SPA, so a crawler is served that file
 * whatever language the visitor would have chosen. Rewriting `og:description`
 * here would change nothing a crawler ever sees. The tab, on the other hand, is
 * read by a person.
 */
function reflectLocale(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  const title = i18next.t('meta.title')
  if (title) document.title = title
}

/** Switch language, remember it, and fetch the messages if this is the first time. */
export async function setLocale(locale: Locale): Promise<void> {
  await loadLocale(locale)
  await i18next.changeLanguage(locale)
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* not worth failing over */ }
  reflectLocale(locale)
}

const startingLocale = initialLocale()

void i18next
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    lng: startingLocale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: LOCALES as unknown as string[],
    interpolation: {
      // React escapes everything it renders already; escaping again turns an
      // apostrophe in "Dealer's" into `&#39;` on screen.
      escapeValue: false,
    },
    // Missing keys fall back silently rather than rendering the key path. A
    // half-translated screen should read as English, not as source code.
    returnNull: false,
  })

// The chosen language may not be English, in which case its messages still have
// to arrive. Deliberately not awaited: English renders immediately and the
// translation swaps in a beat later, which beats holding the first paint.
if (startingLocale !== DEFAULT_LOCALE) void setLocale(startingLocale)
reflectLocale(startingLocale)

export default i18next
