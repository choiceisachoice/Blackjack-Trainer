import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spade, ArrowLeft, AlertTriangle, Languages } from 'lucide-react'
import { LOCALE_STORAGE_KEY, resolveLocale } from '../../i18n/locales'
import { hasUnsetPlaceholders } from './legal-meta'
import { legalDate } from './legal-locale'
import { TRANSLATION_NOTICE, isLegalTranslation, legalDoc, legalPath, type LegalKind } from './legal-docs'
import { SocialLinks } from '../../components/common/SocialLinks'

/**
 * Shared layout for the Terms and Privacy pages. Renders a `LegalDoc`
 * as readable long-form prose on the app canvas, with a back link and cross
 * links between the legal pages.
 *
 * The document is chosen by the active language (`legalDoc`): English is the
 * original, the six others are translations, and a language without one
 * falls back to English. A translated page opens with a notice saying so and
 * pointing at the English text, which is the binding one; the English page
 * carries no such notice.
 *
 * While any `[SET: …]` placeholder remains in `legal-meta`, a banner makes that
 * unmistakable, so a draft can be reviewed in place without being mistaken for
 * a finished, published policy.
 */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, i18n } = useTranslation()
  const draft = hasUnsetPlaceholders()
  const locale = resolveLocale(i18n.language)
  const doc = legalDoc(kind, locale)
  const notice = isLegalTranslation(kind, locale) ? TRANSLATION_NOTICE[locale] : null
  // The date belongs to the text on the page: a language that fell back to
  // the English document shows the English date with it.
  const updated = legalDate(notice ? locale : 'en')

  /*
    The English page is at the unprefixed URL, outside this router's basename
    (`/de`), so this is a plain link and a full navigation. An unprefixed URL
    is drawn in the reader's stored language, though — without the line below
    "English version" would load `/privacy` and turn it German again. Storing
    the choice first is what the language switcher does; done on the click
    itself rather than by taking the navigation over, so opening the link in
    a new tab works the same way.
  */
  const rememberEnglish = () => {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, 'en') } catch { /* the link still works */ }
  }

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <Link to="/" className="inline-flex items-center gap-2 min-h-10 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> {t('common.backToHome')}
        </Link>

        <header className="mt-8 flex flex-col items-center text-center">
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-4">
            <Spade size={22} className="fill-current" />
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">{doc.title}</h1>
          <p className="mt-2 text-sm text-content/50 max-w-[52ch]">{doc.intro}</p>
        </header>

        {draft && (
          <div className="mt-8 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            {/* Untranslated on purpose: this banner only renders while
                `legal-meta.ts` still holds placeholders, i.e. never in
                production. It addresses whoever is deploying, not a reader. */}
            {/* eslint-disable i18next/no-literal-string */}
            <p className="text-content/80">
              <span className="font-semibold text-warning">{t('legal.draft')}</span>{' '}
              Some details in <code className="text-content/70">legal-meta.ts</code> still need to be filled in
              (operator name, contact address, region) before this page is final.
            </p>
            {/* eslint-enable i18next/no-literal-string */}
          </div>
        )}

        {notice && (
          <p
            lang={locale}
            data-testid="legal-translation-notice"
            className="mt-8 flex items-start gap-3 rounded-xl border border-contrast/12 bg-contrast/5 p-4 text-sm text-content/75"
          >
            <Languages size={18} className="text-gold/80 shrink-0 mt-0.5" aria-hidden />
            <span>
              {notice.before}
              <a
                href={legalPath(kind)}
                hrefLang="en"
                onClick={rememberEnglish}
                className="font-semibold text-content underline underline-offset-2 hover:text-gold"
              >
                {notice.link}
              </a>
              {notice.after}
            </span>
          </p>
        )}

        <div className="mt-10 flex flex-col gap-8">
          {doc.sections.map(section => (
            <section key={section.heading}>
              <h2 className="text-lg font-bold tracking-tight">{section.heading}</h2>
              <div className="mt-2.5 flex flex-col gap-3 text-[0.95rem] text-content/70 leading-relaxed">
                {section.blocks.map((block, i) =>
                  typeof block === 'string' ? (
                    <p key={i}>{block}</p>
                  ) : (
                    <ul key={i} className="flex flex-col gap-2 pl-1">
                      {block.list.map((item, j) => (
                        <li key={j} className="flex gap-2.5 items-start">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gold/70 shrink-0" aria-hidden />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-14 pt-4 border-t border-white/8 flex flex-wrap items-center gap-x-5 text-sm text-content/55">
          {/* 40px to the finger: three legal links at 20px each were the
              smallest targets on the page. */}
          <Link to="/terms" className="inline-flex items-center min-h-10 hover:text-content">{t('contact.terms')}</Link>
          <Link to="/privacy" className="inline-flex items-center min-h-10 hover:text-content">{t('contact.privacy')}</Link>
          <Link to="/contact" className="inline-flex items-center min-h-10 hover:text-content">{t('contact.title')}</Link>
          <span className="ml-auto text-content/40">{t('legal.updated', { date: updated })}</span>
          <SocialLinks className="basis-full mt-3" />
        </footer>
      </div>
    </div>
  )
}
