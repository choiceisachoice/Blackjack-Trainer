import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { getSystemById } from '../../engine/counting/counting-systems'

/**
 * The mode name in the bar, as translation keys.
 *
 * This is the title of every training screen. It sat here as English in a
 * `.ts`-style constant map, which the JSX lint rule cannot reach — so it was
 * the one line of a fully German screen that stayed in English.
 */
const MODE_LABEL_KEY: Record<string, string> = {
  speedDrill: 'modes.speedDrill',
  tableCounting: 'modes.tableCounting',
  deviationTraining: 'modes.deviationTraining',
  betSpread: 'modes.betSpread',
  deckEstimation: 'modes.deckEstimation',
  analytics: 'modes.analytics',
  bankrollSim: 'modes.bankrollTracker',
  achievements: 'modes.achievements',
  casinoSession: 'modes.casinoSession',
  strategyChart: 'modes.strategyChart',
  casinoSessionTracker: 'modes.casinoSessionTracker',
}

/**
 * Top navigation bar shown in every training mode.
 * Displays home button, current mode name, selected counting system,
 * and the sound toggle.
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
        {MODE_LABEL_KEY[currentMode] ? t(MODE_LABEL_KEY[currentMode]) : currentMode}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-content/50">
          {systemConfig.name}
        </span>
        <button
          onClick={toggleSound}
          data-testid="sound-toggle"
          title={soundEnabled ? t('nav.muteSounds') : t('nav.enableSounds')}
          className="text-base text-content/50 hover:text-content transition-colors cursor-pointer"
        >
          {soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
        </button>
      </div>
    </div>
  )
}
