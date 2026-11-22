import type { Locale } from '../../i18n/locales'
import { LEGAL_META, formatLegalDate } from './legal-meta'

/**
 * How the legal facts are written in each language.
 *
 * The translated Terms and Privacy Policy must not carry facts of their own:
 * the date, the address, the governing law and the VAT rate all come from
 * `legal-meta.ts` (and `pro-features.ts` for the rate). What a language does
 * need is its own *spelling* of them — "18. November 2026", "Schweiz",
 * "8,1" — and that is all this module adds.
 */

/** A language the documents are translated into; English is the original. */
export type TranslatedLocale = Exclude<Locale, 'en'>

/**
 * The regional format each language's legal pages use for dates and numbers.
 *
 * The operator is Swiss, so the three Swiss languages take their Swiss form
 * (`de-CH` writes 8.1, not 8,1). English takes the British day-month-year
 * order the original was written in.
 */
export const LEGAL_LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-GB',
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  es: 'es-ES',
  pt: 'pt-PT',
  tr: 'tr-TR',
}

/** The documents' last-updated date, in a language's own date format. */
export function legalDate(locale: Locale): string {
  return formatLegalDate(LEGAL_LOCALE_TAGS[locale])
}

/** A number (the VAT rate) with the language's own decimal mark. */
export function legalNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(LEGAL_LOCALE_TAGS[locale]).format(value)
}

/**
 * Country names, and the phrase for "the laws of <country>", per language.
 *
 * Keyed by the English name `legal-meta.ts` uses. A country that is not in
 * this table throws at module load, on purpose: if the operator moves or the
 * governing law changes, the translations must be extended here rather than
 * silently go on saying "Schweiz".
 */
const COUNTRIES: Record<string, Record<TranslatedLocale, { name: string; law: string }>> = {
  Switzerland: {
    de: { name: 'Schweiz', law: 'schweizerischem Recht' },
    fr: { name: 'Suisse', law: 'le droit suisse' },
    it: { name: 'Svizzera', law: 'diritto svizzero' },
    es: { name: 'Suiza', law: 'las leyes de Suiza' },
    pt: { name: 'Suíça', law: 'direito suíço' },
    tr: { name: 'İsviçre', law: 'İsviçre hukukuna' },
  },
}

function country(english: string, locale: TranslatedLocale): { name: string; law: string } {
  const entry = COUNTRIES[english]
  if (!entry) throw new Error(`legal-locale: no translation for the country "${english}" — add it to COUNTRIES`)
  return entry[locale]
}

/**
 * The operator's address with the country named in the reader's language.
 *
 * Street, postcode and town are left exactly as `legal-meta.ts` has them.
 */
export function legalLocation(locale: TranslatedLocale): string {
  const parts = LEGAL_META.operatorLocation.split(', ')
  const last = parts[parts.length - 1]
  return [...parts.slice(0, -1), country(last, locale).name].join(', ')
}

/**
 * The governing law as the phrase each translation's sentence takes
 * ("unterstehen schweizerischem Recht", "sont régies par le droit suisse").
 */
export function legalGoverningLaw(locale: TranslatedLocale): string {
  return country(LEGAL_META.governingLaw, locale).law
}
