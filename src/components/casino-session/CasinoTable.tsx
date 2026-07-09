import type { Card } from '../../engine/shoe/types'
import type { BotPlayer, BotRoundResult } from '../../engine/casino-session/types'
import { DealerView } from './DealerView'
import { HumanSeat, BotSeat } from './SeatView'
import { TableLegend } from './TableLegend'
import { ShoeHousing, DiscardTray } from '../table/ShoeProgress'
import type { BotStatus, GameStep } from './helpers'

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
  discardCount: number
  totalCards: number
  penetration: number
  blackjackPays: number
  dealerHitsSoft17: boolean
}

/**
 * The casino table. A flow-based layout (not fixed coordinates): a top rail
 * holding the discard tray, dealer and shoe; the curved gold legend on the
 * open felt; and a centered row of self-sizing seat blocks. Every seat is one
 * block (chip · cards · total · name · status) so nothing overlaps, and cards
 * keep a single readable size — even when a hand is split or runs long.
 */
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
  discardCount,
  totalCards,
  penetration,
  blackjackPays,
  dealerHitsSoft17,
}: CasinoTableProps) {
  void isDealPhase

  const centerMessage =
    gameStep === 'bot_playing' ? 'Bots playing…' :
    gameStep === 'dealer_playing' ? 'Dealer playing…' :
    gameStep === 'insurance' ? 'Insurance?' : null

  return (
    <div className="flex-1 relative min-h-0 flex flex-col items-center justify-start px-2 md:px-6 pt-3 pb-2 overflow-y-auto" data-testid="casino-table">
      <div
        className="relative w-full max-w-[1120px] flex-1 min-h-0 flex flex-col"
        data-testid="felt-table"
        style={{
          borderRadius: '14px 14px 46% 46% / 14px 14px 32% 32%',
          background: 'radial-gradient(ellipse 110% 80% at 50% -8%, #1a6b3c 0%, #15603a 48%, #0d4a2a 92%)',
          border: '12px solid #5c3a1e',
          boxShadow: '0 0 0 2px #3d2510, 0 0 0 5px #6b4423, 0 12px 40px rgba(0,0,0,0.5), inset 0 0 80px rgba(0,0,0,0.22)',
          padding: '14px 18px 12px',
        }}
      >
        {/* Top rail: discard tray (outer-left) · dealer (center) · shoe (outer-right) */}
        <div className="grid items-start gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          <div className="justify-self-start">
            <DiscardTray cardCount={discardCount} totalCards={totalCards} pxPerCard={0.42} width={108} />
          </div>
          <DealerView dealerCards={dealerCards} dealerHoleRevealed={dealerHoleRevealed} />
          <div className="justify-self-end">
            <ShoeHousing cardCount={cardsRemaining} totalCards={totalCards} penetration={penetration} />
          </div>
        </div>

        {/* Curved gold legend — sits in the UPPER part of the open felt so it
            keeps clear of the seats' betting spots below (a little overlap is
            fine once cards are out, but not during betting). */}
        <div className="relative flex-1 min-h-0 flex items-center justify-center">
          <div className="w-[min(80%,620px)]">
            <TableLegend blackjackPays={blackjackPays} dealerHitsSoft17={dealerHitsSoft17} />
          </div>
          {centerMessage && (
            <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
              <span className={`text-sm italic ${gameStep === 'insurance' ? 'text-gold font-semibold' : 'text-white/50'}`}>
                {centerMessage}
              </span>
            </div>
          )}
        </div>

        {/* Seats row — self-sizing blocks following the table's arc (outer seats sit higher) */}
        <div className="shrink-0 flex items-end justify-center gap-x-5 md:gap-x-8">
          {seatLayout.map((seat, i) => {
            const isHuman = seat.type === 'human'
            const isActivePlayer = isHuman
              ? gameStep === 'human_playing'
              : seat.bot!.id === activeBotId
            const isDimmed = gameStep === 'bot_playing' && !isActivePlayer

            // Arc offset: outer seats lift up so the row follows the crescent rim.
            const center = (seatLayout.length - 1) / 2
            const lift = Math.round(Math.abs(i - center) * 16)

            return (
              <div key={isHuman ? 'human-seat-wrap' : seat.bot!.id} style={{ transform: `translateY(${-lift}px)` }}>
                {isHuman ? (
                  <HumanSeat
                    humanHands={humanHands}
                    humanVisibleCards={humanVisibleCards}
                    activeHandIndex={activeHandIndex}
                    currentBet={currentBet}
                    bankroll={bankroll}
                    handDoubled={handDoubled}
                    isSurrendered={isSurrendered}
                    humanSettlement={humanSettlement}
                    gameStep={gameStep}
                    isActivePlayer={isActivePlayer}
                    isDimmed={isDimmed}
                    isDealPhase={isDealPhase}
                  />
                ) : (
                  <BotSeat
                    bot={seat.bot!}
                    botStatus={botStatuses[seat.bot!.id] ?? 'wait'}
                    botSettlement={botResults.find(br => br.id === seat.bot!.id)}
                    visibleLimit={botVisibleCards[seat.bot!.id]}
                    gameStep={gameStep}
                    isActivePlayer={isActivePlayer}
                    isDimmed={isDimmed}
                    activeSplitHand={botActiveSplitHands[seat.bot!.id] ?? -1}
                    splitVisibleCards={botSplitVisibleCards[seat.bot!.id]}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
