/**
 * Small, self-contained product glimpses for the landing's feature showcase.
 *
 * These render the real thing — the actual strategy-chart colours, real Hi-Lo
 * tags, a real deviation threshold — rather than generic icons. Showing the
 * product argues for it better than a paragraph describing it.
 *
 * All are decorative: every tile states its meaning in text, so each visual is
 * `aria-hidden` and carries no information of its own.
 */
import { useTranslation } from 'react-i18next'
import { CasinoTable } from '../casino-session/CasinoTable'
import { Rank, Suit, type Card } from '../../engine/shoe/types'
import type { BotPlayer } from '../../engine/casino-session/types'
import type { BotStatus } from '../casino-session/helpers'

/** Chart action colours — must match StrategyChart's ACTION_COLORS. */
const ACTION = {
  hit: '#22c55e',
  stand: '#eab308',
} as const

/** A miniature playing card. */
function MiniCard({ rank, suit, red = false, className = '' }: {
  rank: string
  suit: string
  red?: boolean
  className?: string
}) {
  return (
    <div
      className={`rounded-[5px] bg-[linear-gradient(160deg,#f2f0ea,#d9d6cc)] shadow-[0_6px_14px_-6px_rgba(0,0,0,.85)]
        flex flex-col items-center justify-center leading-none select-none ${className}`}
    >
      <span className={`text-[0.75rem] font-bold ${red ? 'text-[#c41e3a]' : 'text-[#16181d]'}`}>{rank}</span>
      <span className={`text-[0.6875rem] ${red ? 'text-[#c41e3a]' : 'text-[#16181d]'}`}>{suit}</span>
    </div>
  )
}

/**
 * Speed Drill: cards with their Hi-Lo tags and the running count they add up to.
 * Tags follow Hi-Lo exactly — 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1.
 */
export function SpeedDrillVisual() {
  const { t } = useTranslation()
  const cards = [
    { rank: '5', suit: '♥', red: true, tag: '+1' },
    { rank: 'K', suit: '♠', red: false, tag: '−1' },
    { rank: '3', suit: '♣', red: false, tag: '+1' },
  ]
  return (
    <div aria-hidden className="flex items-end gap-3">
      {cards.map(c => (
        <div key={c.rank + c.suit} className="flex flex-col items-center gap-1.5">
          <MiniCard rank={c.rank} suit={c.suit} red={c.red} className="w-9 h-[52px]" />
          <span className="text-[0.75rem] font-semibold tabular-nums text-content/45">{c.tag}</span>
        </div>
      ))}
      <div className="ml-1 flex flex-col items-start gap-1 pb-5">
        <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-content/35">{t('landing.visual.running')}</span>
        <span className="text-lg font-extrabold tabular-nums text-gold leading-none">+1</span>
      </div>
    </div>
  )
}

