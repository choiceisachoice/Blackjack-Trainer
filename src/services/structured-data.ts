import type { Translate } from '../i18n/translate'
import { SITE_ORIGIN } from '../hooks/use-page-meta'

/** How many FAQ pairs the Learn page carries — `learn.faq.q1` … `q7`. */
export const FAQ_COUNT = 7

/**
 * The Learn page's FAQ as schema.org `FAQPage`.
 *
 * The same seven questions the page prints, read through the same
 * translator, so the structured data can never say something the page does
 * not. Google may show these as expandable answers under the result.
 *
 * @param t - Translator for the reader's language
 */
export function faqJsonLd(t: Translate): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: Array.from({ length: FAQ_COUNT }, (_, i) => ({
      '@type': 'Question',
      name: t(`learn.faq.q${i + 1}`),
      acceptedAnswer: { '@type': 'Answer', text: t(`learn.faq.a${i + 1}`) },
    })),
  }
}

/**
 * The site and the product, for the landing page.
 *
 * No `offers`: the prices come from Stripe at runtime and are deliberately
 * not written anywhere else, so a price here would be exactly the drift that
 * was removed from the paywall in August.
 *
 * @param t - Translator for the reader's language
 */
export function siteJsonLd(t: Translate): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: t('landing.brand'),
        description: t('meta.description'),
        inLanguage: ['en', 'de', 'fr', 'it', 'es', 'pt', 'tr'],
      },
      {
        '@type': 'SoftwareApplication',
        name: t('landing.brand'),
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        url: `${SITE_ORIGIN}/`,
        description: t('meta.description'),
      },
    ],
  }
}
