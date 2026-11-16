import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HandOutcome } from './useGameLoop'
import type { Card } from '../../engine/shoe/types'
import type { BotPlayer, BotRoundResult, BotTurnHandView } from '../../engine/casino-session/types'
import { DealerView } from './DealerView'
import { HumanSeat, BotSeat } from './SeatView'
import { TableLegend } from './TableLegend'
import { ShoeHousing, DiscardTray } from '../table/ShoeProgress'
import { fitTable, fitStackedTable, isStackedBox, tableMinWidth, visibleForBox, stackedBotZoom, STACKED_RAIL_ZOOM, TABLE_DESIGN, TABLE_MAX_SCALE, type TableFit, type BotStatus, type GameStep, type HandInfo } from './helpers'

/** Space kept between the felt's rim and the edge of its box, on every side. */
const TABLE_GUTTER = 8

/**
 * Fit the table to whatever room it has been given.
 *
 * Returns the wrapper ref to attach and the fit to apply. Kept here rather than
 * in a shared hooks folder because nothing else needs it: the table is the only
 * screen drawn at a fixed design size.
 *
 * @param seats - Seats at the table; more seats need a wider scene
 */
function useTableFit(seats: number, bots: number, boxes: number): { ref: React.RefObject<HTMLDivElement | null>; fit: TableFit; stacked: boolean } {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<TableFit>(() => ({ scale: 1, sceneWidth: TABLE_DESIGN.width, sceneHeight: TABLE_DESIGN.height }))
  // An upright phone gets two rows of seats instead of one (see `isStackedBox`).
  const [stacked, setStacked] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const r = el.getBoundingClientRect()
      // The gutter keeps the rim and its shadow off the box's edge. It used to
      // be padding on the box, which the measurement included — so the felt was
      // fitted to the padded size and the padding did nothing.
      const box = { width: r.width - TABLE_GUTTER * 2, height: r.height - TABLE_GUTTER * 2 }
      const upright = isStackedBox(box)
      setStacked(upright)
      const next = upright
        ? fitStackedTable(box, bots, boxes)
        : fitTable(box, TABLE_DESIGN, TABLE_MAX_SCALE, tableMinWidth(seats))
      // Only write when something actually moved. A ResizeObserver that feeds
      // state which resizes the observed box is a loop waiting to happen; this
      // is the exit condition.
      setFit(prev =>
        Math.abs(prev.scale - next.scale) < 0.001 &&
        Math.abs(prev.sceneWidth - next.sceneWidth) < 0.5 &&
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
  }, [seats, bots, boxes])

  return { ref, fit, stacked }
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
  /** Box and split flag for each of `humanHands`; one unsplit box when omitted. */
  humanHandInfo?: HandInfo[]
  /** How many hands the player takes — what the table shows while betting. */
  boxes?: number
  /** Surrendered hands, by index into `humanHands`. */
  surrenderedHands?: Set<number>
  /** One settlement per box, once the round is settled. */
  humanBoxSettlements?: { result: HandOutcome; profit: number }[]
  humanVisibleCards: number
  activeHandIndex: number
  currentBet: number
  /** The bet on each of the player's boxes; `currentBet` on every box when omitted. */
  boxBets?: number[]
  /** While betting: the box the chips go on, or null for all. */
  selectedBox?: number | null
  /** The box insurance is being asked for, or -1. */
  insuranceBox?: number
  /** While betting: pick a box, open one more, take one away. */
  onSelectBox?: (box: number) => void
  onOpenBox?: () => void
  onCloseBox?: (box: number) => void
  /** Whether the bankroll and the table allow one more hand. */
  canOpenBox?: boolean
  handDoubled: Set<number>
  isSurrendered: boolean
  humanSettlement: { result: HandOutcome; profit: number } | null
  activeBotId: string | null
  botStatuses: Record<string, BotStatus>
  botResults: BotRoundResult[]
  botVisibleCards: Record<string, number>
  botActiveSplitHands: Record<string, number>
  botSplitHands: Record<string, BotTurnHandView[]>
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
  humanHandInfo,
  boxes = 1,
  surrenderedHands,
  humanBoxSettlements,
  humanVisibleCards,
  activeHandIndex,
  currentBet,
  boxBets,
  selectedBox = null,
  insuranceBox = -1,
  onSelectBox,
  onOpenBox,
  onCloseBox,
  canOpenBox = false,
  handDoubled,
  isSurrendered,
  humanSettlement,
  activeBotId,
  botStatuses,
  botResults,
  botVisibleCards,
  botActiveSplitHands,
  botSplitHands,
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

  // The player may hold several boxes; each takes a seat's room on the felt.
  const info: HandInfo[] = humanHandInfo ?? humanHands.map(() => ({ box: 0, split: humanHands.length > 1 }))
  const boxCount = gameStep === 'betting'
    ? Math.max(1, boxes)
    : Math.max(1, ...info.map(h => h.box + 1))
  const slots = seatLayout.length - 1 + boxCount
  const botCount = seatLayout.length - 1
  const { ref: fitRef, fit, stacked } = useTableFit(slots, botCount, boxCount)

  // Nothing here scrolls, and nothing needs to: `fitTable` never returns a
  // scene larger than the box. The wrapper used to keep `overflow-y-auto` for
  // the case of a box shorter than the scene's floor — which turned out to be
  // every ordinary laptop window, where it showed a scrollbar inside the table
  // and cut the dealer off above a scroll position that could not be reached.
  return (
    <div
      ref={fitRef}
      className="flex-1 relative min-h-0 flex items-center justify-center overflow-hidden"
      data-testid="casino-table"
    >
      {/*
        A box of the *scaled* size, with the scene pinned to its corner.

        A transformed element keeps its unscaled layout size. Left in the flow,
        a scene scaled to 0.35 still asked for 1120px of width: the wrapper
        scrolled 373px sideways on a phone, and as a flex item the scene was
        shrunk by the browser to whatever its contents happened to need, so the
        felt changed height while the cards were dealt. This box has the size
        the eye sees, and the scene inside it is out of flow.
      */}
      <div
        className="relative shrink-0"
        data-testid="felt-box"
        style={{ width: fit.sceneWidth * fit.scale, height: fit.sceneHeight * fit.scale }}
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
        className="absolute left-0 top-0 flex flex-col"
        data-testid="felt-table"
        style={{
          width: fit.sceneWidth,
          height: fit.sceneHeight,
          transform: `scale(${fit.scale})`,
          // From the corner of the sized box around it, which is what centres
          // the table; see the note on that box.
          transformOrigin: 'top left',
          // Upright, the deep curve of the wide table would cut into the
          // player's own hands at the bottom corners; the arc is shallower.
          borderRadius: stacked ? '14px 14px 50% 50% / 14px 14px 9% 9%' : '14px 14px 46% 46% / 14px 14px 32% 32%',
          // The felt reads from the theme now. `--color-felt` and `--color-wood` were
          // declared with the rest of the palette and referenced by nothing, while the
          // table painted its own copy of the same greens in hex — the same defect as
          // the chips, where four colour tokens sat unused next to grey rectangles.
          // The darker stops are derived from the token rather than re-typed, so
          // changing the felt in one place changes the whole table.
          background:
            'radial-gradient(ellipse 110% 80% at 50% -8%,' +
            ' var(--color-felt) 0%,' +
            ' color-mix(in srgb, var(--color-felt) 88%, black) 48%,' +
            ' color-mix(in srgb, var(--color-felt) 62%, black) 92%)',
          border: '12px solid var(--color-wood)',
          boxShadow: '0 0 0 2px #3d2510, 0 0 0 5px #6b4423, 0 12px 40px rgba(0,0,0,0.5), inset 0 0 80px rgba(0,0,0,0.22)',
          padding: stacked ? '14px 18px 30px' : '14px 18px 12px',
        }}
      >
        {/* Top rail: discard tray (outer-left) · dealer (center) · shoe (outer-right) */}
        <div className="grid items-start gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
          <div className="justify-self-start" style={stacked ? { zoom: STACKED_RAIL_ZOOM } : undefined}>
            <DiscardTray cardCount={discardCount} totalCards={totalCards} pxPerCard={0.42} width={108} />
          </div>
          <DealerView dealerCards={dealerCards} dealerHoleRevealed={dealerHoleRevealed} />
          <div className="justify-self-end" style={stacked ? { zoom: STACKED_RAIL_ZOOM } : undefined}>
            <ShoeHousing cardCount={cardsRemaining} totalCards={totalCards} penetration={penetration} />
          </div>
        </div>

        {/* Curved gold legend — sits in the UPPER part of the open felt so it
            keeps clear of the seats' betting spots below (a little overlap is
            fine once cards are out, but not during betting). */}
        {/*
          The status line ("Bots spielen…", "Dealer zieht…") used to be an
          absolute overlay pinned to the bottom of this band. On a short window
          the band shrinks, the legend is centred inside it, and its last line —
          INSURANCE PAYS 2 TO 1 — landed exactly where the overlay was pinned.
          Two texts on top of each other. The line is in normal flow now, under
          the legend, with its height reserved so the legend does not jump when
          the message comes and goes.
        */}
        <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5">
          <div className="w-[min(72%,520px)]">
            <TableLegend blackjackPays={blackjackPays} dealerHitsSoft17={dealerHitsSoft17} />
          </div>
          <div className="h-5 flex items-center justify-center pointer-events-none" aria-live="polite">
            {centerMessage && (
              <span className={`text-sm italic ${gameStep === 'insurance' ? 'text-gold font-semibold' : 'text-white/50'}`}>
                {centerMessage}
              </span>
            )}
          </div>
        </div>

        {/* Seats row — equal slots across the felt, following the table's arc
            (outer seats sit higher). A slot has one width for the whole
            session: seats used to size themselves to their cards, so a hit or
            a split in one seat moved every other seat along the row. */}
        {(() => {
          type Entry = { seat: SeatLayoutEntry; box: number }
          const entries: Entry[] = seatLayout.flatMap(seat => seat.type === 'human'
            ? Array.from({ length: boxCount }, (_, box) => ({ seat, box }))
            : [{ seat, box: 0 }])
          // 60 = the felt's border and padding on both sides.
          const inner = fit.sceneWidth - 60
          const renderSeat = ({ seat, box }: Entry, i: number, rowSlots: number, slotWidth: number, arc: boolean) => {
            const isHuman = seat.type === 'human'
            // This box's hands, as indices into the player's hands.
            const own = isHuman ? info.flatMap((h, k) => (h.box === box ? [k] : [])) : []
            const activeHere = own.indexOf(activeHandIndex)
            // Insurance is asked hand by hand: the hand in question is lit.
            const insuring = isHuman && gameStep === 'insurance' && boxCount > 1 && insuranceBox >= 0
            const isActivePlayer = isHuman
              ? (gameStep === 'human_playing' && (boxCount === 1 || activeHere >= 0)) || (insuring && box === insuranceBox)
              : seat.bot!.id === activeBotId
            const isDimmed = (gameStep === 'bot_playing' && !isActivePlayer)
              || (isHuman && gameStep === 'human_playing' && boxCount > 1 && activeHere < 0)
              || (insuring && box !== insuranceBox)

            // Arc offset: outer seats lift up so the row follows the crescent rim.
            const center = (rowSlots - 1) / 2
            const lift = arc ? Math.round(Math.abs(i - center) * 16) : 0
            const boxHands = own.length > 0 ? own.map(k => humanHands[k] ?? []) : [[]]

            return (
              <div key={isHuman ? `human-seat-wrap-${box}` : seat.bot!.id} style={{ transform: `translateY(${-lift}px)` }}>
                {isHuman ? (
                  <HumanSeat
                    humanHands={boxHands}
                    humanVisibleCards={humanVisibleCards >= 999 ? 999 : visibleForBox(humanVisibleCards, box, boxCount)}
                    activeHandIndex={boxHands.length > 1 ? activeHere : 0}
                    currentBet={boxBets?.[box] ?? currentBet}
                    pick={gameStep === 'betting' && onSelectBox ? {
                      index: box,
                      selected: selectedBox === box,
                      numbered: boxCount > 1,
                      onSelect: () => onSelectBox(box),
                      onClose: boxCount > 1 && onCloseBox ? () => onCloseBox(box) : undefined,
                      onOpen: box === boxCount - 1 && canOpenBox && onOpenBox ? onOpenBox : undefined,
                    } : undefined}
                    bankroll={bankroll}
                    handDoubled={new Set(own.flatMap((k, local) => (handDoubled.has(k) ? [local] : [])))}
                    isSurrendered={surrenderedHands ? own.some(k => surrenderedHands.has(k)) : box === 0 && isSurrendered}
                    humanSettlement={humanBoxSettlements?.[box] ?? (box === 0 ? humanSettlement : null)}
                    gameStep={gameStep}
                    isActivePlayer={isActivePlayer}
                    isDimmed={isDimmed}
                    isDealPhase={isDealPhase}
                    slotWidth={slotWidth}
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
                    splitHands={botSplitHands[seat.bot!.id]}
                    slotWidth={slotWidth}
                  />
                )}
              </div>
            )
          }

          if (!stacked) {
            const slotWidth = Math.min(260, Math.floor(inner / slots))
            return (
              <div className="shrink-0 flex items-end justify-center">
                {entries.map((e, i) => renderSeat(e, i, slots, slotWidth, true))}
              </div>
            )
          }
          // An upright phone: the other players in a smaller row of their own,
          // the player's hands below at full size. Seat order is kept in each row.
          const others = entries.filter(e => e.seat.type === 'bot')
          const mine = entries.filter(e => e.seat.type === 'human')
          const botZoom = stackedBotZoom(others.length)
          const botSlot = Math.min(220, Math.floor(inner / botZoom / Math.max(1, others.length)))
          const mySlot = Math.min(260, Math.floor(inner / mine.length))
          return (
            <>
              {others.length > 0 && (
                <div className="shrink-0 flex items-end justify-center mb-4" data-testid="bot-row" style={{ zoom: botZoom }}>
                  {others.map((e, i) => renderSeat(e, i, others.length, botSlot, false))}
                </div>
              )}
              <div className="shrink-0 flex items-end justify-center" data-testid="player-row">
                {mine.map((e, i) => renderSeat(e, i, mine.length, mySlot, false))}
              </div>
            </>
          )
        })()}
      </div>
      </div>
    </div>
  )
}
