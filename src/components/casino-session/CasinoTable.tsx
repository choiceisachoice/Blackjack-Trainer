import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HandOutcome } from './useGameLoop'
import type { Card } from '../../engine/shoe/types'
import type { BotPlayer, BotRoundResult } from '../../engine/casino-session/types'
import { DealerView } from './DealerView'
import { HumanSeat, BotSeat } from './SeatView'
import { TableLegend } from './TableLegend'
import { ShoeHousing, DiscardTray } from '../table/ShoeProgress'
import { fitTable, TABLE_DESIGN, type TableFit, type BotStatus, type GameStep } from './helpers'

/**
 * Fit the table to whatever room it has been given.
 *
 * Returns the wrapper ref to attach and the fit to apply. Kept here rather than
 * in a shared hooks folder because nothing else needs it: the table is the only
 * screen drawn at a fixed design size.
 */
function useTableFit(): { ref: React.RefObject<HTMLDivElement | null>; fit: TableFit } {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<TableFit>(() => ({ scale: 1, sceneHeight: TABLE_DESIGN.height }))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const r = el.getBoundingClientRect()
      const next = fitTable({ width: r.width, height: r.height })
      // Only write when something actually moved. A ResizeObserver that feeds
      // state which resizes the observed box is a loop waiting to happen; this
      // is the exit condition.
      setFit(prev =>
        Math.abs(prev.scale - next.scale) < 0.001 &&
        Math.abs(prev.sceneHeight - next.sceneHeight) < 0.5
          ? prev
          : next,
      )
    }

    measure()

    // ResizeObserver rather than a window listener: the table's box also
    // changes when the surrounding chrome does — a toolbar wrapping onto two
    // lines, the summary panel opening — and none of those resize the window.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, fit }
}

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
  humanSettlement: { result: HandOutcome; profit: number } | null
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

  const { t } = useTranslation()

  const centerMessage =
    gameStep === 'bot_playing' ? t('casino.table.botsPlaying') :
    gameStep === 'dealer_playing' ? t('casino.table.dealerPlaying') :
    gameStep === 'insurance' ? t('casino.table.insuranceShort') : null

  const { ref: fitRef, fit } = useTableFit()

  // The wrapper keeps `overflow-y-auto`, as it had before. A scaled element
  // keeps its *unscaled* layout size, so growing the table never produces a
  // scrollbar — but in the one pathological case (a box shorter than the
  // scene's floor) the seats have to stay reachable rather than be cut off.
  return (
    <div
      ref={fitRef}
      className="flex-1 relative min-h-0 flex flex-col items-center justify-center px-2 md:px-6 pt-3 pb-2 overflow-y-auto"
      data-testid="casino-table"
    >
      {/*
        Drawn once at `TABLE_DESIGN` and scaled to fit, rather than reflowed.

        It used to be `w-full max-w-[1120px]` with `flex-1` height, and both
        halves of that misbehaved on a large screen. The width stopped at
        1120px, so on a 3440px monitor the table sat as a third-width island
        while every card, chip and label inside it kept its hard-coded pixel
        size — the whole scene read as a postage stamp. The `flex-1` height
        meanwhile handed all the spare vertical space to the one middle band,
        stretching the felt into a large empty field between the legend and the
        seats.

        Now the width sets one scale for the whole scene and the height follows
        it, so the felt still fills its box exactly — but the cards, chips and
        labels grow with it instead of staying pinned to hard-coded pixels.
      */}
      <div
        className="relative flex flex-col"
        data-testid="felt-table"
        style={{
          width: TABLE_DESIGN.width,
          height: fit.sceneHeight,
          transform: `scale(${fit.scale})`,
          // Scaling from the centre keeps the table optically centred in its
          // box at every size without a second layout pass.
          transformOrigin: 'center center',
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
