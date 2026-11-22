import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales'
import type { TranslatedLocale } from './legal-locale'
import type { LegalDoc } from './legal-types'
import { PRIVACY_DOC } from './privacy-content'
import { TERMS_DOC } from './terms-content'
import { PRIVACY_DE } from './translations/privacy.de'
import { PRIVACY_ES } from './translations/privacy.es'
import { PRIVACY_FR } from './translations/privacy.fr'
import { PRIVACY_IT } from './translations/privacy.it'
import { PRIVACY_PT } from './translations/privacy.pt'
import { PRIVACY_TR } from './translations/privacy.tr'
import { TERMS_DE } from './translations/terms.de'
import { TERMS_ES } from './translations/terms.es'
import { TERMS_FR } from './translations/terms.fr'
import { TERMS_IT } from './translations/terms.it'
import { TERMS_PT } from './translations/terms.pt'
import { TERMS_TR } from './translations/terms.tr'

/**
 * The legal documents in every language the site runs in.
 *
 * English (`privacy-content.ts`, `terms-content.ts`) is the original and the
 * legally binding text. The six others are translations for convenience, one
 * file per document per language under `translations/`, each a `LegalDoc` of
 * exactly the same shape — `legal-translations.test.ts` fails if a section, a
 * bullet or a fact goes missing from any of them.
 *
 * Imported statically, not per language on demand: the pages are prerendered
 * with `renderToString`, which cannot wait, and the client swaps the
 * prerendered markup in one synchronous commit. The cost stays inside the
 * legal pages' own chunk.
 */

/** Which legal document. Also its route: `/privacy`, `/terms`. */
export type LegalKind = 'privacy' | 'terms'

/** Partial on purpose: a language without a translation falls back to English. */
const DOCS: Record<LegalKind, Partial<Record<Locale, LegalDoc>>> = {
  privacy: {
    en: PRIVACY_DOC, de: PRIVACY_DE, fr: PRIVACY_FR, it: PRIVACY_IT, es: PRIVACY_ES, pt: PRIVACY_PT, tr: PRIVACY_TR,
  },
  terms: {
    en: TERMS_DOC, de: TERMS_DE, fr: TERMS_FR, it: TERMS_IT, es: TERMS_ES, pt: TERMS_PT, tr: TERMS_TR,
  },
}

const ENGLISH: Record<LegalKind, LegalDoc> = { privacy: PRIVACY_DOC, terms: TERMS_DOC }

/**
 * Whether a document exists in a language as a translation.
 *
 * False for English (it is the original) and for a language that has no
 * translation yet — in both cases the reader is shown the English text and
 * needs no "this is a translation" notice.
 */
export function isLegalTranslation(kind: LegalKind, locale: Locale): locale is TranslatedLocale {
  return locale !== DEFAULT_LOCALE && DOCS[kind][locale] !== undefined
}

/**
 * A legal document in the reader's language, or in English if there is none.
 *
 * @param kind - Privacy Policy or Terms of Use
 * @param locale - The active language
 */
export function legalDoc(kind: LegalKind, locale: Locale): LegalDoc {
  return DOCS[kind][locale] ?? ENGLISH[kind]
}

/** The route of a document, which is also where its English original lives. */
export function legalPath(kind: LegalKind): string {
  return `/${kind}`
}

/**
 * The notice at the top of every translated legal page.
 *
 * Three parts because the link sits mid-sentence and where it sits differs
 * by language: text before, the link's own words, text after. It lives here
 * with the translations, not in the UI message files, because it is part of
 * what a lawyer reviews together with them.
 */
export interface TranslationNotice {
  readonly before: string
  readonly link: string
  readonly after: string
}

export const TRANSLATION_NOTICE: Record<TranslatedLocale, TranslationNotice> = {
  de: {
    before: 'Diese Übersetzung dient nur deiner Orientierung. Bei Abweichungen gilt die ',
    link: 'englische Fassung',
    after: '.',
  },
  fr: {
    before: 'Cette traduction est fournie pour votre commodité. En cas de divergence, la ',
    link: 'version anglaise',
    after: ' fait foi.',
  },
  it: {
    before: 'Questa traduzione è fornita per tua comodità. In caso di differenze prevale la ',
    link: 'versione inglese',
    after: '.',
  },
  es: {
    before: 'Esta traducción se ofrece para tu comodidad. En caso de discrepancia prevalece la ',
    link: 'versión en inglés',
    after: '.',
  },
  pt: {
    before: 'Esta tradução é disponibilizada para sua conveniência. Em caso de divergência prevalece a ',
    link: 'versão em inglês',
    after: '.',
  },
  tr: {
    before: 'Bu çeviri kolaylık sağlamak amacıyla sunulmuştur. Farklılık olması halinde ',
    link: 'İngilizce sürüm',
    after: ' geçerlidir.',
  },
}
