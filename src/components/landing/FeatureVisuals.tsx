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
export function FeltTableVisual() {
  /** Seats along the arc: the two outer ones are bots, the middle one is you. */
  const seats = [
    { x: 74, y: 128, you: false },
    { x: 160, y: 146, you: true },
    { x: 246, y: 128, you: false },
  ]

  return (
    <svg
      aria-hidden
      viewBox="0 0 320 200"
      className="w-full h-full min-h-[168px] rounded-xl border border-gold/15"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* Deep, desaturated felt. The old one read as a highlighter next to
            the near-black shell; this one is a dark surface with a light on it. */}
        <radialGradient id="felt-surface" cx="50%" cy="-8%" r="118%">
          <stop offset="0%" stopColor="#154a2e" />
          <stop offset="45%" stopColor="#0d3221" />
          <stop offset="100%" stopColor="#051309" />
        </radialGradient>

        {/* Corner falloff, so the tile has no hard bright edges. */}
        <radialGradient id="felt-vignette" cx="50%" cy="42%" r="78%">
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.62" />
        </radialGradient>

        <linearGradient id="card-face" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#f4f2ec" />
          <stop offset="100%" stopColor="#d6d2c7" />
        </linearGradient>

        <linearGradient id="card-back" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#25417f" />
          <stop offset="100%" stopColor="#14224a" />
        </linearGradient>
      </defs>

      <rect width="320" height="200" fill="url(#felt-surface)" />

      {/* The printed arc and the insurance line — the two markings that make a
          blank green field read as a blackjack layout rather than a snooker
          table. Hairlines, the way they are actually screen-printed on felt. */}
      <path
        d="M -6 92 Q 160 200 326 92"
        fill="none"
        stroke="rgba(212,168,71,.28)"
        strokeWidth="1.25"
      />
      <path
        d="M 6 74 Q 160 168 314 74"
        fill="none"
        stroke="rgba(255,255,255,.07)"
        strokeWidth="1"
      />

      {/* Dealer, top centre: one card up, one down — the situation the whole
          product is about reading. */}
      <g transform="translate(160 6)">
        <PlayCard x={-26} y={0} w={24} h={34} rank="10" suit="♦" red />
        <PlayCard x={2} y={0} w={24} h={34} back />
      </g>

      {/* The shoe, top right. Small, but it is the thing that makes the scene a
          six-deck game rather than a hand of cards on a table. */}
      <g opacity="0.75">
        <rect x="276" y="10" width="34" height="22" rx="3" fill="#0a1c12" stroke="rgba(255,255,255,.14)" />
        <rect x="279" y="13" width="28" height="4" rx="1.5" fill="rgba(255,255,255,.16)" />
        <rect x="279" y="19" width="28" height="4" rx="1.5" fill="rgba(255,255,255,.10)" />
        <rect x="279" y="25" width="28" height="4" rx="1.5" fill="rgba(255,255,255,.07)" />
      </g>

      {seats.map(seat => (
        <g key={seat.x} opacity={seat.you ? 1 : 0.42}>
          {/* Bet circle, printed on the felt. */}
          <ellipse
            cx={seat.x}
            cy={seat.y - 34}
            rx="13"
            ry="5"
            fill="none"
            stroke={seat.you ? 'rgba(212,168,71,.45)' : 'rgba(255,255,255,.14)'}
            strokeWidth="1"
          />

          {seat.you ? (
            <>
              <ChipStack x={seat.x} y={seat.y - 34} />
              {/* Your hand: 9 and 7 — a hard 16, the single most count-dependent
                  decision in the game, and the one the deviations tile beside
                  this is about. The scene and its neighbour tell one story. */}
              <PlayCard x={seat.x - 25} y={seat.y - 22} w={24} h={34} rank="9" suit="♠" rotate={-8} />
              <PlayCard x={seat.x + 1} y={seat.y - 22} w={24} h={34} rank="7" suit="♥" red rotate={8} />
            </>
          ) : (
            <>
              <Chip cx={seat.x} cy={seat.y - 35} fill="#1c1917" edge="rgba(255,255,255,.35)" />
              <PlayCard x={seat.x - 21} y={seat.y - 18} w={20} h={28} back rotate={-7} />
              <PlayCard x={seat.x + 1} y={seat.y - 18} w={20} h={28} back rotate={7} />
            </>
          )}
        </g>
      ))}

      <rect width="320" height="200" fill="url(#felt-vignette)" />

      {/* The count, in the accent colour — now the only gold on the felt, which
          is the point of taking it off the chips. */}
      <g transform="translate(252 162)">
        <rect width="56" height="22" rx="11" fill="rgba(0,0,0,.55)" stroke="rgba(212,168,71,.4)" />
        {/*
          Longhands, never the `font` shorthand.

          `{ font: '600 11px …', fontVariantNumeric: 'tabular-nums' }` looks
          equivalent and is not: the shorthand resets every font longhand, and
          the sibling property then expands it back into a full set of *empty*
          longhands. Inspected in the browser, this text was shipping with
          `font-size: ; font-weight: ; font-family: ;` — no size, no weight, no
          face. Two properties that each work alone, broken by being adjacent.
        */}
        <text
          x="28"
          y="15"
          textAnchor="middle"
          className="fill-gold"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          TC +3
        </text>
      </g>
    </svg>
  )
}

