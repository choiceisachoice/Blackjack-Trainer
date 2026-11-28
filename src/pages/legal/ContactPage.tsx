import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Mail, AlertTriangle, Building2 } from 'lucide-react'
import { LEGAL_META as M, hasUnsetPlaceholders } from './legal-meta'
import { legalLocation } from './legal-locale'
import { resolveLocale } from '../../i18n/locales'
import { usePageMeta } from '../../hooks/use-page-meta'
import { PublicShell } from '../../components/common/PublicShell'

/**
 * Contact and imprint. Deliberately a plain address, not a form: a form that
 * posts somewhere would need mail infrastructure we don't have here, and a
 * mailto is honest and works today.
 *
 * Every fact on it — operator, address, mail — comes from `legal-meta.ts`,
 * the same source the Terms read, so the imprint cannot say something the
 * Terms do not. Framed by `PublicShell` like the chart and the chapters: the
 * page was titled "Contact & Imprint" in the head and showed a lone address
 * with no way on but "back".
 */
export function ContactPage() {
  const { t, i18n } = useTranslation()
  usePageMeta('contact', '/contact')
  const draft = hasUnsetPlaceholders()
  const email = M.contactEmail
  const locale = resolveLocale(i18n.language)
  // "Neuhausweg 5, 8810 Horgen, Schweiz" → one line each, country in the
  // reader's language (as the translated Terms write it).
  const address = (locale === 'en' ? M.operatorLocation : legalLocation(locale)).split(', ')

  return (
    <PublicShell cta={false} testId="contact-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <header className="max-w-[40em]">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">{t('contact.title')}</h1>
          <p className="mt-2 text-content/60">{t('contact.intro')}</p>
        </header>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section className="surface rounded-2xl p-6 md:p-7 flex flex-col" aria-labelledby="contact-mail">
            <h2 id="contact-mail" className="text-xs font-bold tracking-[0.16em] uppercase text-content/45">{t('contact.emailUs')}</h2>
            {draft ? (
              <div className="mt-3 inline-flex items-center gap-2 text-warning text-sm">
                {/* Untranslated on purpose — see LegalPage: a deploy-time
                    warning, shown only while `legal-meta.ts` is unfilled. */}
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <AlertTriangle size={16} /> Set your contact address in <code>legal-meta.ts</code>
              </div>
            ) : (
              <a
                href={`mailto:${email}`}
                className="mt-3 inline-flex items-center gap-2.5 text-lg md:text-xl font-semibold text-gold hover:text-gold-bright break-all"
              >
                <Mail size={20} className="shrink-0" /> {email}
              </a>
            )}
            <p className="mt-4 text-sm text-content/55" data-testid="contact-privacy-note">
              {/* The link sits mid-sentence, and where in the sentence differs by
                  language — so the position comes from the translation, not from
                  a fragment glued either side of it. */}
              <Trans
                i18nKey="contact.dataRequests"
                components={{
                  pp: <Link to="/privacy" className="text-content/75 hover:text-content underline underline-offset-2" />,
                }}
              />
            </p>
          </section>

          <section className="surface rounded-2xl p-6 md:p-7" aria-labelledby="contact-imprint" data-testid="contact-imprint">
            <h2 id="contact-imprint" className="text-xs font-bold tracking-[0.16em] uppercase text-content/45">{t('contact.imprintTitle')}</h2>
            <div className="mt-3 flex gap-3">
              <Building2 size={20} className="shrink-0 mt-0.5 text-gold" />
              <address className="not-italic text-content leading-relaxed">
                <span className="block font-semibold">{M.operator}</span>
                {address.map(line => <span key={line} className="block text-content/70">{line}</span>)}
              </address>
            </div>
            <p className="mt-4 text-sm text-content/55">
              {t('contact.emailLabel')}: <span className="text-content/75 break-all">{draft ? '—' : email}</span>
            </p>
          </section>
        </div>
      </div>
    </PublicShell>
  )
}
