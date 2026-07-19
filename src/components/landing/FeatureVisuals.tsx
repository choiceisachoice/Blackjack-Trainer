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
        <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-content/35">Running</span>
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

/** Casino Session: a fragment of felt with the dealer's card and a player hand. */
export function FeltTableVisual() {
  return (
    <div
      aria-hidden
      className="relative h-full min-h-[168px] rounded-xl overflow-hidden border border-[rgba(212,168,71,.18)]
        bg-[radial-gradient(120%_90%_at_50%_-10%,#166139,#0b4123_58%,#062a16)]"
    >
      {/* table arc */}
      <div className="absolute inset-x-6 top-9 h-40 rounded-[50%] border border-white/10" />

      {/* dealer card */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 flex gap-1.5">
        <MiniCard rank="10" suit="♦" red className="w-8 h-[46px]" />
        <div className="w-8 h-[46px] rounded-[5px] bg-[linear-gradient(150deg,#24407e,#16264d)] border border-white/15" />
      </div>

      {/* player hand */}
      <div className="absolute left-1/2 bottom-5 -translate-x-1/2 flex gap-1.5">
        <MiniCard rank="9" suit="♠" className="w-8 h-[46px] -rotate-6" />
        <MiniCard rank="7" suit="♥" red className="w-8 h-[46px] rotate-6" />
      </div>

      {/* chips */}
      <div className="absolute left-5 bottom-6 flex flex-col-reverse items-center">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{ marginTop: -6 }}
            className="w-6 h-6 rounded-full border-2 border-[rgba(120,84,20,.75)]
              bg-[radial-gradient(circle_at_32%_30%,#f6dc98,#d8ad4e_58%,#a9781f)]"
          />
        ))}
      </div>

      <span className="absolute right-4 bottom-4 text-[0.6875rem] font-semibold tabular-nums
        text-gold/90 bg-black/35 border border-gold/25 rounded-full px-2 py-0.5">
        TC +3
      </span>
    </div>
  )
}

/**
 * Deviations: a real slice of the strategy chart where every cell says Hit —
 * except the one the count overrides. That cell is Illustrious 18 #2,
 * "16 vs 10: stand at TC ≥ 0", taken from the deviations engine.
 */
export function DeviationChartVisual() {
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
        TC ≥ 0 → Stand
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
