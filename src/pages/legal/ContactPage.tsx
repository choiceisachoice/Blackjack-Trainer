import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Spade, ArrowLeft, Mail, AlertTriangle } from 'lucide-react'
import { LEGAL_META as M, hasUnsetPlaceholders } from './legal-meta'

/**
 * Contact page. Deliberately a plain address, not a form: a form that posts
 * somewhere would need mail infrastructure we don't have here, and a mailto is
 * honest and works today. The address comes from the shared legal-meta so it
 * stays in step with the Terms and Privacy pages.
 */
export function ContactPage() {
  const { t } = useTranslation()
  const draft = hasUnsetPlaceholders()
  const email = M.contactEmail

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> Back to home
        </Link>

        <header className="mt-8 flex flex-col items-center text-center">
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-4">
            <Spade size={22} className="fill-current" />
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">{t('contact.title')}</h1>
          <p className="mt-2 text-sm text-content/50 max-w-[46ch]">
            Questions, feedback, a problem with your account or a privacy request — we read every message.
          </p>
        </header>

        <div className="surface rounded-2xl p-6 md:p-7 mt-10 text-center">
          <div className="text-xs font-bold tracking-[0.16em] uppercase text-content/45">{t('contact.emailUs')}</div>
          {draft ? (
            <div className="mt-3 inline-flex items-center gap-2 text-warning text-sm">
              <AlertTriangle size={16} /> Set your contact address in <code>legal-meta.ts</code>
            </div>
          ) : (
            <a
              href={`mailto:${email}`}
              className="mt-3 inline-flex items-center gap-2.5 text-lg md:text-xl font-semibold text-gold hover:text-gold-bright"
            >
              <Mail size={20} /> {email}
            </a>
          )}
          <p className="mt-4 text-sm text-content/50 max-w-[44ch] mx-auto">
            For data-protection requests (access, correction or deletion of your data), use the same address —
            see the <Link to="/privacy" className="text-content/70 hover:text-content underline underline-offset-2">{t('contact.privacy')}</Link>.
          </p>
        </div>

        <footer className="mt-12 pt-6 border-t border-white/8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-content/55">
          <Link to="/terms" className="hover:text-content">{t('contact.terms')}</Link>
          <Link to="/privacy" className="hover:text-content">{t('contact.privacy')}</Link>
          <Link to="/contact" className="hover:text-content">{t('contact.title')}</Link>
        </footer>
      </div>
    </div>
  )
}
