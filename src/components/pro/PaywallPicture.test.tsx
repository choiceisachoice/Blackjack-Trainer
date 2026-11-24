import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { PaywallPicture } from './PaywallPicture'
import { BET_RAMP } from '../../engine/betting/bet-ramp'

/**
 * The paywall's picture is the product, not an illustration of it: the real
 * table, a real excerpt of the chart, and the ramp the drill grades against.
 * If any of these drifted from the screen it stands for, the paywall would be
 * selling a different product from the one behind it.
 */
afterEach(cleanup)

describe('PaywallPicture', () => {
  it('draws the table with the casino table itself', () => {
    render(<PaywallPicture subject="table" />)
    const picture = screen.getByTestId('paywall-picture-table')
    expect(within(picture).getByTestId('casino-table')).toBeInTheDocument()
  })

  it('draws the deviations as the strategy chart, with a count deviation named under it', () => {
    render(<PaywallPicture subject="deviations" />)
    const picture = screen.getByTestId('paywall-picture-deviations')
    // Six hard totals against five upcards — the chart's own cells.
    expect(within(picture).getAllByText(/^(H|S|SU|D)$/).length).toBe(30)
    expect(within(picture).getByText('Count Deviation')).toBeInTheDocument()
  })

  it('draws the drills with the engine’s bet ramp, step for step', () => {
    render(<PaywallPicture subject="drills" />)
    const ramp = screen.getByTestId('paywall-bet-ramp')
    for (const step of BET_RAMP) {
      expect(within(ramp).getByText(`${step.units}×`)).toBeInTheDocument()
    }
    // And the casino table's discard tray, the thing the estimation drill reads.
    expect(within(screen.getByTestId('paywall-picture-drills')).getByTestId('discard-stack')).toBeInTheDocument()
  })

  it('is decorative: the rows beside it say what it shows', () => {
    render(<PaywallPicture subject="drills" />)
    expect(screen.getByTestId('paywall-picture-drills')).toHaveAttribute('aria-hidden', 'true')
  })
})
