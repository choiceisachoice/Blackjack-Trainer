import { useTranslation } from 'react-i18next'
import { Smartphone } from 'lucide-react'
import { promptInstall, useInstallAvailable } from '../../hooks/use-install-prompt'

/**
 * "Install app" — the one place the home-screen install is offered.
 *
 * Rendered only while the browser itself is offering the install
 * (`beforeinstallprompt`: Android, desktop Chrome and Edge, not yet
 * installed). Everywhere else it renders nothing at all, iOS included: Safari
 * gives a page no way to open "Add to Home Screen", and a button that can only
 * explain where another button is would be an instruction popup by another
 * name.
 *
 * The app is installable without a service worker, by decision: it gets an
 * icon and its own window, and it does **not** start without a connection.
 * The description under the button does not promise otherwise.
 */
export function InstallAppButton() {
  const { t } = useTranslation()
  const available = useInstallAvailable()
  if (!available) return null

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap" data-testid="install-app">
      <p className="text-sm text-content/60 min-w-0 flex-1">{t('install.description')}</p>
      <button
        type="button"
        onClick={() => void promptInstall()}
        data-testid="install-app-button"
        className="rounded-xl px-4 py-2.5 text-sm font-semibold border border-white/12 text-content
          hover:border-gold/55 transition-colors cursor-pointer inline-flex items-center gap-2"
      >
        <Smartphone size={16} aria-hidden /> {t('install.button')}
      </button>
    </div>
  )
}
