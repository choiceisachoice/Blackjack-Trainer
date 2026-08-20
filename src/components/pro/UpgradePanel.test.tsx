import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { UpgradePanel } from './UpgradePanel'
import { startCheckout } from '../../services/supabase/billing'
import { LEGAL_META } from '../../pages/legal/legal-meta'

/**
 * What a customer reads when the checkout will not open.
 *
 * This is the last screen before money changes hands, and it is also the only
 * alerting this path has: `create-checkout-session` is not a webhook, so
 * nothing in Stripe notices when it fails. Whether the failure ever reaches us
 * depends entirely on whether the person on the paywall is given a reason to
 * write in — which makes the wording here operational, not cosmetic.
 *
 * The panel used to render `e.message`. From `supabase-js` that is "Edge
 * Function returned a non-2xx status code": English on a German paywall,
 * meaningless to a customer, and with nowhere to go next.
 */
vi.mock('../../services/supabase/billing', () => ({
  startCheckout: vi.fn(),
}))

// The panel fetches prices on mount. Irrelevant here, and left unmocked it
// would reach for a Supabase URL that the test environment deliberately blanks.
vi.mock('../../services/supabase/plan-prices', () => ({
  fetchPlanPrices: vi.fn(async () => []),
}))

const SUPABASE_MESSAGE = 'Edge Function returned a non-2xx status code'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('UpgradePanel — a failed checkout', () => {
  it('never shows the thrown technical message', async () => {
    vi.mocked(startCheckout).mockImplementation(async () => {
      throw new Error(SUPABASE_MESSAGE)
    })
    render(<UpgradePanel />)

    fireEvent.click(await screen.findByTestId('upgrade-yearly'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toContain(SUPABASE_MESSAGE)
    expect(screen.queryByText(new RegExp(SUPABASE_MESSAGE))).toBeNull()
  })

  it('names an address the customer can write to', async () => {
    vi.mocked(startCheckout).mockImplementation(async () => {
      throw new Error(SUPABASE_MESSAGE)
    })
    render(<UpgradePanel />)

    fireEvent.click(await screen.findByTestId('upgrade-yearly'))

    expect((await screen.findByRole('alert')).textContent).toContain(LEGAL_META.contactEmail)
  })

  it('keeps the detail, in the console where it is read while diagnosing', async () => {
    const boom = new Error(SUPABASE_MESSAGE)
    vi.mocked(startCheckout).mockImplementation(async () => {
      throw boom
    })
    render(<UpgradePanel />)

    fireEvent.click(await screen.findByTestId('upgrade-yearly'))

    await waitFor(() => {
      const logged = vi.mocked(console.error).mock.calls
      expect(logged.some(args => args.includes(boom))).toBe(true)
    })
  })

  it('re-enables the button, so a transient failure can be retried', async () => {
    vi.mocked(startCheckout).mockImplementation(async () => {
      throw new Error(SUPABASE_MESSAGE)
    })
    render(<UpgradePanel />)

    const button = await screen.findByTestId('upgrade-yearly')
    fireEvent.click(button)

    await screen.findByRole('alert')
    expect(button).not.toBeDisabled()
  })
})
