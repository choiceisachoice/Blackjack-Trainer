import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { getSystemById } from '../../engine/counting/counting-systems'

const MODE_LABELS: Record<string, string> = {
  speedDrill: 'Speed Drill',
  tableCounting: 'Table Counting',
  deviationTraining: 'Deviation Training',
  betSpread: 'Bet Spread',
  deckEstimation: 'Deck Estimation',
  analytics: 'Analytics',
  bankrollSim: 'Bankroll Tracker',
  achievements: 'Achievements',
  casinoSession: 'Casino Session',
  strategyChart: 'Strategy Chart',
  casinoSessionTracker: 'Casino Session Tracker',
}

/**
 * Top navigation bar shown in every training mode.
 * Displays home button, current mode name, selected counting system,
 * sound toggle, and theme toggle.
 */
export function TopBar() {
  const { t } = useTranslation()
  const currentMode = useAppStore(s => s.currentMode)
  const rawSetMode = useAppStore(s => s.setMode)
  const requestLeave = useLiveSessionStore(s => s.requestLeave)
  // Same guard as the NavBar: this "← Home" is the other way out of a running
  // session, and an unguarded second exit makes the first guard decorative.
  const setMode = (mode: Parameters<typeof rawSetMode>[0]) => {
    if (requestLeave(mode)) rawSetMode(mode)
  }
  const selectedSystem = useAppStore(s => s.selectedSystem)
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const toggleSound = useAppStore(s => s.toggleSound)
  const theme = useAppStore(s => s.theme)
  const toggleTheme = useAppStore(s => s.toggleTheme)

  const systemConfig = getSystemById(selectedSystem)

  return (
    <div className="h-12 flex items-center justify-between px-4 bg-topbar border-b border-contrast/10 shrink-0 transition-colors duration-200">
      <button
        onClick={() => setMode('home')}
        className="text-sm text-content/70 hover:text-gold transition-colors cursor-pointer"
      >
        ← {t('nav.home')}
      </button>
      <span className="text-sm font-semibold text-content">
        {MODE_LABELS[currentMode] ?? currentMode}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-content/50">
          {systemConfig.name}
        </span>
        <button
          onClick={toggleSound}
          data-testid="sound-toggle"
          title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          className="text-base text-content/50 hover:text-content transition-colors cursor-pointer"
        >
          {soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
        </button>
        <button
          onClick={toggleTheme}
          data-testid="theme-toggle"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="text-base text-content/50 hover:text-content transition-colors cursor-pointer"
        >
          {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
        </button>
      </div>
    </div>
  )
}
