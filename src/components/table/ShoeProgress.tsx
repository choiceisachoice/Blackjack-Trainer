import { useGameStore } from '../../store/game-store'

/**
 * Horizontal progress bar showing how much of the shoe has been dealt.
 * Color changes: green (>50%) → yellow (25-50%) → red (<25% remaining).
 */
export function ShoeProgress() {
  const shoe = useGameStore(s => s.shoe)

  if (!shoe) return null

  const remaining = shoe.remaining()

  // Simple percentage: remaining / total cards in shoe
  const totalCards = useGameStore.getState().rules.numDecks * 52
  const remainingPct = (remaining / totalCards) * 100

  const barColor =
    remainingPct > 50 ? 'bg-success' :
    remainingPct > 25 ? 'bg-warning' :
    'bg-error'

  return (
    <div className="w-full max-w-xs">
      <div className="flex justify-between text-xs text-white/50 mb-1">
        <span>Shoe</span>
        <span>{remaining}/{totalCards}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${remainingPct}%` }}
        />
      </div>
    </div>
  )
}
