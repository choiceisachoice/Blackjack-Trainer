import { useEffect } from 'react'
import { useGameStore } from '../../store/game-store'
import { Hand } from '../cards/Hand'
import { BalanceDisplay } from './BalanceDisplay'
import { CountDisplay } from './CountDisplay'
import { ShoeStack, DiscardStack } from './ShoeProgress'
import { MessageDisplay } from './MessageDisplay'
import { BetControls } from './BetControls'
import { ActionButtons } from './ActionButtons'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

/**
 * Main Blackjack game table component.
 *
 * Full-screen layout with casino-realistic green felt, wood border,
 * dealer area (top), player area (bottom), and controls.
 * Shoe (top-right) and Discard Tray (top-left) are positioned
 * as 3D card stacks within the felt area.
 */
export function GameTable() {
  const gameState = useGameStore(s => s.gameState)
  const initGame = useGameStore(s => s.initGame)
  const currentBet = useGameStore(s => s.currentBet)

  useKeyboardShortcuts()

  useEffect(() => {
    initGame()
  }, [initGame])

  const isBetting = !gameState || gameState.isRoundOver
  const isPlayerTurn = gameState?.phase === 'playerTurn'
  const hideDealer = isPlayerTurn

  return (
    <div className="h-screen flex flex-col bg-casino-bg overflow-hidden">
      {/* Top bar */}
      <div className="flex justify-between items-start px-4 py-3">
        <BalanceDisplay />
        <CountDisplay />
      </div>

      {/* Table area */}
      <div className="flex-1 relative flex flex-col items-center justify-between mx-2 md:mx-4 mb-2
        bg-felt rounded-xl border-4 border-wood shadow-2xl overflow-hidden py-4 md:py-8">

        {/* Discard Tray (top-left) and Shoe (top-right) */}
        <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10">
          <DiscardStack />
        </div>
        <div className="absolute top-3 right-3 md:top-4 md:right-4 z-10">
          <ShoeStack />
        </div>

        {/* Dealer area */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-white/40 uppercase tracking-wider">Dealer</span>
          {gameState ? (
            <Hand
              cards={gameState.dealerHand.cards}
              isDealer
              hideFirst={hideDealer}
            />
          ) : (
            <div className="h-[8rem] md:h-[10rem] flex items-center justify-center text-white/20">
              Place your bet to start
            </div>
          )}
        </div>

        {/* Middle info area */}
        <div className="flex flex-col items-center gap-2 w-full px-4">
          <MessageDisplay />
        </div>

        {/* Player area */}
        <div className="flex flex-col items-center gap-2">
          {gameState && gameState.playerHands.length > 0 ? (
            <div className="flex gap-4 md:gap-8 flex-wrap justify-center">
              {gameState.playerHands.map((hand, i) => (
                <Hand
                  key={i}
                  cards={hand.cards}
                  label={gameState.playerHands.length > 1 ? `Hand ${i + 1}` : undefined}
                  isActive={gameState.currentHandIndex === i && isPlayerTurn}
                />
              ))}
            </div>
          ) : (
            <div className="h-[8rem] md:h-[10rem]" />
          )}

          {/* Bet amount shown during play */}
          {gameState && !gameState.isRoundOver && (
            <div className="mt-1 text-sm text-gold/70">
              Bet: ${currentBet}
            </div>
          )}
        </div>
      </div>

      {/* Controls area */}
      <div className="px-4 py-3 md:py-4">
        {isBetting && !gameState?.isRoundOver ? (
          <BetControls />
        ) : (
          <ActionButtons />
        )}
      </div>
    </div>
  )
}
