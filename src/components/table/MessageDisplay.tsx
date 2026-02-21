import { motion, AnimatePresence } from 'framer-motion'
import { useGameStore } from '../../store/game-store'

/**
 * Displays round result messages with color coding and animation.
 * Green for wins, red for losses, yellow for push.
 */
export function MessageDisplay() {
  const message = useGameStore(s => s.message)

  const getColor = (msg: string) => {
    if (msg.includes('+') || msg.includes('Win') || msg.includes('Blackjack') || msg.includes('Busts!')) return 'text-success'
    if (msg.includes('-') || msg.includes('Bust!') || msg.includes('Lost')) return 'text-error'
    if (msg.includes('Push') || msg.includes('Shuffling')) return 'text-warning'
    return 'text-content'
  }

  return (
    <div className="h-10 flex items-center justify-center">
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
            className={`text-lg md:text-xl font-bold ${getColor(message)}`}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
