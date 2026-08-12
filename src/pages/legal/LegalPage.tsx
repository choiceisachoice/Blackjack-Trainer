import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spade, ArrowLeft, AlertTriangle } from 'lucide-react'
import type { LegalDoc } from './legal-types'
import { LEGAL_META, hasUnsetPlaceholders } from './legal-meta'

/**
 * Shared layout for the Terms and Privacy pages. Renders a {@link LegalDoc}
 * as readable long-form prose on the app canvas, with a back link and cross
 * links between the legal pages.
 *
 * While any `[SET: …]` placeholder remains in `legal-meta`, a banner makes that
 * unmistakable, so a draft can be reviewed in place without being mistaken for
 * a finished, published policy.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation()
  const draft = hasUnsetPlaceholders()

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
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
            <p className="text-content/80">
              <span className="font-semibold text-warning">{t('legal.draft')}</span>{' '}
              Some details in <code className="text-content/70">legal-meta.ts</code> still need to be filled in
              (operator name, contact address, region) before this page is final.
            </p>
          </div>
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

        <footer className="mt-14 pt-6 border-t border-white/8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-content/55">
          <Link to="/terms" className="hover:text-content">{t('contact.terms')}</Link>
          <Link to="/privacy" className="hover:text-content">{t('contact.privacy')}</Link>
          <Link to="/contact" className="hover:text-content">{t('contact.title')}</Link>
          <span className="ml-auto text-content/40">{t('legal.updated', { date: LEGAL_META.lastUpdated })}</span>
        </footer>
      </div>
    </div>
  )
}
