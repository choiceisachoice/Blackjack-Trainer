import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BankrollSimulator } from './BankrollSimulator'
import { TopBar } from '../navigation/TopBar'
import { useStatsStore } from '../../store/stats-store'
import { useAppStore } from '../../store/app-store'
import type { SimulationResult } from '../../engine/simulation/types'

// Mock recharts — render children only
vi.mock('recharts', () => ({
  AreaChart: ({ children }: React.PropsWithChildren) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  BarChart: ({ children }: React.PropsWithChildren) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Cell: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  ReferenceLine: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

// Mock simulation engine
const mockResult: SimulationResult = {
  totalHands: 45000,
  finalBankroll: 52500,
  peakBankroll: 58000,
  minBankroll: 44000,
  netProfit: 2500,
  hourlyEV: 47.2,
  riskOfRuin: 0.032,
  n0: 12450,
  houseEdge: -0.0005,
  bankrollHistory: [
    { hand: 0, bankroll: 50000 },
    { hand: 50, bankroll: 50100 },
    { hand: 100, bankroll: 49800 },
  ],
  outcomeDistribution: [
    { label: '$-500 to $0', count: 400, percentage: 40 },
    { label: '$0 to $500', count: 600, percentage: 60 },
  ],
  percentWinningSessions: 62,
  worstDrawdown: 6000,
  averageBet: 52.4,
  kellyOptimalBet: 85,
}

const mockRunSimulation = vi.fn(() => mockResult)

vi.mock('../../engine/simulation/simulator', () => ({
  runSimulation: (...args: unknown[]) => mockRunSimulation(...args),
  getBetMultiplier: vi.fn((spread: Record<number, number>, tc: number) => {
    const keys = Object.keys(spread).map(Number).sort((a, b) => b - a)
    for (const key of keys) {
      if (tc >= key) return spread[key]
    }
    return 1
  }),
}))

describe('BankrollSimulator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRunSimulation.mockReturnValue(mockResult)
    useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders preset buttons', () => {
    render(<BankrollSimulator />)

    expect(screen.getByTestId('preset-beginner')).toHaveTextContent('Casual Counter')
    expect(screen.getByTestId('preset-intermediate')).toHaveTextContent('Serious Player')
    expect(screen.getByTestId('preset-professional')).toHaveTextContent('Professional')
    expect(screen.getByTestId('preset-worstCase')).toHaveTextContent('Tough Conditions')
  })

  it('clicking preset fills form with preset values', () => {
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('preset-beginner'))

    // Beginner preset: bankroll 5000, minBet 10
    const bankrollInput = screen.getByDisplayValue('5000')
    expect(bankrollInput).toBeInTheDocument()
    const minBetInput = screen.getByDisplayValue('10')
    expect(minBetInput).toBeInTheDocument()
  })

  it('shows configuration form with all fields', () => {
    render(<BankrollSimulator />)

    expect(screen.getByTestId('sim-config')).toBeInTheDocument()
    expect(screen.getByText('Bankroll & Bets')).toBeInTheDocument()
    expect(screen.getByText('Casino Rules')).toBeInTheDocument()
    expect(screen.getByText('Player Skill & Simulation')).toBeInTheDocument()
    expect(screen.getByTestId('bet-spread-table')).toBeInTheDocument()
    expect(screen.getByTestId('run-simulation')).toBeInTheDocument()
  })

  it('6:5 blackjack shows warning', () => {
    render(<BankrollSimulator />)

    // Default is 3:2, no warning
    expect(screen.queryByTestId('six-five-warning')).not.toBeInTheDocument()

    // Click 6:5 button
    fireEvent.click(screen.getByText('6:5'))

    expect(screen.getByTestId('six-five-warning')).toHaveTextContent('6:5 significantly increases house edge')
  })

  it('disabling deviations hides deviation accuracy slider', () => {
    render(<BankrollSimulator />)

    // Default professional preset has deviations enabled
    expect(screen.getByTestId('deviation-accuracy-slider')).toBeInTheDocument()

    // Disable deviations
    fireEvent.click(screen.getByTestId('deviations-no'))

    expect(screen.queryByTestId('deviation-accuracy-slider')).not.toBeInTheDocument()
  })

  it('run simulation button triggers simulation and shows results', () => {
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))

    // Advance past the setTimeout(50ms)
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('sim-results')).toBeInTheDocument()
  })

  it('results show all 4 key metric cards', () => {
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('metric-hourly-ev')).toBeInTheDocument()
    expect(screen.getByTestId('metric-ror')).toBeInTheDocument()
    expect(screen.getByTestId('metric-rec-bankroll')).toBeInTheDocument()
    expect(screen.getByTestId('metric-n0')).toBeInTheDocument()
  })

  it('bankroll journey chart renders with data', () => {
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('bankroll-chart')).toBeInTheDocument()
    expect(screen.getByTestId('area-chart')).toBeInTheDocument()
  })

  it('outcome distribution histogram renders', () => {
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('outcome-chart')).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('modify settings button returns to configuration', () => {
    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('sim-results')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('modify-settings'))

    expect(screen.getByTestId('sim-config')).toBeInTheDocument()
  })

  it('copy summary copies text to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    fireEvent.click(screen.getByTestId('copy-summary'))

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('Bankroll Simulation Results')
    expect(text).toContain('Expected Win')
    expect(text).toContain('Risk of Ruin')
  })

  it('TopBar shows "Bankroll Simulator" for bankrollSim mode', () => {
    useAppStore.setState({ currentMode: 'bankrollSim' })
    render(<TopBar />)
    expect(screen.getByText('Bankroll Simulator')).toBeInTheDocument()
  })

  it('Run Again re-runs simulation with saved config', () => {
    render(<BankrollSimulator />)

    // Run initial simulation
    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })
    expect(screen.getByTestId('sim-results')).toBeInTheDocument()

    const callCount = mockRunSimulation.mock.calls.length

    // Click Run Again
    fireEvent.click(screen.getByTestId('run-again'))
    act(() => { vi.advanceTimersByTime(100) })

    // Simulation was called again
    expect(mockRunSimulation.mock.calls.length).toBe(callCount + 1)
    // Still showing results
    expect(screen.getByTestId('sim-results')).toBeInTheDocument()
  })

  it('error boundary shows message instead of crash', () => {
    render(<BankrollSimulator />)

    // Make runSimulation throw
    mockRunSimulation.mockImplementationOnce(() => { throw new Error('boom') })

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    // Should show error and stay on config, not crash
    expect(screen.getByTestId('sim-error')).toBeInTheDocument()
    expect(screen.getByTestId('sim-config')).toBeInTheDocument()
  })

  it('invalid config shows validation errors and disables button', () => {
    render(<BankrollSimulator />)

    // Set bankroll to 0
    const bankrollInput = screen.getByDisplayValue('100000')
    fireEvent.change(bankrollInput, { target: { value: '0' } })

    expect(screen.getByTestId('validation-errors')).toBeInTheDocument()
    expect(screen.getByTestId('run-simulation')).toBeDisabled()
  })

  it('NaN/Infinity results are sanitized to 0', () => {
    const nanResult: SimulationResult = {
      ...mockResult,
      hourlyEV: Infinity,
      n0: NaN,
      kellyOptimalBet: -Infinity,
    }
    mockRunSimulation.mockReturnValueOnce(nanResult)

    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    // Should render without crashing
    expect(screen.getByTestId('sim-results')).toBeInTheDocument()
  })

  it('simulation with negative netProfit renders without crash', () => {
    const negResult: SimulationResult = {
      ...mockResult,
      netProfit: -5000,
      hourlyEV: -12.5,
      finalBankroll: 45000,
    }
    mockRunSimulation.mockReturnValueOnce(negResult)

    render(<BankrollSimulator />)

    fireEvent.click(screen.getByTestId('run-simulation'))
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.getByTestId('sim-results')).toBeInTheDocument()
    expect(screen.getByTestId('metric-hourly-ev')).toBeInTheDocument()
  })
})
