import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TableLegend } from './TableLegend'

afterEach(cleanup)

describe('TableLegend', () => {
  it('shows 3:2 payout and S17 wording for standard rules', () => {
    render(<TableLegend blackjackPays={1.5} dealerHitsSoft17={false} />)
    expect(screen.getByText('BLACKJACK PAYS 3 TO 2')).toBeInTheDocument()
    expect(screen.getByText('DEALER MUST STAND ON SOFT 17')).toBeInTheDocument()
    expect(screen.getByText('INSURANCE PAYS 2 TO 1')).toBeInTheDocument()
  })

  it('adapts to 6:5 payout and H17 rule', () => {
    render(<TableLegend blackjackPays={1.2} dealerHitsSoft17={true} />)
    expect(screen.getByText('BLACKJACK PAYS 6 TO 5')).toBeInTheDocument()
    expect(screen.getByText('DEALER MUST HIT SOFT 17')).toBeInTheDocument()
  })
})
