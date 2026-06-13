import type { Card } from '../../engine/shoe/types'
import type { BotPlayer, BotRoundResult } from '../../engine/casino-session/types'
import { DealerView } from './DealerView'
import { HumanSeat, BotSeat } from './SeatView'
import { BotStatusBadge } from './CardComponents'
import { formatDollar } from './helpers'
import type { BotStatus, GameStep } from './helpers'

// Curved seat positions following the semi-circular table arc
// Y values form a curve: 72 → 80 → 85 → 85 → 80 → 72
const SPOT_POSITIONS = [
  { x: 12, y: 72 },   // Seat 0: far left, high
  { x: 25, y: 80 },   // Seat 1: left
  { x: 40, y: 85 },   // Seat 2: center-left
  { x: 60, y: 85 },   // Seat 3: center-right
  { x: 75, y: 80 },   // Seat 4: right
  { x: 88, y: 72 },   // Seat 5: far right, high
]

interface SeatLayoutEntry {
  type: 'bot' | 'human'
  bot?: BotPlayer
  seatIndex: number
}

interface CasinoTableProps {
  dealerCards: Card[]
  dealerHoleRevealed: boolean
  gameStep: GameStep
  isDealPhase: boolean
  seatLayout: SeatLayoutEntry[]
  humanHands: Card[][]
  humanVisibleCards: number
  activeHandIndex: number
  currentBet: number
  handDoubled: Set<number>
  isSurrendered: boolean
  humanSettlement: { label: string; profit: number } | null
  activeBotId: string | null
  botStatuses: Record<string, BotStatus>
  botResults: BotRoundResult[]
  botVisibleCards: Record<string, number>
  botActiveSplitHands: Record<string, number>
  botSplitVisibleCards: Record<string, number[]>
  bankroll: number
  cardsRemaining: number
  cardsDealt: number
  totalCards: number
  penetration: number
}

