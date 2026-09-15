import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'

/**
 * The way back to the main menu, at the top left of every screen that is not
 * the menu.
 *
 * Until this existed the only route home was the wordmark in the navigation
 * bar, which nothing marks as a button — and below 1400px the wordmark is
 * gone and the route home is a bare spade icon. A person who opened a drill
 * and wanted out had to guess. This is the convention every app they know
 * uses: an arrow, top left, that says where it goes.
 *
 * Goes through the live-session guard like the two other exits: a Casino
 * Session in progress asks before it is left, here as everywhere.
 */
export function BackToMenu() {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const requestLeave = useLiveSessionStore(s => s.requestLeave)

  return (
    <div className="shrink-0 px-4 pt-3 -mb-1" data-testid="back-to-menu-bar">
      <button
        onClick={() => { if (requestLeave('home')) setMode('home') }}
        data-testid="back-to-menu"
        className="group inline-flex items-center gap-1.5 text-sm text-content/55 hover:text-gold transition-colors cursor-pointer"
      >
        <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
        {t('nav.backToMenu')}
      </button>
    </div>
  )
}
