import { useTranslation } from 'react-i18next'
import { SOCIAL_LINKS } from './social-links'

/**
 * The channel icons for a footer: each one opens the account in a new tab,
 * named for a screen reader in the page's language. A visitor clicks the mark,
 * not a pasted URL.
 */
export function SocialLinks({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('landing.footer.social')} className={`flex items-center gap-3 ${className}`} data-testid="social-links">
      <span className="text-content/60">{t('landing.footer.social')}</span>
      <ul className="flex items-center gap-1.5">
        {SOCIAL_LINKS.map((s) => (
          <li key={s.network}>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('landing.footer.socialLink', { network: s.network })}
              title={s.network}
              className="grid place-items-center w-9 h-9 rounded-lg border border-contrast/10 text-content/70 hover:text-gold hover:border-gold/40 transition-colors focus-visible:outline-2 focus-visible:outline-gold"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
                {s.icon}
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
