import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { StrategyChart } from './StrategyChart'
import { useAppStore } from '../../store/app-store'
import { DEFAULT_RULES } from '../../engine/rules/types'

/** The S17/H17 controls live in a labelled group (cells can share their text). */
function ruleButton(name: 'S17' | 'H17') {
  return within(screen.getByRole('group', { name: 'Dealer rule' })).getByRole('button', { name })
}

describe('StrategyChart', () => {
  beforeEach(() => {
    useAppStore.setState({ selectedRules: { ...DEFAULT_RULES, dealerHitsSoft17: false } })
  })

  it('renders the chart with the rule controls and deviation toggle', () => {
    render(<StrategyChart />)
    expect(screen.getByText('Basic Strategy Chart')).toBeInTheDocument()
    expect(ruleButton('S17')).toBeInTheDocument()
    expect(ruleButton('H17')).toBeInTheDocument()
    expect(screen.getByText(/Deviations \(Illustrious 18\)/)).toBeInTheDocument()
  })

  it('shows the deviation legend by default and hides it when toggled off', () => {
    render(<StrategyChart />)
    expect(screen.getByText('Count Deviation')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Deviations \(Illustrious 18\)/))
    expect(screen.queryByText('Count Deviation')).not.toBeInTheDocument()
  })

  it('opens the detail panel when a cell is clicked', () => {
    render(<StrategyChart />)
    // By test id, not by a styling class. This used to look for `text-white`,
    // which broke the moment the cell ink changed — the same coupling that
    // once hung a test id on a translated label.
    const cell = screen.getAllByTestId('chart-cell')[0]
    expect(cell).toBeTruthy()
    fireEvent.click(cell)
    expect(screen.getByText(/Your Hand:/)).toBeInTheDocument()
  })

  it('fits a phone: no fixed width below sm, all ten dealer columns in one grid', () => {
    render(<StrategyChart />)
    const content = screen.getByTestId('chart-scroll').firstElementChild as HTMLElement
    // The 616px floor applies from `sm` up only; on a phone the chart shrinks to fit.
    expect(content.style.minWidth).toBe('')
    expect(content.className).toContain('sm:min-w-[616px]')
    const firstRow = screen.getAllByTestId('chart-hand')[0].parentElement as HTMLElement
    expect(firstRow.className).toContain('grid-cols-[40px_repeat(10,minmax(0,1fr))]')
    expect(firstRow.querySelectorAll('[data-testid="chart-cell"]')).toHaveLength(10)
  })

  it('switches the strategy table when H17 is selected', () => {
    render(<StrategyChart />)
    expect(screen.getByText(/6 Deck/).textContent).toMatch(/S17/)
    fireEvent.click(ruleButton('H17'))
    expect(screen.getByText(/6 Deck/).textContent).toMatch(/H17/)
  })
})
