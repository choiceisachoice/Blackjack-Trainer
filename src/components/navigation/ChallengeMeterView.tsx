import type { ReactNode } from 'react'
import { ProgressBar } from '../common/ui'
import type { ChallengeMeter } from './challenge-meter'

const DONE_FILL = 'linear-gradient(180deg, #4ade80, var(--color-success))'

/**
 * A challenge's progress, drawn: a row of slots for a small tally, a bar for
 * anything else, with the figures to its right.
 *
 * The figures are the caller's (they differ between a tally, a best time and
 * a finished challenge); this only decides the shape and keeps both shapes on
 * one baseline.
 */
export function ChallengeMeterView({
  meter,
  done,
  label,
}: {
  meter: ChallengeMeter
  /** Complete: the fill turns green. */
  done: boolean
  /** What the meter reads, e.g. "2 / 5 · 3 to go". */
  label: ReactNode
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      {meter.kind === 'pips' ? (
        <div
          className="flex-1 flex items-center gap-1"
          role="img"
          aria-label={`${meter.filled} / ${meter.steps}`}
          data-testid="challenge-pips"
        >
          {Array.from({ length: meter.steps }, (_, i) => (
            <span
              key={i}
              data-filled={i < meter.filled}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ease-out ${
                i < meter.filled ? (done ? 'bg-success' : 'bg-gold') : 'bg-contrast/12'
              }`}
            />
          ))}
        </div>
      ) : (
        <ProgressBar
          className="flex-1"
          height={6}
          value={meter.percent}
          testId="progress-bar"
          fill={done ? DONE_FILL : undefined}
        />
      )}
      <span className="shrink-0 text-xs tabular-nums text-content/55">{label}</span>
    </div>
  )
}
