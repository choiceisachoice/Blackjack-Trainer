import type { ReactNode } from 'react'
import { CookieSettingsLink } from './CookieBanner'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Spade } from 'lucide-react'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SocialLinks } from './SocialLinks'
import { PublicNavMenu } from './PublicNavMenu'

/**
 * Where every "Start free" goes: the sign-up side of `/login`. A query, not
 * router state, so the link already says so in the prerendered HTML, before
 * the script has arrived.
 */
const SIGNUP_LINK = { pathname: '/login', search: '?mode=signup' }

interface PublicShellProps {
  children: ReactNode
  /** The way in at the end of the page. On by default; the chart page keeps it. */
  cta?: boolean
  /** Test id on the outer element, so a page can be told apart in a test. */
  testId?: string
}

/**
 * The frame around every public page that is not the landing: the wordmark,
 * the language menu, a way in, and a footer with the legal links.
 *
 * One component rather than a copy per page, so `/learn`, the eight chapter
 * pages and the strategy chart cannot drift apart in what they offer a
 * visitor who arrived from a search result — the header is the only
 * navigation such a visitor has.
 */
export function PublicShell({ children, cta = true, testId = 'public-shell' }: PublicShellProps) {
  const { t } = useTranslation()
  return (
    <div className="app-canvas min-h-screen text-content" data-testid={testId}>
      <header className="sticky top-0 z-30 border-b border-contrast/8 bg-surface/80 backdrop-blur-md">
        {/* Tighter below sm: at 360px the German bar ("Anmelden", "Kostenlos
            starten") needed 366px and the page scrolled sideways by six. */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <Link to="/" className="flex items-center gap-2 min-h-10 font-bold shrink-0" data-testid="learn-home">
            <span className="grid place-items-center w-8 h-8 rounded-lg text-gold bg-gold/10 border border-gold/20">
              <Spade size={16} className="fill-current" />
            </span>
            <span className="hidden sm:inline">{t('landing.brand')}</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-5 text-sm text-content/70 min-w-0">
            <Link to="/learn" className="hidden sm:inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.learn')}</Link>
            <Link to="/strategy-chart" className="hidden sm:inline-flex items-center min-h-10 hover:text-content">{t('nav.modes.strategyChart')}</Link>
            <LanguageSwitcher />
            <Link to="/login" className="hidden sm:inline-flex items-center min-h-10 hover:text-content px-1 whitespace-nowrap">{t('landing.nav.signIn')}</Link>
            {/* Below sm: Learn, the chart and Sign in behind one button. */}
            <PublicNavMenu className="sm:hidden" />
            <Link
              to={SIGNUP_LINK}
              className="rounded-lg px-3 sm:px-4 py-2.5 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold whitespace-nowrap"
              data-testid="learn-start"
            >
              {t('landing.nav.startFree')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="py-8 md:py-12">
        {children}

        {cta && (
          <section className="max-w-2xl mx-auto px-4 md:px-6 mt-10">
            <div className="surface rounded-2xl p-6 md:p-8 text-center">
              <h2 className="text-xl md:text-2xl font-extrabold">{t('learn.cta.title')}</h2>
              <p className="mt-2 text-sm text-content/60 max-w-[52ch] mx-auto">{t('learn.cta.body')}</p>
              <Link
                to={SIGNUP_LINK}
                className="inline-block mt-5 rounded-xl px-6 py-3 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold"
              >
                {t('landing.hero.ctaStart')}
              </Link>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-contrast/8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-content/50">
          <span>{t('landing.footer.note')}</span>
          {/* Wraps: seven links do not fit one row on a phone. Each is 40px
              tall to the finger and one line to the eye. The chart and the
              ten free hands are here because they are the two things a
              visitor can use without an account. */}
          <nav className="flex flex-wrap items-center gap-x-5">
            <Link to="/" className="inline-flex items-center min-h-10 hover:text-content">{t('common.backToHome')}</Link>
            <Link to="/strategy-chart" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.strategyChart')}</Link>
            <Link to="/try" className="inline-flex items-center min-h-10 hover:text-content" data-testid="footer-try">{t('landing.footer.try')}</Link>
            <Link to="/terms" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.terms')}</Link>
            <Link to="/privacy" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.privacy')}</Link>
            <Link to="/contact" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.contact')}</Link>
            <CookieSettingsLink className="inline-flex items-center min-h-10 hover:text-content" />
          </nav>
          <SocialLinks />
        </div>
      </footer>
    </div>
  )
}
