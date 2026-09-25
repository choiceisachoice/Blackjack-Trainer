import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DailyBars } from './WebAnalyticsCharts'
import type { DailyRow } from '../../services/analytics/report'

function rows(n: number): DailyRow[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, '0')}`,
    visitors: i,
    sessions: i * 2,
    page_views: i * 3,
    registrations: i % 2,
  }))
}

describe('DailyBars', () => {
  it('draws one bar per day for the chosen metric', () => {
    const { container } = render(<DailyBars rows={rows(7)} metric="visitors" label="Visitors" />)
    const bars = container.querySelectorAll('rect')
    expect(bars).toHaveLength(7)
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Visitors')
    expect(container.querySelector('title')?.textContent).toBe('2026-09-01: 0')
  })

  it('renders an empty chart without throwing', () => {
    const { container } = render(<DailyBars rows={[]} metric="page_views" label="Page views" />)
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })

  it('a zero day still gets a hairline so the day is visibly there', () => {
    const { container } = render(<DailyBars rows={rows(2)} metric="visitors" label="v" />)
    const first = container.querySelectorAll('rect')[0]
    expect(first.getAttribute('height')).toBe('1')
  })
})