/** One playing card in the table scene — a face, or a back. */
function PlayCard({ x, y, w, h, rank, suit, red = false, back = false, rotate = 0 }: {
  x: number
  y: number
  w: number
  h: number
  rank?: string
  suit?: string
  red?: boolean
  back?: boolean
  rotate?: number
}) {
  const ink = red ? '#c41e3a' : '#16181d'

  return (
    <g transform={rotate ? `rotate(${rotate} ${x + w / 2} ${y + h / 2})` : undefined}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="3"
        fill={back ? 'url(#card-back)' : 'url(#card-face)'}
        stroke={back ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.25)'}
        strokeWidth="0.75"
      />
      {back ? (
        <rect
          x={x + 3}
          y={y + 3}
          width={w - 6}
          height={h - 6}
          rx="2"
          fill="none"
          stroke="rgba(255,255,255,.16)"
          strokeWidth="0.75"
        />
      ) : (
        <>
          {/* Longhands here too, for the reason spelled out on the TC badge. */}
          <text
            x={x + w / 2}
            y={y + h / 2 - 1}
            textAnchor="middle"
            fill={ink}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: Math.round(w * 0.42),
              fontWeight: 700,
            }}
          >
            {rank}
          </text>
          <text
            x={x + w / 2}
            y={y + h - 6}
            textAnchor="middle"
            fill={ink}
            style={{ fontFamily: 'var(--font-sans)', fontSize: Math.round(w * 0.38) }}
          >
            {suit}
          </text>
        </>
      )}
    </g>
  )
}

/**
 * A casino chip: a coloured disc with the light edge spots that make a chip a
 * chip rather than a counter. Drawn with a dashed stroke, so the spots follow
 * the curve exactly at any size.
 */
function Chip({ cx, cy, fill, edge }: { cx: number; cy: number; fill: string; edge: string }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy + 1} rx="9" ry="5" fill="rgba(0,0,0,.45)" />
      <circle cx={cx} cy={cy} r="8.5" fill={fill} stroke="rgba(0,0,0,.5)" strokeWidth="0.75" />
      <circle
        cx={cx}
        cy={cy}
        r="6.6"
        fill="none"
        stroke={edge}
        strokeWidth="3"
        strokeDasharray="2.6 3.4"
      />
      <circle cx={cx} cy={cy} r="3.6" fill="none" stroke="rgba(255,255,255,.30)" strokeWidth="0.9" />
    </g>
  )
}

/**
 * The player's bet: three chips in real denominations.
 *
 * Red 5, green 25, black 100 — the standard colours, so anyone who has stood at
 * a table reads the stack without being told. Deliberately not gold: that is
 * the product's accent, and scenery painted in the accent colour is how an
 * accent stops meaning anything.
 */
function ChipStack({ x, y }: { x: number; y: number }) {
  const chips = [
    { fill: '#1c1917', edge: 'rgba(255,255,255,.42)' },
    { fill: '#15803d', edge: 'rgba(255,255,255,.45)' },
    { fill: '#c41e3a', edge: 'rgba(255,255,255,.5)' },
  ]

  return (
    <g>
      {chips.map((c, i) => (
        <Chip key={c.fill} cx={x} cy={y - i * 4.5} fill={c.fill} edge={c.edge} />
      ))}
    </g>
  )
}

/**
 * Deviations: a real slice of the strategy chart where every cell says Hit —
 * except the one the count overrides. That cell is Illustrious 18 #2,
 * "16 vs 10: stand at TC ≥ 0", taken from the deviations engine.
 */
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
