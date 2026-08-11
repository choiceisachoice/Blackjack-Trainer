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
