import type { TrendPoint, HeatCell, ModeAccuracy, RadarAxis, EdgePoint } from './analytics-derive'

/**
 * Hand-authored SVG chart primitives for the Analytics dashboard.
 *
 * They are intentionally dependency-free (no Recharts) so the visuals match the
 * dark-luxury design exactly and inherit theme colors through CSS variables.
 */

// Shared color tokens (resolve against the active theme via CSS variables).
const GRID = 'color-mix(in srgb, var(--color-contrast) 9%, transparent)'
const GRID_STRONG = 'color-mix(in srgb, var(--color-contrast) 16%, transparent)'
const FAINT = 'color-mix(in srgb, var(--color-content) 38%, transparent)'
const GOLD = 'var(--color-gold)'
const GOLD_BRIGHT = 'var(--color-gold-bright)'

/** Catmull-Rom → cubic-bezier smoothing for a set of [x,y] points. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

/** Tiny inline sparkline for a KPI tile. */
export function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <svg className="block" width={74} height={26} aria-hidden="true" />
  const w = 74
  const h = 26
  const pad = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const x = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1)
  const y = (v: number) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - pad * 2)
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = 'M' + pts.join(' L')
  const area = `${line} L${x(data.length - 1)},${h} L${x(0)},${h} Z`
  return (
    <svg className="block" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={area} fill={GOLD} opacity={0.12} />
      <path d={line} fill="none" stroke={GOLD} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.2} fill={GOLD} />
    </svg>
  )
}

