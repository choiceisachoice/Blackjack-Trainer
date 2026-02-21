import { motion } from 'framer-motion'
import { useGameStore } from '../../store/game-store'

const CHIPS = [
  { amount: 5, color: 'bg-chip-red', label: '$5' },
  { amount: 10, color: 'bg-chip-blue', label: '$10' },
  { amount: 25, color: 'bg-chip-green', label: '$25' },
  { amount: 50, color: 'bg-chip-black border border-contrast/20', label: '$50' },
  { amount: 100, color: 'bg-gold', label: '$100' },
]

/**
 * Betting controls shown before a round starts.
 * Chip buttons to add to bet, Clear/Deal buttons.
 */
export function BetControls() {
  const placeBet = useGameStore(s => s.placeBet)
  const clearBet = useGameStore(s => s.clearBet)
  const startRound = useGameStore(s => s.startRound)
  const currentBet = useGameStore(s => s.currentBet)
  const balance = useGameStore(s => s.balance)

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Current bet display */}
      <div className="text-center">
        <span className="text-xs text-content/50 uppercase tracking-wider">Current Bet</span>
        <div className="text-2xl md:text-3xl font-bold text-gold">
          ${currentBet}
        </div>
      </div>

      {/* Chip buttons */}
      <div className="flex gap-2 md:gap-3 flex-wrap justify-center">
        {CHIPS.map(chip => (
          <motion.button
            key={chip.amount}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => placeBet(chip.amount)}
            disabled={chip.amount > balance}
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full ${chip.color} text-white font-bold text-xs md:text-sm
              shadow-lg disabled:opacity-30 disabled:cursor-not-allowed
              flex items-center justify-center transition-opacity`}
          >
            {chip.label}
          </motion.button>
        ))}
      </div>

      {/* Deal / Clear buttons */}
      <div className="flex gap-3">
        <button
          onClick={clearBet}
          disabled={currentBet === 0}
          className="px-4 py-2 rounded-lg bg-contrast/10 text-content/70 hover:bg-contrast/20
            disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          Clear
        </button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={startRound}
          disabled={currentBet === 0}
          className="px-8 py-2 rounded-lg bg-gold text-black font-bold text-sm md:text-base
            shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          Deal [Space]
        </motion.button>
      </div>
    </div>
  )
}
