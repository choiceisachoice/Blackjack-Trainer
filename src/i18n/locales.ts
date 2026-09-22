/**
 * The languages this app is offered in.
 *
 * The same seven as Origin Voice (`web/src/i18n/routing.ts`), deliberately: two
 * products from the same operator that disagree about which languages exist
 * would be a support question nobody wants to answer twice.
 *
 * Order here is the order in the switcher. English first because it is the
 * source language and the fallback — everything else is a translation of it,
 * and a missing key lands there.
 */
import { LEARN_TOPIC_PATHS } from '../services/learn-topics'

export const LOCALES = ['en', 'de', 'fr', 'it', 'es', 'pt', 'tr'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Each language named in itself.
 *
 * Not "German" but "Deutsch": someone looking for their own language scans for
 * the word they would use, and a list written in English is only readable by
 * the people who least need it.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  pt: 'Português',
  tr: 'Türkçe',
}

/** Where the chosen language is remembered. */
export const LOCALE_STORAGE_KEY = 'bjt_locale'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Narrow anything the browser or storage offers to a language we actually have.
 *
 * Accepts a region tag: a browser reporting `de-CH`, `pt-BR` or `en-GB` wants
 * German, Portuguese and English respectively, and refusing all three because
 * of the suffix would put a Swiss visitor on the English site for no reason.
 */
export function resolveLocale(requested: string | null | undefined): Locale {
  if (!requested) return DEFAULT_LOCALE
  const base = requested.toLowerCase().split(/[-_]/)[0]
  return isLocale(base) ? base : DEFAULT_LOCALE
}

/**
 * The public routes that exist in every language, at `/<locale><path>`.
 *
 * English lives at the root and the six others under a prefix: `/learn` and
 * `/de/learn` are the same page in two languages, each with its own
 * canonical URL, so a search engine can offer a German reader the German
 * one. The app routes are not on this list — `/de/app` still works, because
 * the router treats the prefix as its base, but there is nothing there for
 * a crawler and the URL a person shares is the unprefixed one.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  '/learn',
  ...LEARN_TOPIC_PATHS,
  '/strategy-chart',
  '/terms',
  '/privacy',
  '/contact',
]

/**
 * Read a language prefix off a pathname.
 *
 * `/de/learn` → `{ locale: 'de', basename: '/de' }`; `/learn` and `/` → null.
 * `/deck` is not German: the prefix has to be a whole segment.
 *
 * @param pathname - `window.location.pathname` or equivalent
 */
export function localeFromPath(pathname: string): { locale: Locale; basename: string } | null {
  const m = /^\/([a-z]{2})(?=\/|$)/.exec(pathname)
  if (!m || !isLocale(m[1]) || m[1] === DEFAULT_LOCALE) return null
  return { locale: m[1], basename: `/${m[1]}` }
}

/**
 * The URL of a public page in a given language.
 *
 * @param path - One of {@link PUBLIC_PATHS}
 * @param locale - The language wanted
 * @returns `/learn` for English, `/de/learn` for German; `/` and `/de` for the landing
 */
export function localizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

/**
 * Strip the language prefix, if any, and say whether what is left is public.
 *
 * @param pathname - The current pathname, prefix included
 * @returns The unprefixed path when it is a public page, else null
 */
export function publicPathOf(pathname: string): string | null {
  const prefix = localeFromPath(pathname)
  let rest = prefix ? pathname.slice(prefix.basename.length) : pathname
  if (rest === '') rest = '/'
  if (rest.length > 1 && rest.endsWith('/')) rest = rest.slice(0, -1)
  return PUBLIC_PATHS.includes(rest) ? rest : null
}
