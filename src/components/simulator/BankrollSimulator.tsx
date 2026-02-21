import { useState, useCallback, useMemo } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { runSimulation, getBetMultiplier } from '../../engine/simulation/simulator'
import {
  beginnerPreset,
  intermediatePreset,
  professionalPreset,
  worstCasePreset,
} from '../../engine/simulation/presets'
import { calculateHouseEdge, EDGE_PER_TC, DEVIATION_TC_BONUS, HAND_SD, TC_DISTRIBUTION } from '../../engine/simulation/math-utils'
import type { SimulationConfig, SimulationResult } from '../../engine/simulation/types'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'

// ── Preset definitions ──────────────────────────────────────────

interface UIPreset {
  key: string
  label: string
  description: string
  config: SimulationConfig
  handsPerHour: number
  countingAccuracy: number
  useDeviations: boolean
}

const UI_PRESETS: UIPreset[] = [
  {
    key: 'beginner',
    label: 'Casual Counter',
    description: 'Small bankroll, conservative spread',
    config: beginnerPreset,
    handsPerHour: 60,
    countingAccuracy: 0.8,
    useDeviations: false,
  },
  {
    key: 'intermediate',
    label: 'Serious Player',
    description: 'Medium bankroll, wider spread',
    config: intermediatePreset,
    handsPerHour: 80,
    countingAccuracy: 0.9,
    useDeviations: true,
  },
  {
    key: 'professional',
    label: 'Professional',
    description: 'Large bankroll, aggressive spread',
    config: professionalPreset,
    handsPerHour: 100,
    countingAccuracy: 0.95,
    useDeviations: true,
  },
  {
    key: 'worstCase',
    label: 'Tough Conditions',
    description: 'Hostile rules, shallow penetration',
    config: worstCasePreset,
    handsPerHour: 80,
    countingAccuracy: 0.85,
    useDeviations: true,
  },
]

// ── TC display labels for rendering (uses imported TC_DISTRIBUTION for data) ───

const TC_DISPLAY_LABELS: Record<number, string> = {
  0: '\u2264 0',
  1: '+1',
  2: '+2',
  3: '+3',
  4: '+4',
  5: '+5+',
}

const TC_DISPLAY = TC_DISTRIBUTION.map(d => ({
  ...d,
  label: TC_DISPLAY_LABELS[d.tc] ?? `+${d.tc}`,
}))

// ── Helpers ─────────────────────────────────────────────────────

