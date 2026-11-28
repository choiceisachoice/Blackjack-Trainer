import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, LOCALES, localeFromPath, resolveLocale, type Locale } from './locales'

/** Locales already fetched, so a second switch back is instant. */
const loaded = new Set<Locale>()

/** The loads started, finished or not; a failed one is removed so a later switch retries it. */
const inFlight = new Map<Locale, Promise<void>>()

/**
 * One loader per language, English included.
 *
 * English used to be imported statically and rode in the entry chunk: about
 * 100 kB raw (25 kB compressed) that every visitor downloaded, so a German
 * page cost English *and* German (measured 28 Nov 2026). Now each language
 * is a chunk of its own, and `scripts/prerender.mjs` writes a
 * `modulepreload` for the page's language into every prerendered page,
 * English included, so the file is fetched in parallel with the entry and not
 * after it has run.
 *
 * Written out rather than built from a template literal, so that each file is
 * a chunk the Vite manifest names by its source path — the prerender looks the
 * preloads up by that name.
 */
const LOADERS: Record<Locale, () => Promise<{ default: unknown }>> = {
  en: () => import('./messages/en.json'),
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
 * English is no longer in the entry, so a failed language fetches it here
 * before resolving. One request per language however often it is asked for:
 * the missing-key path below can ask many times in one render.
 */
function loadLocale(locale: Locale): Promise<void> {
  let pending = inFlight.get(locale)
  if (!pending) {
    pending = (async () => {
      try {
        const mod = await LOADERS[locale]()
        i18next.addResourceBundle(locale, 'translation', mod.default, true, true)
        loaded.add(locale)
      } catch (e) {
        console.error(`could not load the ${locale} translation; staying on ${i18next.language}`, e)
        inFlight.delete(locale)
        if (locale !== DEFAULT_LOCALE) await loadLocale(DEFAULT_LOCALE)
      }
    })()
    inFlight.set(locale, pending)
  }
  return pending
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
 * `lang` is what a screen reader picks its pronunciation from. The title is
 * not set here any more: every routed page owns its own through
 * `usePageMeta`, which re-runs on a language change. When this module also
 * wrote `meta.title` after `changeLanguage`, the two raced and the page's
 * title lost.
 */
function reflectLocale(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

/** Switch language, remember it, and fetch the messages if this is the first time. */
export async function setLocale(locale: Locale): Promise<void> {
  await loadLocale(locale)
  await i18next.changeLanguage(locale)
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* not worth failing over */ }
  reflectLocale(locale)
}

/**
 * The language this page load starts in.
 *
 * A language in the URL wins. `/de/learn` is the German page — prerendered
 * that way, linked that way from every search result and hreflang tag — so
 * the app opens in German there whatever the browser or storage says. With
 * no prefix, the stored or browser language applies.
 *
 * Decided here, in one place, rather than started from storage and then
 * corrected by `main.tsx`: that version fired two `setLocale` calls that did
 * not wait for each other, and on `/de/…` with French stored the page ended
 * in whichever language's file arrived last.
 */
function startingLocaleOf(): Locale {
  const fromUrl = typeof window === 'undefined' ? null : localeFromPath(window.location.pathname)
  return fromUrl?.locale ?? initialLocale()
}

const startingLocale = startingLocaleOf()

/**
 * English as the fallback, fetched only when it is needed.
 *
 * Every language carries every key (`messages.test.ts` fails the build
 * otherwise), so a German visitor never needs English and no longer downloads
 * it. Should a key be missing anyway, i18next reports it here and the English
 * file is fetched; when it lands (`bindI18nStore: 'added'` below) every
 * translated component renders again and the key path gives way to English.
 */
function onMissingKey(): void {
  if (!loaded.has(DEFAULT_LOCALE)) void loadLocale(DEFAULT_LOCALE)
}

void i18next
  .use(initReactI18next)
  .init({
    // No bundle up front: every language, English too, arrives through
    // `loadLocale`, and `main.tsx` waits for it before the first render.
    resources: {},
    partialBundledLanguages: true,
    saveMissing: true,
    missingKeyHandler: onMissingKey,
    react: { bindI18nStore: 'added' },
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

/**
 * Resolves once the starting language's messages are registered.
 *
 * The chosen language may not be English, in which case its file still has to
 * arrive. Nothing in this module waits for it — a component that renders
 * meanwhile renders English — but `main.tsx` does, before the first render:
 * the page under it is either already on screen (prerendered) or a dark shell,
 * and in both cases waiting a few tens of milliseconds for the right words
 * beats drawing the wrong ones and swapping them. That swap was visible on
 * the live site as an English page, and an English loading screen, turning
 * German.
 *
 * English is waited for the same way now that it is a chunk of its own, but
 * through `loadLocale` and not `setLocale`: starting in English must not
 * store "English" as a choice, or a visitor whose browser language changes
 * later would stay pinned to it.
 *
 * Never rejects: a language that fails to load leaves English up.
 */
export const localeReady: Promise<void> =
  startingLocale !== DEFAULT_LOCALE
    ? setLocale(startingLocale)
    : loadLocale(DEFAULT_LOCALE).then(() => i18next.changeLanguage(DEFAULT_LOCALE)).then(() => undefined)
reflectLocale(startingLocale)

/**
 * Whether any messages are registered yet — the starting language's or
 * English. Before that, a render would show key paths; `main.tsx` asks before
 * it lets a time cap overrule {@link localeReady}.
 */
export function messagesLoaded(): boolean {
  return loaded.size > 0
}

/**
 * The locale the app is currently showing, normalised to a supported one.
 *
 * For module-level formatters that have no component to take `i18n.language`
 * from. Components that already hold `i18n` should keep using it — this exists
 * so a helper defined at module scope is not forced into `'en-US'`, which is
 * what nine of them had settled for.
 */
export function activeLocale(): Locale {
  return resolveLocale(i18next.language)
}

export default i18next
