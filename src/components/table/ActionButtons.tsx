import { motion } from 'framer-motion'
import { useGameStore } from '../../store/game-store'
import { Action } from '../../types'

interface ActionDef {
  action: Action
  label: string
  shortcut: string
  color: string
}

const ACTIONS: ActionDef[] = [
  { action: Action.Hit, label: 'Hit', shortcut: 'H', color: 'bg-success hover:bg-success/80' },
  { action: Action.Stand, label: 'Stand', shortcut: 'S', color: 'bg-error hover:bg-error/80' },
  { action: Action.Double, label: 'Double', shortcut: 'D', color: 'bg-warning hover:bg-warning/80' },
  { action: Action.Split, label: 'Split', shortcut: 'P', color: 'bg-chip-blue hover:bg-chip-blue/80' },
  { action: Action.Surrender, label: 'Surrender', shortcut: 'R', color: 'bg-white/20 hover:bg-white/30' },
  { action: Action.Insurance, label: 'Insurance', shortcut: 'I', color: 'bg-gold/80 hover:bg-gold/60' },
]

const actionHandlers: Record<string, (store: ReturnType<typeof useGameStore.getState>) => void> = {
  [Action.Hit]: s => s.hit(),
  [Action.Stand]: s => s.stand(),
  [Action.Double]: s => s.double(),
  [Action.Split]: s => s.split(),
  [Action.Surrender]: s => s.surrender(),
  [Action.Insurance]: s => s.insurance(),
}

/**
 * Player action buttons during a round.
 * Shows only available actions based on game state.
 * Keyboard shortcuts displayed on each button.
 */
export function ActionButtons() {
  const availableActions = useGameStore(s => s.availableActions)
  const gameState = useGameStore(s => s.gameState)
  const newRound = useGameStore(s => s.newRound)
  const isAnimating = useGameStore(s => s.isAnimating)

  // After settlement: show New Round button
  if (gameState?.isRoundOver) {
    return (
      <div className="flex justify-center">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={newRound}
          className="px-8 py-3 rounded-lg bg-gold text-black font-bold text-base shadow-lg"
        >
          New Round [Space]
        </motion.button>
      </div>
    )
  }

  return (
    <div className="flex gap-2 md:gap-3 flex-wrap justify-center">
      {ACTIONS.map(({ action, label, shortcut, color }) => {
        const isAvailable = availableActions.includes(action) && !isAnimating
        return (
          <motion.button
            key={action}
            whileHover={isAvailable ? { scale: 1.05 } : undefined}
            whileTap={isAvailable ? { scale: 0.95 } : undefined}
            onClick={() => {
              if (isAvailable) {
                actionHandlers[action](useGameStore.getState())
              }
            }}
            disabled={!isAvailable}
            className={`px-4 py-2 md:px-5 md:py-2.5 rounded-lg font-bold text-sm text-white
              shadow-md transition-opacity
              ${isAvailable ? color : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
          >
            {label}
            <span className="ml-1.5 text-xs opacity-60">[{shortcut}]</span>
          </motion.button>
        )
      })}
    </div>
  )
}
