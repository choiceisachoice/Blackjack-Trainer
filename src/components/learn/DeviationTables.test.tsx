import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeviationTables } from './DeviationTables'

describe('DeviationTables', () => {
  it('prints both lists with every row', () => {
    render(<DeviationTables />)
    expect(screen.getByTestId('table-i18').querySelectorAll('tbody tr')).toHaveLength(18)
    expect(screen.getByTestId('table-fab4').querySelectorAll('tbody tr')).toHaveLength(4)
  })

  it('translates the plays and signs the indices', () => {
    render(<DeviationTables />)
    const i18 = screen.getByTestId('table-i18')
    // Insurance leads: any hand, dealer ace, from +3.
    const first = i18.querySelector('tbody tr')!
    expect(first).toHaveTextContent('Any hand')
    expect(first).toHaveTextContent('+3')
    expect(first).toHaveTextContent('Take insurance')
    // 16 vs 10 at 0 — the classic — reads Stand / Hit in the chart's own words.
    expect(i18).toHaveTextContent(/16\s*10\s*0\s*Stand\s*Hit/)
  })

  it('shows a pair as a pair', () => {
    render(<DeviationTables />)
    expect(screen.getByTestId('table-i18')).toHaveTextContent('10-10')
  })
})
