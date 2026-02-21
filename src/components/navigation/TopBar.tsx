import { useAppStore } from '../../store/app-store'
import { getSystemById } from '../../engine/counting/counting-systems'

const MODE_LABELS: Record<string, string> = {
  speedDrill: 'Speed Drill',
  tableCounting: 'Table Counting',
  deviationTraining: 'Deviation Training',
  betSpread: 'Bet Spread',
  deckEstimation: 'Deck Estimation',
  analytics: 'Analytics',
  bankrollSim: 'Bankroll Simulator',
  achievements: 'Achievements',
}

/**
 * Top navigation bar shown in every training mode.
 * Displays home button, current mode name, selected counting system, and sound toggle.
 */
export function TopBar() {
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const selectedSystem = useAppStore(s => s.selectedSystem)
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const toggleSound = useAppStore(s => s.toggleSound)

  const systemConfig = getSystemById(selectedSystem)

  return (
    <div className="h-12 flex items-center justify-between px-4 bg-black/60 border-b border-white/10 shrink-0">
      <button
        onClick={() => setMode('home')}
        className="text-sm text-white/70 hover:text-gold transition-colors cursor-pointer"
      >
        &larr; Home
      </button>
      <span className="text-sm font-semibold text-white">
        {MODE_LABELS[currentMode] ?? currentMode}
      </span>
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/50">
          {systemConfig.name}
        </span>
        <button
          onClick={toggleSound}
          data-testid="sound-toggle"
          title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          className="text-base text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          {soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
        </button>
      </div>
    </div>
  )
}
