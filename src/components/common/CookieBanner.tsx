import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getConsent, setConsent, clearConsent, onConsentChanged } from '../../services/analytics/consent-choice'
import { consentQuestionApplies } from '../../services/analytics/consent'

/**
 * The one question the site asks a visitor: may we count your visit?
 *
 * A bar along the bottom, not a wall across the page: the page stays readable
 * and usable while it is there, and nothing is counted until it is answered.
 * Two buttons of the same size and weight — a "decline" that is harder to
 * find than "accept" is not a choice.
 *
 * Asked once per device. It is not rendered on the server and not on the
 * first client render either (`getServerSnapshot` says "answered"), so a
 * prerendered page never ships the bar to someone who answered last month.
 */
export function CookieBanner() {
  const { t } = useTranslation()
  const consent = useSyncExternalStore(onConsentChanged, getConsent, () => 'declined' as const)
  const applies = useSyncExternalStore(() => () => {}, consentQuestionApplies, () => false)

  if (!applies || consent !== null) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('consent.title')}
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-5 sm:pb-5 pointer-events-none"
    >
      <div
        className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-contrast/12 bg-[var(--color-surface-2)]
          shadow-[0_18px_50px_-12px_rgba(0,0,0,.85)] p-4 sm:p-5
          flex flex-col sm:flex-row sm:items-center gap-4"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-content">{t('consent.title')}</h2>
          <p className="mt-1 text-sm text-content/65 leading-relaxed">
            {t('consent.body')}{' '}
            <Link to="/privacy" className="underline underline-offset-2 text-content/80 hover:text-gold">
              {t('consent.more')}
            </Link>
          </p>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <button
            onClick={() => setConsent('declined')}
            data-testid="cookie-decline"
            className="flex-1 sm:flex-none min-w-28 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer
              border border-contrast/20 text-content hover:border-gold/50 transition-colors"
          >
            {t('consent.decline')}
          </button>
          <button
            onClick={() => setConsent('accepted')}
            data-testid="cookie-accept"
            className="flex-1 sm:flex-none min-w-28 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer
              border border-gold/60 bg-gold/15 text-gold hover:bg-gold/25 transition-colors"
          >
            {t('consent.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * "Cookie settings" — a footer link that puts the question back.
 *
 * An answer that can be given once and never changed is not consent. The link
 * is only there where the question applies at all.
 */
export function CookieSettingsLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const applies = useSyncExternalStore(() => () => {}, consentQuestionApplies, () => false)
  if (!applies) return null
  return (
    <button
      type="button"
      onClick={() => clearConsent()}
      data-testid="cookie-settings"
      className={`cursor-pointer ${className}`}
    >
      {t('consent.settings')}
    </button>
  )
}
