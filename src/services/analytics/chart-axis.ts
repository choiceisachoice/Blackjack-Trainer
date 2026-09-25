/**
 * Axis helpers for the daily chart — pure, so the chart file exports only
 * the component (which is what keeps Fast Refresh working).
 */

/** `2026-09-25` → `25.9`, short enough for an axis. */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return `${Number(d)}.${Number(m)}`
}

/** Which bar indexes get a label: at most `max`, first and last always. */
export function labelIndexes(count: number, max = 8): Set<number> {
  const out = new Set<number>()
  if (count <= 0) return out
  const step = Math.max(1, Math.ceil((count - 1) / (max - 1)))
  for (let i = 0; i < count; i += step) out.add(i)
  out.add(count - 1)
  return out
}
