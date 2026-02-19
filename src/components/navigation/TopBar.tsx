import { useAppStore } from '../../store/app-store'
import { getSystemById } from '../../engine/counting/counting-systems'

const MODE_LABELS: Record<string, string> = {
  speedDrill: 'Speed Drill',
  tableCounting: 'Table Counting',
  deviationTraining: 'Deviation Training',
  betSpread: 'Bet Spread',
  deckEstimation: 'Deck Estimation',
  analytics: 'Analytics',
}

/**
 * Top navigation bar shown in every training mode.
 * Displays home button, current mode name, and selected counting system.
 */
export function TopBar() {
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const selectedSystem = useAppStore(s => s.selectedSystem)

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
      <span className="text-xs text-white/50">
        {systemConfig.name}
      </span>
    </div>
  )
}
