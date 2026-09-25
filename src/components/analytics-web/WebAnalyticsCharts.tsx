import type { DailyRow } from '../../services/analytics/report'
import { labelIndexes, shortDay } from '../../services/analytics/chart-axis'

/**
 * The one chart the admin dashboard needs: a value per day as bars.
 *
 * Hand-authored SVG like the learner's analytics, for the same reason —
 * the visuals inherit the theme through CSS variables and nothing new is
 * downloaded. Labels are thinned so a 30-day range does not print thirty
 * dates on top of each other.
 */

const GRID = 'color-mix(in srgb, var(--color-contrast) 9%, transparent)'
const FAINT = 'color-mix(in srgb, var(--color-content) 38%, transparent)'
const GOLD = 'var(--color-gold)'

/** Which field of a daily row the bars show. */
export type DailyMetric = 'visitors' | 'sessions' | 'page_views' | 'registrations'

export function DailyBars({ rows, metric, label }: { rows: DailyRow[]; metric: DailyMetric; label: string }) {
  const W = 680
  const H = 200
  const padL = 30
  const padR = 8
  const padT = 14
  const padB = 24
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const n = rows.length
  const max = Math.max(1, ...rows.map(r => r[metric]))
  const gap = n > 20 ? 2 : 4
  const barW = n > 0 ? Math.max(1, (innerW - gap * (n - 1)) / n) : 0
  const x = (i: number) => padL + i * (barW + gap)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const labels = labelIndexes(n)
  const ticks = [0, 0.5, 1].map(f => Math.round(max * f))

  return (
    <svg
      className="block w-full"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-testid={`daily-${metric}`}
    >
      {ticks.map(v => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill={FAINT}>{v}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const v = r[metric]
        const top = y(v)
        return (
          <g key={r.day}>
            <rect
              x={x(i)}
              y={v === 0 ? padT + innerH - 1 : top}
              width={barW}
              height={v === 0 ? 1 : padT + innerH - top}
              rx={n > 20 ? 1 : 2}
              fill={GOLD}
              opacity={v === 0 ? 0.25 : 0.85}
            >
              <title>{`${r.day}: ${v}`}</title>
            </rect>
            {labels.has(i) && (
              <text x={x(i) + barW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={FAINT}>
                {shortDay(r.day)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
