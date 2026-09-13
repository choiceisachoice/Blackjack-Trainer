import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Spade } from 'lucide-react'
import { LearnPage } from '../components/learn/LearnPage'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { JsonLd } from '../components/common/JsonLd'
import { faqJsonLd } from '../services/structured-data'
import { usePageMeta } from '../hooks/use-page-meta'

/**
 * `/learn` — the theory, outside the login.
 *
 * The Learn page lived only inside the app, behind `ProtectedRoute`, which
 * meant the one part of the product that answers the questions people
 * actually search for — how the Hi-Lo count works, what a true count is,
 * what the Illustrious 18 are — was invisible to every search engine. The
 * landing is a product page; this is the content.
 *
 * Same component as inside the app, so the two cannot drift. Every topic
 * starts open here: a collapsed topic is not in the DOM, and what is not in
 * the DOM is not indexed. The wrapper is the landing's shell — wordmark,
 * language, a way in — so a reader who arrived from a search result can
 * start training without going back to the home page first.
 */
export function LearnPublicPage() {
  const { t } = useTranslation()
  usePageMeta('learn', '/learn')

  return (
    <div className="app-canvas min-h-screen text-content" data-testid="learn-public">
      <header className="sticky top-0 z-30 border-b border-contrast/8 bg-surface/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold" data-testid="learn-home">
            <span className="grid place-items-center w-8 h-8 rounded-lg text-gold bg-gold/10 border border-gold/20">
              <Spade size={16} className="fill-current" />
            </span>
            <span className="hidden sm:inline">{t('landing.brand')}</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-5 text-sm text-content/70">
            <LanguageSwitcher />
            <Link to="/login" className="hover:text-content">{t('landing.nav.signIn')}</Link>
            <Link
              to="/login"
              className="rounded-lg px-3.5 sm:px-4 py-2.5 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold whitespace-nowrap"
              data-testid="learn-start"
            >
              {t('landing.nav.startFree')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="py-8 md:py-12">
        <JsonLd data={faqJsonLd(t)} />
        <LearnPage openAll />

        {/* The way in, at the point where the reading ends. */}
        <section className="max-w-2xl mx-auto px-4 md:px-6">
          <div className="surface rounded-2xl p-6 md:p-8 text-center">
            <h2 className="text-xl md:text-2xl font-extrabold">{t('learn.cta.title')}</h2>
            <p className="mt-2 text-sm text-content/60 max-w-[52ch] mx-auto">{t('learn.cta.body')}</p>
            <Link
              to="/login"
              className="inline-block mt-5 rounded-xl px-6 py-3 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold"
            >
              {t('landing.hero.ctaStart')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-contrast/8">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-content/50">
          <span>{t('landing.footer.note')}</span>
          <nav className="flex items-center gap-5">
            <Link to="/" className="hover:text-content">{t('common.backToHome')}</Link>
            <Link to="/terms" className="hover:text-content">{t('landing.footer.terms')}</Link>
            <Link to="/privacy" className="hover:text-content">{t('landing.footer.privacy')}</Link>
            <Link to="/contact" className="hover:text-content">{t('landing.footer.contact')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
