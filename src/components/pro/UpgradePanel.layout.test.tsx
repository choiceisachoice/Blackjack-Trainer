import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react'

/**
 * What the paywall puts in front of a visitor, and in what order: the case,
 * the price, three things Pro adds with a picture of the one they reached
 * for, and the full comparison one click further. The checks are about
 * content and state, not pixels — the layout itself was judged on stills.
 */
vi.mock('../../services/supabase/billing', () => ({
  startCheckout: vi.fn(async () => 'redirecting'),
  setPendingCheckout: vi.fn(),
}))
vi.mock('../../services/supabase/plan-prices', () => ({
  fetchPlanPrices: vi.fn(async () => []),
}))
vi.mock('../../services/analytics/events', () => ({ trackEvent: vi.fn(async () => {}) }))

import { UpgradePanel } from './UpgradePanel'
import { UpgradeModalHost } from './UpgradeModalHost'
import { useAppStore } from '../../store/app-store'
import { usePlanPriceStore } from '../../store/plan-price-store'
import { useStatsStore } from '../../store/stats-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { FEATURE_GROUPS } from '../../services/pro-features'
import en from '../../i18n/messages/en.json'

const LIVE = [
  { id: 'monthly' as const, amount: 890, currency: 'chf', interval: 'month' },
  { id: 'yearly' as const, amount: 6900, currency: 'chf', interval: 'year' },
]

const label = (key: string): string => (en.paywall as Record<string, string>)[key]

beforeEach(() => {
  cleanup()
  localStorage.clear()
  useAppStore.setState({ currentMode: 'home' })
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  usePlanPriceStore.setState({ status: 'ready', plans: LIVE })
  useUpgradePrompt.getState().hide()
})
afterEach(() => vi.restoreAllMocks())

describe('UpgradePanel — what Pro adds', () => {
  it('leads with three things, each one line, and no struck-through wall', () => {
    const { container } = render(<UpgradePanel />)
    for (const id of ['table', 'deviations', 'drills']) {
      expect(screen.getByTestId(`paywall-add-${id}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('paywall-add-table')).toHaveTextContent(label('addTableTitle'))
    expect(screen.getByTestId('paywall-add-deviations')).toHaveTextContent(label('addDeviationsBody'))
    expect(screen.getByTestId('paywall-add-drills')).toHaveTextContent(label('addDrillsTitle'))
    expect(container.querySelector('.line-through')).toBeNull()
  })

  it('shows the picture of the screen that was locked', () => {
    useAppStore.setState({ currentMode: 'betSpread' })
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-picture')).toHaveAttribute('data-subject', 'drills')
    expect(screen.getByTestId('paywall-add-drills')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('paywall-add-table')).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows the table where the table would be', () => {
    useAppStore.setState({ currentMode: 'casinoSession' })
    render(<UpgradePanel atTable />)
    expect(screen.getByTestId('paywall-picture')).toHaveAttribute('data-subject', 'table')
  })

  it('takes the subject from a host that knows it, as the public chart does', () => {
    render(<UpgradeModalHost subject="deviations" />)
    act(() => useUpgradePrompt.getState().show('Deviations are a Pro feature.'))
    expect(screen.getByTestId('paywall-picture')).toHaveAttribute('data-subject', 'deviations')
    expect(screen.getByTestId('paywall-sub')).toHaveTextContent('Deviations are a Pro feature.')
  })

  it('shows another picture when another row is chosen', () => {
    render(<UpgradePanel atTable />)
    fireEvent.click(screen.getByTestId('paywall-add-deviations'))
    expect(screen.getByTestId('paywall-picture')).toHaveAttribute('data-subject', 'deviations')
    expect(screen.getByTestId('paywall-add-deviations')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('paywall-add-table')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the whole comparison one click away, closed until asked for', () => {
    render(<UpgradePanel />)
    const compare = screen.getByTestId('paywall-compare') as HTMLDetailsElement
    expect(compare.open).toBe(false)
    expect(within(compare).getByText(label('compareAll'))).toBeInTheDocument()
    for (const group of FEATURE_GROUPS) {
      for (const row of group.rows) {
        expect(within(compare).getByText(label(row.labelKey))).toBeInTheDocument()
      }
    }
    // Every capability says, in words a screen reader reads, what Free has.
    const none = FEATURE_GROUPS.flatMap(g => g.rows).filter(r => r.free === 'none').length
    expect(within(compare).getAllByText(label('notIncluded'))).toHaveLength(none)
    expect(within(compare).getAllByText(label('basics')).length).toBeGreaterThan(0)
  })
})

describe('UpgradePanel — the price card', () => {
  it('names the price, the yearly saving and the amount on the button', () => {
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-price')).toHaveTextContent('CHF 69/year')
    expect(screen.getByTestId('paywall-saving')).toHaveTextContent('Save CHF 37.80 against CHF 8.90/month')
    expect(screen.getByTestId('billing-yearly')).toHaveTextContent('−35%')
    expect(screen.getByTestId('upgrade-yearly')).toHaveTextContent('Go Pro — CHF 69/year')
  })

  it('follows the toggle to the monthly plan', () => {
    render(<UpgradePanel />)
    fireEvent.click(screen.getByTestId('billing-monthly'))
    expect(screen.getByTestId('paywall-price')).toHaveTextContent('CHF 8.90/month')
    expect(screen.getByTestId('paywall-saving')).toHaveTextContent(en.pricing.flexibleSwitch)
    expect(screen.getByTestId('upgrade-monthly')).toHaveTextContent('Go Pro — CHF 8.90/month')
  })

  it('holds the place while the price is on its way, and names no figure', () => {
    usePlanPriceStore.setState({ status: 'loading', plans: [] })
    render(<UpgradePanel />)
    expect(screen.getByTestId('paywall-price-pending')).toBeInTheDocument()
    expect(screen.getByTestId('upgrade-yearly')).toHaveTextContent(en.pricing.goPro)
    expect(screen.getByTestId('billing-yearly')).not.toHaveTextContent('%')
  })

  it('says where the price will be when it could not be loaded, and still sells', () => {
    usePlanPriceStore.setState({ status: 'error', plans: [] })
    render(<UpgradePanel />)
    expect(screen.queryByTestId('paywall-price-pending')).toBeNull()
    expect(screen.getByTestId('paywall-price-unavailable')).toHaveTextContent(en.pricing.atCheckout)
    expect(screen.getByTestId('paywall-saving')).toBeEmptyDOMElement()
    expect(screen.getByTestId('upgrade-yearly')).toBeEnabled()
    expect(screen.getByTestId('upgrade-yearly')).toHaveTextContent(en.pricing.goPro)
  })

  it('puts who takes the money, cancelling and the VAT under the button', () => {
    render(<UpgradePanel />)
    const card = screen.getByTestId('paywall-price-card')
    expect(within(card).getByText(en.pricing.secureCheckout)).toBeInTheDocument()
    expect(within(card).getByTestId('paywall-vat-note')).toHaveTextContent('8.1% VAT in Switzerland')
  })
})