/** Accuracy trend area chart with gridlines, a 90% goal line, and an emphasized endpoint. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const W = 680
  const H = 230
  const padL = 34
  const padR = 12
  const padT = 16
  const padB = 26
  const lo = 40
  const hi = 100
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, points.length - 1)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)

  const P = points.map((p, i) => [x(i), y(p.accuracy)] as [number, number])
  const line = smoothPath(P)
  const area = `${line} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`
  const last = points[points.length - 1]

  return (
    <svg className="block w-full" height={230} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Accuracy trend">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GOLD} stopOpacity={0.32} />
          <stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[50, 60, 70, 80, 90].map(g => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke={g === 90 ? GRID_STRONG : GRID} strokeWidth={1} strokeDasharray={g === 90 ? '4 4' : undefined} />
          <text x={padL - 8} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill={FAINT}>{g}</text>
        </g>
      ))}
      <path d={area} fill="url(#trendFill)" />
      <path d={line} fill="none" stroke={GOLD_BRIGHT} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      {last && (
        <>
          <circle cx={x(points.length - 1)} cy={y(last.accuracy)} r={9} fill={GOLD} opacity={0.18} />
          <circle cx={x(points.length - 1)} cy={y(last.accuracy)} r={4.5} fill={GOLD_BRIGHT} />
          <text x={x(points.length - 1)} y={y(last.accuracy) - 13} textAnchor="end" fontSize={12} fontWeight={700} fill={GOLD_BRIGHT}>{last.accuracy}%</text>
        </>
      )}
    </svg>
  )
}

const HEAT_SHADE: Record<number, string> = {
  0: 'color-mix(in srgb, var(--color-contrast) 8%, transparent)',
  1: 'color-mix(in srgb, var(--color-gold) 26%, transparent)',
  2: 'color-mix(in srgb, var(--color-gold) 45%, transparent)',
  3: 'color-mix(in srgb, var(--color-gold) 68%, transparent)',
  4: 'var(--color-gold)',
}

/** Calendar heatmap: 7 day-rows × N week-columns. */
export function Heatmap({ columns }: { columns: HeatCell[][] }) {
  const rows = 7
  return (
    <div className="flex flex-col gap-1" data-testid="practice-heatmap">
      {Array.from({ length: rows }, (_, d) => (
        <div key={d} className="flex gap-1">
          {columns.map((col, w) => (
            <div
              key={w}
              className="w-3.5 h-3.5 rounded-[3px]"
              style={{ background: HEAT_SHADE[col[d]?.level ?? 0] }}
              title={col[d] ? `${col[d].day}` : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Legend swatches for the heatmap intensity scale. */
export function HeatLegend() {
  return (
    <span className="inline-flex items-center gap-1">
      less
      {[0, 1, 2, 3, 4].map(l => (
        <i key={l} className="inline-block w-3 h-3 rounded-[3px]" style={{ background: HEAT_SHADE[l] }} />
      ))}
      more
    </span>
  )
}

const barColor = (a: number): string =>
  a >= 0.85 ? 'var(--color-success)' : a >= 0.78 ? 'var(--color-gold)' : 'var(--color-warning)'

/** Horizontal accuracy-by-mode bars. */
export function ModeBars({ rows }: { rows: ModeAccuracy[] }) {
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map(r => (
        <div key={r.mode} className="grid items-center gap-3" style={{ gridTemplateColumns: '130px 1fr 44px' }}>
          <div className="text-[13px] font-medium text-content flex items-center gap-1.5">
            <span className="truncate">{r.label}</span>
            {r.tag && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded"
                style={{
                  color: r.tag === 'best' ? 'var(--color-success)' : 'var(--color-warning)',
                  background: r.tag === 'best'
                    ? 'color-mix(in srgb, var(--color-success) 15%, transparent)'
                    : 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                }}
              >
                {r.tag === 'best' ? 'Strong' : 'Focus'}
              </span>
            )}
          </div>
          <div className="h-2.5 rounded-full bg-contrast/5 border border-contrast/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round(r.accuracy * 100)}%`, background: barColor(r.accuracy) }} />
          </div>
          <div className="text-[13px] font-bold text-right text-content">{Math.round(r.accuracy * 100)}%</div>
        </div>
      ))}
    </div>
  )
}

/** Most-misplayed hands: amber→red bars keyed by miss-rate. */
export function WeakestHands({ hands }: { hands: { name: string; accuracy: number }[] }) {
  return (
    <div className="flex flex-col gap-2.5" data-testid="weakest-hands">
      {hands.map(h => {
        const miss = Math.round((1 - h.accuracy) * 100)
        return (
          <div key={h.name} className="grid items-center gap-3" style={{ gridTemplateColumns: '1fr 90px 40px' }}>
            <span className="text-[13px] font-medium text-content truncate">{h.name}</span>
            <div className="h-2 rounded-full bg-contrast/5 border border-contrast/10 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${miss}%`, background: 'linear-gradient(90deg, var(--color-warning), var(--color-error))' }} />
            </div>
            <span className="text-[13px] font-bold text-right" style={{ color: 'var(--color-error)' }}>{miss}%</span>
          </div>
        )
      })}
    </div>
  )
}

/** Radial skill profile (pentagon) over 5 training areas. */
export function SkillRadar({ axes }: { axes: RadarAxis[] }) {
  const cx = 140
  const cy = 104
  const R = 82
  const n = axes.length
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, r: number): [number, number] => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]

  const ringPoly = (f: number) => axes.map((_, i) => pt(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ')
  const dataPoly = axes.map((a, i) => pt(i, (R * a.value) / 100).map(v => v.toFixed(1)).join(',')).join(' ')

  return (
    <svg className="flex-1 max-w-[300px]" viewBox="0 0 280 220" role="img" aria-label="Skill profile" data-testid="skill-radar">
      <defs>
        <radialGradient id="radarFill">
          <stop offset="0" stopColor={GOLD} stopOpacity={0.45} />
          <stop offset="1" stopColor={GOLD} stopOpacity={0.12} />
        </radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={ringPoly(f)} fill="none" stroke={GRID} strokeWidth={1} />
      ))}
      {axes.map((a, i) => {
        const [ex, ey] = pt(i, R)
        const [lx, ly] = pt(i, R + 16)
        const anchor = Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end'
        return (
          <g key={a.axis}>
            <line x1={cx} y1={cy} x2={ex.toFixed(1)} y2={ey.toFixed(1)} stroke={GRID} strokeWidth={1} />
            <text x={lx.toFixed(1)} y={(ly + 3).toFixed(1)} textAnchor={anchor} fontSize={10} fontWeight={600} fill={FAINT}>{a.axis}</text>
          </g>
        )
      })}
      <polygon points={dataPoly} fill="url(#radarFill)" stroke={GOLD_BRIGHT} strokeWidth={2} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [px, py] = pt(i, (R * a.value) / 100)
        return <circle key={a.axis} cx={px.toFixed(1)} cy={py.toFixed(1)} r={2.6} fill={GOLD_BRIGHT} />
      })}
    </svg>
  )
}

/** Cumulative net-result (simulated bankroll) area chart. */
export function EdgeChart({ points }: { points: EdgePoint[] }) {
  const W = 400
  const H = 132
  const padT = 12
  const padB = 14
  const padX = 4
  const vals = points.map(p => p.cumulative)
  const lo = Math.min(0, ...vals)
  const hi = Math.max(0, ...vals)
  const span = hi - lo || 1
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, points.length - 1)
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB)
  const up = (points[points.length - 1]?.cumulative ?? 0) >= 0
  const color = up ? 'var(--color-success)' : 'var(--color-error)'

  const P = points.map((p, i) => `${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`)
  const line = 'M' + P.join(' L')
  const area = `${line} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`

  return (
    <svg className="block w-full" height={132} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Simulated edge" data-testid="edge-chart">
      <defs>
        <linearGradient id="edgeFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.3} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke={GRID} strokeWidth={1} strokeDasharray="3 3" />
      <path d={area} fill="url(#edgeFill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1]?.cumulative ?? 0)} r={4} fill={color} />
    </svg>
  )
}
