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
      {/* A bordered pill, not a line of dim text: on a wide screen a small
          grey label in the corner of a black canvas is invisible, and the
          first person to look for it did not find it. */}
      <button
        onClick={() => { if (requestLeave('home')) setMode('home') }}
        data-testid="back-to-menu"
        className="glow-hover group inline-flex items-center gap-2 pl-2.5 pr-3.5 h-9 rounded-lg
          border border-contrast/15 bg-contrast/5 text-sm font-medium text-content/80
          hover:text-gold hover:border-gold/40 hover:bg-gold/10 transition-colors cursor-pointer"
      >
        <ArrowLeft size={17} className="text-gold transition-transform duration-200 group-hover:-translate-x-0.5" />
        {t('nav.backToMenu')}
      </button>
    </div>
  )
}
