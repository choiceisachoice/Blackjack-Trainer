import { useGameStore } from '../../store/game-store'

/**
 * Displays the player's current balance in the top-left corner.
 * Gold color for positive, red for zero/negative.
 */
export function BalanceDisplay() {
  const balance = useGameStore(s => s.balance)

  return (
    <div className="flex flex-col items-start">
      <span className="text-xs text-content/50 uppercase tracking-wider">Balance</span>
      <span className={`text-xl md:text-2xl font-bold ${
        balance > 0 ? 'text-gold' : 'text-error'
      }`}>
        ${balance.toLocaleString()}
      </span>
    </div>
  )
}