export function CasinoTable({
  dealerCards,
  dealerHoleRevealed,
  gameStep,
  isDealPhase,
  seatLayout,
  humanHands,
  humanVisibleCards,
  activeHandIndex,
  currentBet,
  handDoubled,
  isSurrendered,
  humanSettlement,
  activeBotId,
  botStatuses,
  botResults,
  botVisibleCards,
  botActiveSplitHands,
  botSplitVisibleCards,
  bankroll,
  cardsRemaining,
  cardsDealt,
  totalCards,
  penetration,
}: CasinoTableProps) {
  return (
    <div className="flex-1 relative min-h-0 flex flex-col items-center justify-center px-2 md:px-6 pt-2 pb-1" data-testid="casino-table">
      <div
        className="relative w-full max-w-[1100px]"
        data-testid="felt-table"
        style={{
          borderRadius: '12px 12px 50% 50% / 12px 12px 35% 35%',
          background: 'radial-gradient(ellipse 100% 70% at 50% 0%, #1a6b3c 0%, #15603a 50%, #0d4a2a 90%)',
          border: '10px solid #5c3a1e',
          borderTop: '14px solid #5c3a1e',
          boxShadow: '0 0 0 2px #3d2510, 0 0 0 5px #6b4423, 0 8px 32px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.2)',
          minHeight: '400px',
          padding: '20px 16px 70px',
        }}
      >
        {/* Felt texture overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            borderRadius: 'inherit',
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
          }}
        />

        {/* Dealer Area */}
        <DealerView
          dealerCards={dealerCards}
          dealerHoleRevealed={dealerHoleRevealed}
          isDealPhase={isDealPhase}
          cardsRemaining={cardsRemaining}
          cardsDealt={cardsDealt}
          totalCards={totalCards}
          penetration={penetration}
        />

        {/* Center Messages */}
        <div className="absolute top-[32%] left-1/2 -translate-x-1/2 z-20 text-center">
          {gameStep === 'bot_playing' && (
            <div className="text-sm text-white/50 italic">Bots playing...</div>
          )}
          {gameStep === 'dealer_playing' && (
            <div className="text-sm text-white/50 italic">Dealer playing...</div>
          )}
          {gameStep === 'insurance' && (
            <div className="text-sm text-gold font-semibold">Insurance?</div>
          )}
        </div>

        {/* Seat Row — curved positioning following table arc */}
        <div className="absolute inset-0 z-10">
          {seatLayout.map((seat) => {
            const pos = SPOT_POSITIONS[seat.seatIndex]
            const isHuman = seat.type === 'human'
            const isActivePlayer = isHuman
              ? gameStep === 'human_playing'
              : seat.bot!.id === activeBotId
            const isDimmed = gameStep === 'bot_playing' && !isActivePlayer

            if (isHuman) {
              return (
                <div key="human-seat" style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 50,
                }}>
                  <HumanSeat
                    humanHands={humanHands}
                    humanVisibleCards={humanVisibleCards}
                    activeHandIndex={activeHandIndex}
                    currentBet={currentBet}
                    handDoubled={handDoubled}
                    isSurrendered={isSurrendered}
                    humanSettlement={humanSettlement}
                    gameStep={gameStep}
                    isActivePlayer={isActivePlayer}
                    isDimmed={isDimmed}
                    isDealPhase={isDealPhase}
                  />
                </div>
              )
            }

            const bot = seat.bot!
            return (
              <div key={bot.id} style={{
                position: 'absolute',
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 1,
              }}>
                <BotSeat
                  bot={bot}
                  botStatus={botStatuses[bot.id] ?? 'wait'}
                  botSettlement={botResults.find(br => br.id === bot.id)}
                  visibleLimit={botVisibleCards[bot.id]}
                  gameStep={gameStep}
                  isActivePlayer={isActivePlayer}
                  isDimmed={isDimmed}
                  activeSplitHand={botActiveSplitHands[bot.id] ?? -1}
                  splitVisibleCards={botSplitVisibleCards[bot.id]}
                />
              </div>
            )
          })}
        </div>

        {/* Empty seat markers — curved positioning */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {Array.from({ length: 6 }, (_, i) => {
            const isOccupied = seatLayout.some(s => s.seatIndex === i)
            if (isOccupied) return null
            const pos = SPOT_POSITIONS[i]
            return (
              <div key={`empty-${i}`} style={{
                position: 'absolute',
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
              }}>
                <div className="w-14 h-9 md:w-16 md:h-10 rounded-full"
                  style={{ border: '1.5px dashed rgba(255, 255, 255, 0.1)', background: 'rgba(0,0,0,0.05)' }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Player Info Strip — curved x-positions matching seats */}
      <div className="w-full max-w-[1100px] relative" style={{ padding: '8px 0', marginTop: '4px', minHeight: '44px' }} data-testid="player-info-strip">
        {seatLayout.map((seat) => {
          const pos = SPOT_POSITIONS[seat.seatIndex]
          const isHuman = seat.type === 'human'

          if (isHuman) {
            return (
              <div key="human-info" className="flex flex-col items-center gap-0.5" style={{
                position: 'absolute',
                left: `${pos.x}%`,
                transform: 'translateX(-50%)',
                textAlign: 'center',
              }}>
                <span className="text-[10px] md:text-xs text-gold font-bold">
                  {'\u2605'} YOU
                </span>
                <span className="text-[9px] md:text-[10px] text-content/50">
                  {formatDollar(bankroll)}
                </span>
              </div>
            )
          }

          const bot = seat.bot!
          const status = botStatuses[bot.id] ?? 'wait'
          return (
            <div key={`info-${bot.id}`} className="flex flex-col items-center gap-0.5" style={{
              position: 'absolute',
              left: `${pos.x}%`,
              transform: 'translateX(-50%)',
              textAlign: 'center',
            }}>
              <span className="text-[9px] md:text-[11px] text-white/60 font-medium truncate max-w-20">{bot.name}</span>
              <span className="text-[8px] md:text-[9px] text-white/30">{formatDollar(bot.bankroll)}</span>
              <BotStatusBadge status={status} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
