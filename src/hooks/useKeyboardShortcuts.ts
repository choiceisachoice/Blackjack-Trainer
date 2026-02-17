import { useEffect } from 'react'
import { useGameStore } from '../store/game-store'
import { Action } from '../types'

/**
 * Registers keyboard shortcuts for game actions.
 *
 * - H → Hit
 * - S → Stand
 * - D → Double Down
 * - P → Split
 * - R → Surrender
 * - I → Insurance
 * - Space → Deal / New Round
 *
 * Only active shortcuts fire (checks availableActions from store).
 */
export function useKeyboardShortcuts() {
  const availableActions = useGameStore(s => s.availableActions)
  const gameState = useGameStore(s => s.gameState)
  const currentBet = useGameStore(s => s.currentBet)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const store = useGameStore.getState()
      const key = e.key.toLowerCase()

      // Block all shortcuts during animations
      if (store.isAnimating) return

      // Space: Deal or New Round
      if (e.code === 'Space') {
        e.preventDefault()
        if (store.gameState?.isRoundOver) {
          store.newRound()
        } else if (!store.gameState && store.currentBet > 0) {
          store.startRound()
        }
        return
      }

      // Action shortcuts only during player turn
      const actions = store.availableActions

      switch (key) {
        case 'h':
          if (actions.includes(Action.Hit)) store.hit()
          break
        case 's':
          if (actions.includes(Action.Stand)) store.stand()
          break
        case 'd':
          if (actions.includes(Action.Double)) store.double()
          break
        case 'p':
          if (actions.includes(Action.Split)) store.split()
          break
        case 'r':
          if (actions.includes(Action.Surrender)) store.surrender()
          break
        case 'i':
          if (actions.includes(Action.Insurance)) store.insurance()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [availableActions, gameState, currentBet])
}
