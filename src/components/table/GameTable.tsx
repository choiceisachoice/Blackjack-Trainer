import { useEffect } from 'react'
import { motion, LayoutGroup } from 'framer-motion'
import { useGameStore } from '../../store/game-store'
import { Hand } from '../cards/Hand'
import { BalanceDisplay } from './BalanceDisplay'
import { CountDisplay } from './CountDisplay'
import { ShoeStack, DiscardStack } from './ShoeProgress'
import { MessageDisplay } from './MessageDisplay'
import { BetControls } from './BetControls'
import { ActionButtons } from './ActionButtons'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import type { Card } from '../../engine/shoe/types'

/** Props for GameTable. */
interface GameTableProps {
  /** Optional function to compute count value for a card (easy mode badges). */
  getCardCountValue?: (card: Card) => number
}

/**
 * Main Blackjack game table component.
 *
 * Full-screen layout with casino-realistic green felt, wood border,
 * dealer area (top), player area (bottom), and controls.
 * Shoe (right side) and Discard Tray (left side) are vertically centered
 * on the felt area as 3D card stacks.
 */
export function GameTable({ getCardCountValue }: GameTableProps = {}) {
  const gameState = useGameStore(s => s.gameState)
  const initGame = useGameStore(s => s.initGame)
  const currentBet = useGameStore(s => s.currentBet)
  const splitNewCardDelays = useGameStore(s => s.splitNewCardDelays)

  useKeyboardShortcuts()

  useEffect(() => {
    initGame()
  }, [initGame])

  const isBetting = !gameState || gameState.isRoundOver
  const isPlayerTurn = gameState?.phase === 'playerTurn'
  const hideDealer = isPlayerTurn

  return (
    <div className="h-full flex flex-col bg-casino-bg overflow-hidden">
      {/* Top bar */}
      <div className="flex justify-between items-start px-4 py-3">
        <BalanceDisplay />
        <CountDisplay />
      </div>

      {/* Table area */}
      <div className="flex-1 relative flex flex-col items-center justify-between mx-2 md:mx-4 mb-2
        bg-felt rounded-xl border-4 border-wood shadow-2xl overflow-hidden py-4 md:py-8">

        {/* Discard Tray – left side, vertically centered */}
        <div className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-10">
          <DiscardStack />
        </div>

        {/* Shoe – right side, vertically centered */}
        <div className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-10">
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
              countValues={getCardCountValue ? gameState.dealerHand.cards.map(getCardCountValue) : undefined}
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
            <LayoutGroup>
              <div className="flex gap-4 md:gap-8 flex-wrap justify-center">
                {gameState.playerHands.map((hand, i) => {
                  const isSplit = gameState.playerHands.length > 1
                  const isHandActive = gameState.currentHandIndex === i && isPlayerTurn
                  return (
                    <motion.div
                      key={`hand-${i}`}
                      layout
                      transition={{ type: 'spring', stiffness: 120, damping: 20, duration: 0.8 }}
                      className={isSplit
                        ? isHandActive
                          ? 'ring-2 ring-gold rounded-xl p-2'
                          : 'opacity-50 p-2'
                        : ''}
                    >
                      <Hand
                        cards={hand.cards}
                        label={isSplit ? `Hand ${i + 1}` : undefined}
                        isActive={isHandActive}
                        countValues={getCardCountValue ? hand.cards.map(getCardCountValue) : undefined}
                        splitNewCardDelay={splitNewCardDelays?.[i]}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </LayoutGroup>
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