/** Format a dollar amount with sign. */
function fmtDollar(n: number, showSign = false): string {
  const sign = showSign && n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/** Format a dollar amount with cents. */
function fmtDollarCents(n: number, showSign = false): string {
  const sign = showSign && n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Format percentage (0-1 scale). */
function fmtPct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`
}

/** Risk-of-ruin color coding. */
function rorColor(ror: number): string {
  if (ror < 0.05) return 'text-green-400'
  if (ror <= 0.15) return 'text-yellow-400'
  return 'text-red-400'
}

/** Compute theoretical average bet from TC distribution and bet spread. */
function theoreticalAvgBet(minBet: number, spread: Record<number, number>, getBetMult: typeof getBetMultiplier): number {
  let avg = 0
  for (const { tc, pct } of TC_DISTRIBUTION) {
    avg += minBet * getBetMult(spread, tc) * pct
  }
  return avg
}

// ── Component ───────────────────────────────────────────────────

/**
 * Bankroll Simulator: configure casino rules, bet spread, and player skill
 * then run a Monte Carlo simulation to see expected results.
 */
export function BankrollSimulator() {
  // ── Form state ──
  const [bankroll, setBankroll] = useState(100000)
  const [minBet, setMinBet] = useState(100)
  const [tc1, setTc1] = useState(2)
  const [tc2, setTc2] = useState(4)
  const [tc3, setTc3] = useState(8)
  const [tc4, setTc4] = useState(12)
  const [tc5, setTc5] = useState(16)
  const [numDecks, setNumDecks] = useState(6)
  const [penetration, setPenetration] = useState(0.75)
  const [dealerHitsSoft17, setDealerHitsSoft17] = useState(false)
  const [doubleAfterSplit, setDoubleAfterSplit] = useState(true)
  const [surrenderAllowed, setSurrenderAllowed] = useState(true)
  const [blackjackPays, setBlackjackPays] = useState(1.5)
  const [countingAccuracy, setCountingAccuracy] = useState(0.95)
  const [useDeviations, setUseDeviations] = useState(true)
  const [deviationAccuracy, setDeviationAccuracy] = useState(0.9)
  const [handsPerHour, setHandsPerHour] = useState(80)
  const [numShoes, setNumShoes] = useState(10000)

  // ── UI state ──
  const [activePreset, setActivePreset] = useState<string | null>('professional')
  const [phase, setPhase] = useState<'config' | 'results'>('config')
  const [isSimulating, setIsSimulating] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [configSnapshot, setConfigSnapshot] = useState<{
    bankroll: number; minBet: number; handsPerHour: number;
    useDeviations: boolean; deviationAccuracy: number;
  }>({ bankroll: 100000, minBet: 100, handsPerHour: 80, useDeviations: true, deviationAccuracy: 0.9 })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedConfig, setSavedConfig] = useState<SimulationConfig | null>(null)

  // ── Stats store (for "Use My Stats") ──
  const sessions = useStatsStore(s => s.sessions)

  const statsAvailable = useMemo(() => {
    const tcSessions = sessions.filter(s => s.mode === 'tableCounting')
    const devSessions = sessions.filter(s => s.mode === 'deviationFlashCards' || s.mode === 'deviationAtTable')
    const tcAvg = tcSessions.length > 0
      ? tcSessions.reduce((sum, s) => sum + s.accuracy, 0) / tcSessions.length
      : null
    const devAvg = devSessions.length > 0
      ? devSessions.reduce((sum, s) => sum + s.accuracy, 0) / devSessions.length
      : null
    return { tcAvg, devAvg }
  }, [sessions])

  // ── Preset application ──
  const applyPreset = useCallback((preset: UIPreset) => {
    const c = preset.config
    setBankroll(c.bankroll)
    setMinBet(c.minBet)
    setTc1(c.betSpread[1] ?? 1)
    setTc2(c.betSpread[2] ?? 2)
    setTc3(c.betSpread[3] ?? 4)
    setTc4(c.betSpread[4] ?? 8)
    setTc5(c.betSpread[5] ?? 16)
    setNumDecks(c.numDecks)
    setPenetration(c.penetration)
    setDealerHitsSoft17(c.dealerHitsSoft17)
    setDoubleAfterSplit(c.doubleAfterSplit)
    setSurrenderAllowed(c.surrenderAllowed)
    setBlackjackPays(c.blackjackPays)
    setDeviationAccuracy(c.deviationAccuracy)
    setNumShoes(c.numShoes)
    setHandsPerHour(preset.handsPerHour)
    setCountingAccuracy(preset.countingAccuracy)
    setUseDeviations(preset.useDeviations)
    setActivePreset(preset.key)
  }, [])

  // ── Build engine config (explicit Number() conversion for safety) ──
  const buildConfig = useCallback((): SimulationConfig => ({
    bankroll: Number(bankroll) || 10000,
    minBet: Number(minBet) || 10,
    numShoes: Number(numShoes) || 1000,
    numDecks: Number(numDecks) || 6,
    penetration: Math.max(0.01, Math.min(0.99, Number(penetration) || 0.75)),
    betSpread: { 1: Number(tc1) || 1, 2: Number(tc2) || 2, 3: Number(tc3) || 4, 4: Number(tc4) || 8, 5: Number(tc5) || 16 },
    countingSystem: 'Hi-Lo',
    dealerHitsSoft17,
    doubleAfterSplit,
    surrenderAllowed,
    blackjackPays,
    deviationAccuracy: useDeviations ? Math.max(0, Math.min(1, Number(deviationAccuracy) || 0)) : 0,
    countingAccuracy: Math.max(0, Math.min(1, Number(countingAccuracy) || 0.95)),
  }), [bankroll, minBet, numShoes, numDecks, penetration, tc1, tc2, tc3, tc4, tc5, dealerHitsSoft17, doubleAfterSplit, surrenderAllowed, blackjackPays, useDeviations, deviationAccuracy, countingAccuracy])

  // ── Sanitize simulation result (NaN/Infinity → 0) ──
  const sanitizeResult = (r: SimulationResult): SimulationResult => {
    const sanitized = { ...r }
    for (const key of Object.keys(sanitized) as (keyof SimulationResult)[]) {
      const val = sanitized[key]
      if (typeof val === 'number' && !isFinite(val)) {
        (sanitized as Record<string, unknown>)[key] = 0
      }
    }
    return sanitized
  }

  // ── Run simulation ──
  const executeSimulation = useCallback((config: SimulationConfig) => {
    setIsSimulating(true)
    setErrorMessage(null)
    setTimeout(() => {
      try {
        const simResult = sanitizeResult(runSimulation(config))
        setResult(simResult)
        setPhase('results')
        useAchievementStore.getState().checkSimulationAchievements(simResult)
      } catch (error) {
        console.error('Simulation failed:', error)
        setErrorMessage('Simulation produced invalid results. Try adjusting your settings.')
        setPhase('config')
      } finally {
        setIsSimulating(false)
      }
    }, 50)
  }, [])

  const handleRunSimulation = useCallback(() => {
    const config = buildConfig()
    // Deep copy for safety — prevents mutation across re-runs
    const configCopy: SimulationConfig = { ...config, betSpread: { ...config.betSpread } }
    setSavedConfig(configCopy)
    setConfigSnapshot({
      bankroll: config.bankroll,
      minBet: config.minBet,
      handsPerHour: Number(handsPerHour) || 80,
      useDeviations,
      deviationAccuracy: config.deviationAccuracy,
    })
    executeSimulation(configCopy)
  }, [buildConfig, handsPerHour, useDeviations, executeSimulation])

  const handleRunAgain = useCallback(() => {
    if (!savedConfig) return
    // Deep copy again to prevent mutation between re-runs
    const configCopy: SimulationConfig = { ...savedConfig, betSpread: { ...savedConfig.betSpread } }
    executeSimulation(configCopy)
  }, [savedConfig, executeSimulation])

  // ── Copy summary ──
  const handleCopySummary = useCallback(() => {
    if (!result || !savedConfig) return
    const maxMult = Math.max(tc1, tc2, tc3, tc4, tc5)
    const cpAvg = theoreticalAvgBet(configSnapshot.minBet, savedConfig.betSpread, getBetMultiplier)
    const cpHourly = result.weightedPlayerEdge * cpAvg * (configSnapshot.handsPerHour || 80)
    const text = `Bankroll Simulation Results:
Starting Bankroll: ${fmtDollar(configSnapshot.bankroll)}
Bet Spread: ${fmtDollar(configSnapshot.minBet)}-${fmtDollar(configSnapshot.minBet * maxMult)}
Expected Win: ${fmtDollarCents(cpHourly, true)}/hr
Risk of Ruin: ${fmtPct(result.riskOfRuin)}
N-Zero: ${result.n0.toLocaleString()} hands`
    navigator.clipboard.writeText(text)
  }, [result, savedConfig, configSnapshot, tc1, tc2, tc3, tc4, tc5])

  const maxBet = minBet * Math.max(tc1, tc2, tc3, tc4, tc5)
  const estimatedHands = Math.round(numShoes * (numDecks * 52 * penetration) / 5.2)

  // ── Input validation ──
  const validationErrors: string[] = []
  if (bankroll <= 0) validationErrors.push('Bankroll must be greater than 0')
  if (minBet <= 0) validationErrors.push('Min bet must be greater than 0')
  if (bankroll < minBet) validationErrors.push('Bankroll must be at least the minimum bet')
  const isConfigValid = validationErrors.length === 0

  // ── Derived values for Bet Spread Analysis (results phase uses saved config) ──
  const betSpread = useMemo(() => {
    if (phase === 'results' && savedConfig) return savedConfig.betSpread
    return { 1: tc1, 2: tc2, 3: tc3, 4: tc4, 5: tc5 }
  }, [phase, savedConfig, tc1, tc2, tc3, tc4, tc5])

  const baseEdge = useMemo(() => {
    if (phase === 'results' && savedConfig) return calculateHouseEdge(savedConfig)
    return calculateHouseEdge({ dealerHitsSoft17, doubleAfterSplit, surrenderAllowed, blackjackPays, numDecks })
  }, [phase, savedConfig, dealerHitsSoft17, doubleAfterSplit, surrenderAllowed, blackjackPays, numDecks])

  const tcGain = useMemo(() => {
    const devAcc = phase === 'results' && savedConfig
      ? savedConfig.deviationAccuracy
      : (useDeviations ? deviationAccuracy : 0)
    return EDGE_PER_TC + DEVIATION_TC_BONUS * devAcc
  }, [phase, savedConfig, useDeviations, deviationAccuracy])

  // ════════════════════════════════════════════════════════════════
  //  PHASE 1: Configuration
  // ════════════════════════════════════════════════════════════════

  if (phase === 'config') {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="sim-config">
        {/* Presets */}
        <section>
          <h2 className="text-lg font-semibold text-content mb-3">Preset Configurations</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {UI_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                data-testid={`preset-${p.key}`}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  activePreset === p.key
                    ? 'border-gold bg-gold/10 ring-1 ring-gold/40'
                    : 'border-contrast/10 bg-contrast/5 hover:border-contrast/30'
                }`}
              >
                <span className="text-sm font-semibold text-content">{p.label}</span>
                <p className="text-xs text-content/40 mt-1">{p.description}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Config Form — 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Column 1: Bankroll & Bets */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gold uppercase tracking-wider">Bankroll & Bets</h3>

            <label className="block">
              <span className="text-xs text-content/60">Starting Bankroll</span>
              <div className="flex items-center mt-1">
                <span className="text-content/40 mr-1">$</span>
                <input type="number" min={1000} step={1000} value={bankroll}
                  onChange={e => { setBankroll(Number(e.target.value)); setActivePreset(null) }}
                  className="w-full bg-contrast/10 border border-contrast/20 rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-gold/60" />
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-content/60">Minimum Bet</span>
              <div className="flex items-center mt-1">
                <span className="text-content/40 mr-1">$</span>
                <input type="number" min={5} step={5} value={minBet}
                  onChange={e => { setMinBet(Number(e.target.value)); setActivePreset(null) }}
                  className="w-full bg-contrast/10 border border-contrast/20 rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-gold/60" />
              </div>
            </label>

            {/* Bet Spread Table */}
            <div>
              <span className="text-xs text-content/60">Bet Spread</span>
              <table className="w-full mt-1 text-sm" data-testid="bet-spread-table">
                <thead>
                  <tr className="text-xs text-content/40">
                    <th className="text-left py-1">TC</th>
                    <th className="text-right py-1">Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-content/50">
                    <td className="py-1">{'\u2264'} 0</td>
                    <td className="text-right">1x</td>
                  </tr>
                  {[
                    { label: '+1', val: tc1, set: setTc1 },
                    { label: '+2', val: tc2, set: setTc2 },
                    { label: '+3', val: tc3, set: setTc3 },
                    { label: '+4', val: tc4, set: setTc4 },
                    { label: '+5+', val: tc5, set: setTc5 },
                  ].map(r => (
                    <tr key={r.label}>
                      <td className="py-1 text-content/70">{r.label}</td>
                      <td className="text-right">
                        <input type="number" min={1} max={50} value={r.val}
                          onChange={e => { r.set(Number(e.target.value)); setActivePreset(null) }}
                          className="w-16 bg-contrast/10 border border-contrast/20 rounded px-2 py-1 text-sm text-content text-right focus:outline-none focus:border-gold/60" />
                        <span className="text-content/40 ml-1">x</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-content/40 mt-1">Max Bet: {fmtDollar(maxBet)}</p>
            </div>
          </section>

          {/* Column 2: Casino Rules */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gold uppercase tracking-wider">Casino Rules</h3>

            <label className="block">
              <span className="text-xs text-content/60">Number of Decks</span>
              <select value={numDecks}
                onChange={e => { setNumDecks(Number(e.target.value)); setActivePreset(null) }}
                className="w-full mt-1 bg-contrast/10 border border-contrast/20 rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-gold/60 cursor-pointer">
                <option value={2} className="bg-select-bg">2</option>
                <option value={6} className="bg-select-bg">6</option>
                <option value={8} className="bg-select-bg">8</option>
              </select>
            </label>

            <div>
              <span className="text-xs text-content/60">Penetration: {Math.round(penetration * 100)}%</span>
              <input type="range" min={50} max={90} step={5} value={penetration * 100}
                onChange={e => { setPenetration(Number(e.target.value) / 100); setActivePreset(null) }}
                className="w-full mt-1 accent-gold" />
              <p className="text-xs text-content/40">
                {(numDecks * penetration).toFixed(1)} decks dealt of {numDecks}
              </p>
            </div>

            {/* Toggle: Dealer Soft 17 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-content/60">Dealer Soft 17</span>
              <div className="flex rounded-lg overflow-hidden border border-contrast/20">
                <button onClick={() => { setDealerHitsSoft17(false); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!dealerHitsSoft17 ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  Stands (S17)
                </button>
                <button onClick={() => { setDealerHitsSoft17(true); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${dealerHitsSoft17 ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  Hits (H17)
                </button>
              </div>
            </div>

            {/* Toggle: DAS */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-content/60">Double After Split</span>
              <div className="flex rounded-lg overflow-hidden border border-contrast/20">
                <button onClick={() => { setDoubleAfterSplit(true); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${doubleAfterSplit ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  Yes
                </button>
                <button onClick={() => { setDoubleAfterSplit(false); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!doubleAfterSplit ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  No
                </button>
              </div>
            </div>

            {/* Toggle: Surrender */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-content/60">Surrender</span>
              <div className="flex rounded-lg overflow-hidden border border-contrast/20">
                <button onClick={() => { setSurrenderAllowed(true); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${surrenderAllowed ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  Allowed
                </button>
                <button onClick={() => { setSurrenderAllowed(false); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!surrenderAllowed ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  Not Allowed
                </button>
              </div>
            </div>

            {/* Toggle: Blackjack Pays */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-content/60">Blackjack Pays</span>
                <div className="flex rounded-lg overflow-hidden border border-contrast/20">
                  <button onClick={() => { setBlackjackPays(1.5); setActivePreset(null) }}
                    className={`px-3 py-1.5 text-xs cursor-pointer ${blackjackPays === 1.5 ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                    3:2
                  </button>
                  <button onClick={() => { setBlackjackPays(1.2); setActivePreset(null) }}
                    className={`px-3 py-1.5 text-xs cursor-pointer ${blackjackPays === 1.2 ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                    6:5
                  </button>
                </div>
              </div>
              {blackjackPays === 1.2 && (
                <p className="text-xs text-red-400 mt-1" data-testid="six-five-warning">
                  {'\u26A0'} 6:5 significantly increases house edge!
                </p>
              )}
            </div>
          </section>

          {/* Column 3: Player Skill & Simulation */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gold uppercase tracking-wider">Player Skill & Simulation</h3>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-content/60">Counting Accuracy: {Math.round(countingAccuracy * 100)}%</span>
                {statsAvailable.tcAvg !== null && (
                  <button onClick={() => { setCountingAccuracy(statsAvailable.tcAvg!); setActivePreset(null) }}
                    className="text-[10px] px-2 py-0.5 rounded bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20 cursor-pointer"
                    data-testid="use-my-counting-stats">
                    Use My Stats
                  </button>
                )}
              </div>
              <input type="range" min={50} max={100} step={1} value={countingAccuracy * 100}
                onChange={e => { setCountingAccuracy(Number(e.target.value) / 100); setActivePreset(null) }}
                className="w-full mt-1 accent-gold" />
              <p className="text-xs text-content/40">
                {countingAccuracy >= 0.95 ? 'Good' : countingAccuracy >= 0.9 ? 'Average' : 'Needs Work'}
              </p>
            </div>

            {/* Toggle: Use Deviations */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-content/60">Use Deviations</span>
              <div className="flex rounded-lg overflow-hidden border border-contrast/20">
                <button onClick={() => { setUseDeviations(true); setActivePreset(null) }}
                  data-testid="deviations-yes"
                  className={`px-3 py-1.5 text-xs cursor-pointer ${useDeviations ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  Yes
                </button>
                <button onClick={() => { setUseDeviations(false); setActivePreset(null) }}
                  data-testid="deviations-no"
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!useDeviations ? 'bg-gold/20 text-gold' : 'bg-contrast/5 text-content/50'}`}>
                  No
                </button>
              </div>
            </div>

            {useDeviations && (
              <div data-testid="deviation-accuracy-slider">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content/60">Deviation Accuracy: {Math.round(deviationAccuracy * 100)}%</span>
                  {statsAvailable.devAvg !== null && (
                    <button onClick={() => { setDeviationAccuracy(statsAvailable.devAvg!); setActivePreset(null) }}
                      className="text-[10px] px-2 py-0.5 rounded bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20 cursor-pointer"
                      data-testid="use-my-deviation-stats">
                      Use My Stats
                    </button>
                  )}
                </div>
                <input type="range" min={50} max={100} step={1} value={deviationAccuracy * 100}
                  onChange={e => { setDeviationAccuracy(Number(e.target.value) / 100); setActivePreset(null) }}
                  className="w-full mt-1 accent-gold" />
              </div>
            )}

            <label className="block">
              <span className="text-xs text-content/60">Hands Per Hour</span>
              <input type="number" min={60} max={120} value={handsPerHour}
                onChange={e => { setHandsPerHour(Number(e.target.value)); setActivePreset(null) }}
                className="w-full mt-1 bg-contrast/10 border border-contrast/20 rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-gold/60" />
            </label>

            <div>
              <span className="text-xs text-content/60">Number of Shoes</span>
              <select value={numShoes}
                onChange={e => { setNumShoes(Number(e.target.value)); setActivePreset(null) }}
                className="w-full mt-1 bg-contrast/10 border border-contrast/20 rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-gold/60 cursor-pointer">
                {[1000, 5000, 10000, 25000, 50000].map(n => (
                  <option key={n} value={n} className="bg-select-bg">{n.toLocaleString()}</option>
                ))}
              </select>
              <p className="text-xs text-content/40 mt-1">
                ~{estimatedHands.toLocaleString()} hands simulated
                {numShoes >= 50000 && <span className="ml-1 text-yellow-400">{'\u23F1'} May take a few seconds</span>}
              </p>
            </div>
          </section>
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="text-center" data-testid="validation-errors">
            {validationErrors.map(err => (
              <p key={err} className="text-xs text-red-400">{'\u26A0'} {err}</p>
            ))}
          </div>
        )}

        {/* Error message from failed simulation */}
        {errorMessage && (
          <div className="text-center p-3 bg-red-500/10 border border-red-500/30 rounded-xl" data-testid="sim-error">
            <p className="text-sm text-red-400">{errorMessage}</p>
          </div>
        )}

        {/* Run Button */}
        <div className="flex justify-center pt-4 pb-8">
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating || !isConfigValid}
            data-testid="run-simulation"
            className="px-8 py-3 rounded-xl text-lg font-bold transition-all cursor-pointer
              bg-gold text-black hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSimulating
              ? `\u23F3 Simulating ${numShoes.toLocaleString()} shoes...`
              : '\uD83C\uDFB0 Run Simulation'}
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  PHASE 2: Results
  // ════════════════════════════════════════════════════════════════

  if (!result) return null

  // Theoretical metrics (deterministic — same config always gives same values)
  const playerEdge = result.weightedPlayerEdge
  const avgBet = theoreticalAvgBet(configSnapshot.minBet, betSpread, getBetMultiplier)
  const theoEvPerHand = playerEdge * avgBet
  const theoSdPerHand = HAND_SD * avgBet
  const snapshotHPH = configSnapshot.handsPerHour || 80
  const theoHourlyEV = theoEvPerHand * snapshotHPH
  const hourlySD = theoSdPerHand * Math.sqrt(snapshotHPH)
  const hasPositiveEdge = playerEdge > 0
  const recBankroll = theoEvPerHand > 0 && theoSdPerHand > 0
    ? Math.ceil((-theoSdPerHand * theoSdPerHand * Math.log(0.05)) / (2 * theoEvPerHand))
    : null
  const theoVariance = theoSdPerHand * theoSdPerHand
  const risk50 = theoEvPerHand > 0 && theoVariance > 0
    ? Math.min(1, Math.max(0, Math.exp((-theoEvPerHand * configSnapshot.bankroll) / theoVariance)))
    : 1
  const n0Hours = hasPositiveEdge && result.n0 > 0 ? Math.round(result.n0 / snapshotHPH) : null
  // Simulated hourly (for detailed stats)
  const simEvPerHand = result.totalHands > 0 ? result.netProfit / result.totalHands : 0
  const simHourlyEV = simEvPerHand * snapshotHPH

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="sim-results">
      {/* Back button */}
      <button onClick={() => setPhase('config')} data-testid="modify-settings"
        className="text-sm text-gold hover:text-gold/80 transition-colors cursor-pointer">
        {'\u25C0'} Modify Settings
      </button>

      {/* Negative edge warning */}
      {playerEdge <= 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4" data-testid="negative-edge-warning">
          <p className="text-sm text-red-400 font-medium">
            {'\u26A0'} Warning: Your player edge is negative ({fmtPct(playerEdge, 2)}). No bet spread can overcome a negative base edge. Consider better table rules or improving your counting accuracy.
          </p>
        </div>
      )}

      {/* Section A: Key Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Key Metrics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="key-metrics">
          {/* Card 1: Expected Hourly Win (theoretical) */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4" data-testid="metric-hourly-ev">
            <p className="text-xs text-content/50 mb-1">Expected Hourly Win</p>
            <p className={`text-2xl md:text-3xl font-bold ${theoHourlyEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtDollarCents(theoHourlyEV, true)}/hr
            </p>
            <p className="text-xs text-content/40 mt-1">
              Weighted edge: {fmtPct(playerEdge, 2)} | Base: {fmtPct(result.houseEdge, 2)}
            </p>
          </div>

          {/* Card 2: Risk of Ruin */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4" data-testid="metric-ror">
            <p className="text-xs text-content/50 mb-1">Risk of Ruin</p>
            <p className={`text-2xl md:text-3xl font-bold ${rorColor(result.riskOfRuin)}`}>
              {fmtPct(result.riskOfRuin)}
            </p>
            <p className="text-xs text-content/40 mt-1">Chance of losing entire bankroll</p>
          </div>

          {/* Card 3: Recommended Bankroll */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4" data-testid="metric-rec-bankroll">
            <p className="text-xs text-content/50 mb-1">Recommended Bankroll</p>
            {recBankroll !== null ? (
              <>
                <p className="text-2xl md:text-3xl font-bold text-content">
                  {fmtDollar(recBankroll)}
                </p>
                <p className="text-xs text-content/40 mt-1">For {'<'}5% risk of ruin</p>
                {configSnapshot.bankroll < recBankroll && (
                  <p className="text-xs text-yellow-400 mt-1">{'\u26A0'} Your bankroll is underfunded</p>
                )}
              </>
            ) : (
              <>
                <p className="text-base font-bold text-red-400" data-testid="rec-bankroll-negative">
                  No bankroll can overcome a negative edge
                </p>
                <p className="text-xs text-content/40 mt-1">Improve rules or counting to gain an edge first</p>
              </>
            )}
          </div>

          {/* Card 4: N-Zero */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4" data-testid="metric-n0">
            <p className="text-xs text-content/50 mb-1">N-Zero</p>
            <p className="text-2xl md:text-3xl font-bold text-content">
              {hasPositiveEdge ? `${result.n0.toLocaleString()} hands` : '\u221E (negative edge)'}
            </p>
            <p className="text-xs text-content/40 mt-1">
              {n0Hours !== null ? `~${n0Hours.toLocaleString()} hours until skill beats luck` : (playerEdge <= 0 ? 'You need a positive edge first' : 'Edge too small to overcome variance')}
            </p>
          </div>
        </div>
      </section>

      {/* Section B: Bankroll Journey Chart */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Bankroll Journey</h2>
        <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4" data-testid="bankroll-chart">
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={result.bankrollHistory}>
              <defs>
                <linearGradient id="bankrollGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
              <XAxis dataKey="hand" tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={{ stroke: 'rgba(128,128,128,0.15)' }} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={{ stroke: 'rgba(128,128,128,0.15)' }} tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 8, color: 'var(--color-content)' }}
                formatter={(value: number) => [fmtDollar(value), 'Bankroll']}
                labelFormatter={(label: number) => `Hand #${label.toLocaleString()}`} />
              <ReferenceLine y={configSnapshot.bankroll} stroke="rgba(128,128,128,0.3)" strokeDasharray="6 4" label={{ value: 'Start', fill: 'rgba(128,128,128,0.3)', fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#ef444440" strokeDasharray="6 4" />
              <Area type="monotone" dataKey="bankroll" stroke="#06b6d4" strokeWidth={2} fill="url(#bankrollGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-content/50">
            <span>Peak: <span className="text-green-400 font-medium">{fmtDollar(result.peakBankroll)}</span></span>
            <span>Worst Drawdown: <span className="text-red-400 font-medium">-{fmtDollar(result.worstDrawdown)}</span></span>
            <span>Final: <span className="text-content font-medium">{fmtDollar(result.finalBankroll)}</span></span>
          </div>
        </div>
      </section>

      {/* Section C: Outcome Distribution */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Outcome Distribution</h2>
        <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4" data-testid="outcome-chart">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={result.outcomeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
              <XAxis dataKey="label" tick={{ fill: '#a3a3a3', fontSize: 10 }} axisLine={{ stroke: 'rgba(128,128,128,0.15)' }} tickLine={false} />
              <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={{ stroke: 'rgba(128,128,128,0.15)' }} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 8, color: 'var(--color-content)' }}
                formatter={(value: number, _name: string, props: { payload: { percentage: number } }) =>
                  [`${props.payload.percentage.toFixed(1)}% of simulations`, 'Sessions']}
              />
              <Bar dataKey="count">
                {result.outcomeDistribution.map((entry, idx) => (
                  <Cell key={idx} fill={entry.label.includes('-') ? '#ef4444' : '#22c55e'} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Section D: Detailed Stats */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Detailed Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Performance */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gold mb-2">Performance</h3>
            {[
              ['Total Hands Simulated', result.totalHands.toLocaleString()],
              ['Total Wagered', fmtDollar(result.totalHands * result.averageBet)],
              ['Net Profit', fmtDollar(result.netProfit, true)],
              ['Simulated Hourly Win', `${fmtDollarCents(simHourlyEV, true)}/hr (this run)`],
              ['Winning Sessions', `${result.percentWinningSessions}% of shoes profitable`],
              ['Average Bet Size', fmtDollarCents(result.averageBet)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-content/50">{label}</span>
                <span className="text-content font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Risk Analysis */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gold mb-2">Risk Analysis</h3>
            {[
              ['Risk of Ruin (full)', fmtPct(result.riskOfRuin)],
              ['Risk of 50% Loss', fmtPct(risk50)],
              ['Kelly Optimal Bet', result.kellyOptimalBet > 0 ? fmtDollarCents(result.kellyOptimalBet) : 'N/A'],
              ['Standard Deviation', `${fmtDollarCents(hourlySD)}/hr`],
              ['Worst Drawdown', `-${fmtDollar(result.worstDrawdown)}`],
              ['Hours to Break Even (N0)', n0Hours !== null ? `~${n0Hours.toLocaleString()} hours` : (playerEdge <= 0 ? '\u221E (negative edge)' : 'N/A')],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-content/50">{label}</span>
                <span className="text-content font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section E: Bet Spread Analysis */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Bet Spread Analysis</h2>
        <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 overflow-x-auto" data-testid="spread-analysis">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-content/40 border-b border-contrast/10">
                <th className="text-left py-2">True Count</th>
                <th className="text-right py-2">Bet Size</th>
                <th className="text-right py-2">% of Hands</th>
                <th className="text-right py-2">Edge</th>
                <th className="text-right py-2">EV/Hand</th>
              </tr>
            </thead>
            <tbody>
              {TC_DISPLAY.map(row => {
                const mult = getBetMultiplier(betSpread, row.tc)
                const bet = configSnapshot.minBet * mult
                const edge = baseEdge + row.tc * tcGain
                const evHand = edge * bet
                return (
                  <tr key={row.label} className="border-b border-contrast/5">
                    <td className="py-2 text-content/70">{row.label}</td>
                    <td className="text-right text-content">{fmtDollar(bet)}</td>
                    <td className="text-right text-content/60">{Math.round(row.pct * 100)}%</td>
                    <td className={`text-right ${edge >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(2)}%
                    </td>
                    <td className={`text-right ${evHand >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtDollarCents(evHand, true)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section F: Action Buttons */}
      <section className="flex flex-wrap gap-3 pb-8">
        <button onClick={handleRunAgain} disabled={isSimulating} data-testid="run-again"
          className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gold text-black hover:bg-gold/90 transition-all cursor-pointer disabled:opacity-50">
          {isSimulating ? '\u23F3 Simulating...' : '\uD83D\uDD04 Run Again'}
        </button>
        <button onClick={() => setPhase('config')} data-testid="modify-settings-bottom"
          className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-contrast/20 text-content hover:bg-contrast/10 transition-all cursor-pointer">
          {'\u25C0'} Modify Settings
        </button>
        <button onClick={handleCopySummary} data-testid="copy-summary"
          className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-contrast/20 text-content hover:bg-contrast/10 transition-all cursor-pointer">
          {'\uD83D\uDCCB'} Copy Summary
        </button>
      </section>
    </div>
  )
}
