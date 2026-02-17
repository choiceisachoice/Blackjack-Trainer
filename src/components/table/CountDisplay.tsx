import { useGameStore } from '../../store/game-store'

/**
 * Displays the running count and true count when enabled.
 * Toggle button to show/hide. Shows the active counting system name.
 */
export function CountDisplay() {
  const showCount = useGameStore(s => s.showCount)
  const runningCount = useGameStore(s => s.runningCount)
  const trueCount = useGameStore(s => s.trueCount)
  const toggleCountDisplay = useGameStore(s => s.toggleCountDisplay)
  const countingSystemId = useGameStore(s => s.countingSystemId)

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggleCountDisplay}
        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
      >
        {showCount ? 'Hide Count' : 'Show Count'}
      </button>

      {showCount && (
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-right">
          <div className="text-xs text-white/50 mb-1">{countingSystemId}</div>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-white/50">RC </span>
              <span className={`font-bold ${runningCount >= 0 ? 'text-success' : 'text-error'}`}>
                {runningCount >= 0 ? '+' : ''}{runningCount}
              </span>
            </div>
            <div>
              <span className="text-white/50">TC </span>
              <span className={`font-bold ${trueCount >= 0 ? 'text-success' : 'text-error'}`}>
                {trueCount >= 0 ? '+' : ''}{trueCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