/** Analytics: an accuracy trend line with the latest point emphasised. */
export function TrendVisual() {
  const pts = [8, 22, 16, 34, 30, 46, 58, 54, 70]
  const w = 168
  const h = 52
  const step = w / (pts.length - 1)
  const line = pts.map((p, i) => `${i * step},${h - (p / 80) * h}`).join(' ')
  const lastX = (pts.length - 1) * step
  const lastY = h - (pts[pts.length - 1] / 80) * h

  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h + 6}`} className="w-full max-w-[190px] overflow-visible">
      <polyline points={`0,${h} ${line} ${lastX},${h}`} fill="var(--color-gold)" opacity={0.1} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-gold)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3.5} fill="var(--color-gold)" />
    </svg>
  )
}

/**
 * Casino Session: the table, seen from the player's side.
 *
 * ## What was wrong with the old one
 *
 * A bright green rectangle with an elliptical border, one hand, and three
 * identical gold discs standing in for chips — sitting bottom-left, attached to
 * nothing. Three problems, all of them visible at a glance:
 *
 *  - **The gold.** Gold is this product's accent; spending it on scenery means
 *    it no longer marks the things that matter. Real chips are coloured by
 *    denomination, so they get to be red, green and black, and the accent goes
 *    back to being an accent.
 *  - **The green.** A saturated felt-green fill is the loudest element on a
 *    dark-luxury page, and it was the largest tile in the Pro band — the part
 *    meant to look the most expensive.
 *  - **The claim.** The copy beside it promises a *multi-seat* table with bots.
 *    The picture showed one hand. A visual that contradicts its own caption
 *    costs more trust than no visual at all.
 *
 * ## What this does instead
 *
 * One SVG scene rather than stacked absolutely-positioned divs, because the
 * shapes that make a table read as a table — the arc, the bet circles, the chip
 * edges — are curves, and curves in CSS are a pile of border-radius guesses.
 *
 * Deep desaturated felt with a vignette so the tile sits *inside* the page
 * instead of shouting over it. Three seats along the arc: two dimmed bots and
 * your hand in the middle, which is what the caption actually claims. Chips in
 * real denominations, in the bet circle where a bet belongs.
 */
/**
 * The casino table on the landing page — the real one.
 *
 * This used to be a hand-drawn SVG: its own felt, its own cards, a shoe that
 * was three grey bars in a box, and a "TC +3" pill that exists nowhere in the
 * product. It was reported as looking cheap, and the reason is structural: a
 * drawing of a product next to the product's own type and colours reads as a
 * mockup. The table below is `CasinoTable` itself, given a fixed hand — the
 * same component, the same shoe housing, the same discard tray, the same
 * seats and legend the player sees after signing up. Whatever the table looks
 * like in the app, it looks like here, because it *is* the app.
 *
 * The hand is chosen, not random: a hard 16 against a dealer 10, the most
 * count-dependent decision in the game and the one the deviations tile beside
 * this is about. The two glimpses tell one story.
 */
export function FeltTableVisual() {
  return (
    <div
      aria-hidden
      className="relative w-full aspect-[1120/640] min-h-[168px] rounded-xl overflow-hidden
        border border-gold/15 pointer-events-none select-none"
    >
      <div className="absolute inset-0 flex">
        <CasinoTable
          dealerCards={SHOWCASE_DEALER}
          dealerHoleRevealed={false}
          gameStep="human_playing"
          isDealPhase={false}
          seatLayout={SHOWCASE_SEATS}
          humanHands={SHOWCASE_YOU}
          humanVisibleCards={2}
          activeHandIndex={0}
          currentBet={100}
          handDoubled={NO_DOUBLES}
          isSurrendered={false}
          humanSettlement={null}
          activeBotId={null}
          botStatuses={SHOWCASE_BOT_STATUS}
          botResults={[]}
          botVisibleCards={SHOWCASE_BOT_VISIBLE}
          botActiveSplitHands={{}}
          botSplitVisibleCards={{}}
          bankroll={4900}
          cardsRemaining={187}
          cardsDealt={125}
          discardCount={118}
          totalCards={312}
          penetration={0.75}
          blackjackPays={1.5}
          dealerHitsSoft17={false}
        />
      </div>
    </div>
  )
}

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit })

function showcaseBot(id: string, name: string, seatIndex: number, cards: Card[], bankroll: number): BotPlayer {
  return {
    id, name, seatIndex, bankroll,
    currentBet: 100, isActive: true,
    skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: 100,
    hands: [{ cards, bet: 100, isDoubled: false, isSplit: false, isBusted: false, isStanding: true }],
  }
}

/** Dealer shows a ten; the hole card stays down — the situation the product is about reading. */
const SHOWCASE_DEALER: Card[] = [c(Rank.Ten, Suit.Diamonds), c(Rank.Six, Suit.Clubs)]
/** Your hard 16. */
const SHOWCASE_YOU: Card[][] = [[c(Rank.Nine, Suit.Spades), c(Rank.Seven, Suit.Hearts)]]
const SHOWCASE_MARIA = showcaseBot('bot-0', 'Maria', 1, [c(Rank.Queen, Suit.Clubs), c(Rank.Three, Suit.Hearts), c(Rank.Five, Suit.Spades)], 2552)
const SHOWCASE_SOFIA = showcaseBot('bot-1', 'Sofia', 5, [c(Rank.Four, Suit.Clubs), c(Rank.Jack, Suit.Clubs)], 2880)
const SHOWCASE_SEATS = [
  { type: 'bot' as const, bot: SHOWCASE_MARIA, seatIndex: 1 },
  { type: 'human' as const, seatIndex: 3 },
  { type: 'bot' as const, bot: SHOWCASE_SOFIA, seatIndex: 5 },
]
const SHOWCASE_BOT_STATUS: Record<string, BotStatus> = { 'bot-0': 'stand', 'bot-1': 'wait' }
const SHOWCASE_BOT_VISIBLE: Record<string, number> = { 'bot-0': 3, 'bot-1': 2 }
const NO_DOUBLES = new Set<number>()

export function DeviationChartVisual() {
  const { t } = useTranslation()
  const dealers = ['7', '8', '9', '10', 'A']
  const players = ['12', '13', '14', '15', '16', '17']

  return (
    <div aria-hidden className="inline-block">
      <div className="flex gap-[3px] pl-[22px] mb-[3px]">
        {dealers.map(d => (
          <span key={d} className="w-[26px] text-center text-[0.65rem] font-semibold text-content/35 tabular-nums">{d}</span>
        ))}
      </div>
      {players.map(p => (
        <div key={p} className="flex gap-[3px] mb-[3px] items-center">
          <span className="w-[19px] text-right text-[0.65rem] font-semibold text-content/35 tabular-nums">{p}</span>
          {dealers.map(d => {
            // Basic strategy for this slice: hit everything up to 16, stand on 17.
            const stand = p === '17'
            const isDeviation = p === '16' && d === '10'
            return (
              <span
                key={d}
                style={{ background: stand ? ACTION.stand : ACTION.hit }}
                className={`w-[26px] h-[19px] rounded-[3px] grid place-items-center text-[0.65rem] font-bold text-black/75
                  ${isDeviation ? 'ring-2 ring-gold ring-offset-1 ring-offset-[#0b0c0e] relative z-10' : 'opacity-60'}`}
              >
                {stand ? 'S' : 'H'}
              </span>
            )
          })}
        </div>
      ))}
      <div className="mt-2.5 inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold
        text-gold bg-gold/10 border border-gold/30 rounded-full px-2 py-0.5">
        {t('landing.visual.tcStand')}
      </div>
    </div>
  )
}

/** Bankroll: a risk-of-ruin style curve trending up with variance. */
export function BankrollVisual() {
  const pts = [30, 26, 34, 28, 38, 33, 44, 40, 52, 48, 60]
  const w = 150
  const h = 44
  const step = w / (pts.length - 1)
  const line = pts.map((p, i) => `${i * step},${h - (p / 70) * h}`).join(' ')

  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className="w-[150px] shrink-0">
      <polyline points={line} fill="none" stroke="var(--color-gold)" strokeWidth={1.75}
        strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
    </svg>
  )
}
