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
import { runSimulation } from '../../engine/simulation/simulator'
import {
  beginnerPreset,
  intermediatePreset,
  professionalPreset,
  worstCasePreset,
} from '../../engine/simulation/presets'
import { calculateHouseEdge, EDGE_PER_TC, DEVIATION_TC_BONUS, HAND_SD } from '../../engine/simulation/math-utils'
import type { SimulationConfig, SimulationResult } from '../../engine/simulation/types'
import { useStatsStore } from '../../store/stats-store'

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

// ── TC distribution for 6-deck shoes (standard approximation) ───

const TC_DISTRIBUTION: { tc: string; tcNum: number; pct: number }[] = [
  { tc: '\u2264 0', tcNum: 0, pct: 0.56 },
  { tc: '+1', tcNum: 1, pct: 0.18 },
  { tc: '+2', tcNum: 2, pct: 0.12 },
  { tc: '+3', tcNum: 3, pct: 0.07 },
  { tc: '+4', tcNum: 4, pct: 0.04 },
  { tc: '+5+', tcNum: 5, pct: 0.03 },
]

// ── Helpers ─────────────────────────────────────────────────────

/** Format a dollar amount with sign. */
function fmtDollar(n: number, showSign = false): string {
  const sign = showSign && n > 0 ? '+' : ''
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

/** Compute recommended bankroll for < 5% RoR. */
function recommendedBankroll(result: SimulationResult, startingBankroll: number): number | null {
  const evPerHand = result.totalHands > 0 ? result.netProfit / result.totalHands : 0
  const sdPerHand = HAND_SD * result.averageBet
  if (evPerHand <= 0 || sdPerHand === 0) return null
  return Math.ceil((-sdPerHand * sdPerHand * Math.log(0.05)) / (2 * evPerHand))
}

/** Compute risk of losing 50% of bankroll. */
function riskOf50Loss(result: SimulationResult, startingBankroll: number): number {
  const evPerHand = result.totalHands > 0 ? result.netProfit / result.totalHands : 0
  const sdPerHand = HAND_SD * result.averageBet
  const variance = sdPerHand * sdPerHand
  if (evPerHand <= 0 || variance === 0) return 1
  return Math.min(1, Math.max(0, Math.exp((-evPerHand * startingBankroll) / variance)))
}

/** Get bet multiplier for a TC from the spread. */
function getMultiplier(betSpread: Record<number, number>, tc: number): number {
  const keys = Object.keys(betSpread).map(Number).sort((a, b) => b - a)
  for (const key of keys) {
    if (tc >= key) return betSpread[key]
  }
  return 1
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
  const [configSnapshot, setConfigSnapshot] = useState({ bankroll: 100000, minBet: 100 })
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
  }), [bankroll, minBet, numShoes, numDecks, penetration, tc1, tc2, tc3, tc4, tc5, dealerHitsSoft17, doubleAfterSplit, surrenderAllowed, blackjackPays, useDeviations, deviationAccuracy])

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
    setSavedConfig(config)
    setConfigSnapshot({ bankroll: Number(bankroll) || 10000, minBet: Number(minBet) || 10 })
    executeSimulation(config)
  }, [buildConfig, bankroll, minBet, executeSimulation])

  const handleRunAgain = useCallback(() => {
    if (!savedConfig) return
    executeSimulation(savedConfig)
  }, [savedConfig, executeSimulation])

  // ── Copy summary ──
  const handleCopySummary = useCallback(() => {
    if (!result) return
    const maxMult = Math.max(tc1, tc2, tc3, tc4, tc5)
    const text = `Bankroll Simulation Results:
Starting Bankroll: ${fmtDollar(configSnapshot.bankroll)}
Bet Spread: ${fmtDollar(configSnapshot.minBet)}-${fmtDollar(configSnapshot.minBet * maxMult)}
Expected Win: ${fmtDollarCents(result.hourlyEV, true)}/hr
Risk of Ruin: ${fmtPct(result.riskOfRuin)}
N-Zero: ${result.n0.toLocaleString()} hands`
    navigator.clipboard.writeText(text)
  }, [result, configSnapshot, tc1, tc2, tc3, tc4, tc5])

  const maxBet = minBet * Math.max(tc1, tc2, tc3, tc4, tc5)
  const estimatedHands = Math.round(numShoes * (numDecks * 52 * penetration) / 5.2)

  // ── Input validation ──
  const validationErrors: string[] = []
  if (bankroll <= 0) validationErrors.push('Bankroll must be greater than 0')
  if (minBet <= 0) validationErrors.push('Min bet must be greater than 0')
  if (bankroll < minBet) validationErrors.push('Bankroll must be at least the minimum bet')
  const isConfigValid = validationErrors.length === 0

  // ── Derived bet spread for Section E ──
  const betSpread = useMemo(() => ({ 1: tc1, 2: tc2, 3: tc3, 4: tc4, 5: tc5 }), [tc1, tc2, tc3, tc4, tc5])

  const baseEdge = useMemo(() => calculateHouseEdge({
    dealerHitsSoft17, doubleAfterSplit, surrenderAllowed, blackjackPays, numDecks,
  }), [dealerHitsSoft17, doubleAfterSplit, surrenderAllowed, blackjackPays, numDecks])

  const tcGain = EDGE_PER_TC + (useDeviations ? DEVIATION_TC_BONUS * deviationAccuracy : 0)

  // ════════════════════════════════════════════════════════════════
  //  PHASE 1: Configuration
  // ════════════════════════════════════════════════════════════════

  if (phase === 'config') {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="sim-config">
        {/* Presets */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Preset Configurations</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {UI_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p)}
                data-testid={`preset-${p.key}`}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  activePreset === p.key
                    ? 'border-gold bg-gold/10 ring-1 ring-gold/40'
                    : 'border-white/10 bg-white/5 hover:border-white/30'
                }`}
              >
                <span className="text-sm font-semibold text-white">{p.label}</span>
                <p className="text-xs text-white/40 mt-1">{p.description}</p>
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
              <span className="text-xs text-white/60">Starting Bankroll</span>
              <div className="flex items-center mt-1">
                <span className="text-white/40 mr-1">$</span>
                <input type="number" min={1000} step={1000} value={bankroll}
                  onChange={e => { setBankroll(Number(e.target.value)); setActivePreset(null) }}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60" />
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-white/60">Minimum Bet</span>
              <div className="flex items-center mt-1">
                <span className="text-white/40 mr-1">$</span>
                <input type="number" min={5} step={5} value={minBet}
                  onChange={e => { setMinBet(Number(e.target.value)); setActivePreset(null) }}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60" />
              </div>
            </label>

            {/* Bet Spread Table */}
            <div>
              <span className="text-xs text-white/60">Bet Spread</span>
              <table className="w-full mt-1 text-sm" data-testid="bet-spread-table">
                <thead>
                  <tr className="text-xs text-white/40">
                    <th className="text-left py-1">TC</th>
                    <th className="text-right py-1">Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-white/50">
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
                      <td className="py-1 text-white/70">{r.label}</td>
                      <td className="text-right">
                        <input type="number" min={1} max={50} value={r.val}
                          onChange={e => { r.set(Number(e.target.value)); setActivePreset(null) }}
                          className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white text-right focus:outline-none focus:border-gold/60" />
                        <span className="text-white/40 ml-1">x</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-white/40 mt-1">Max Bet: {fmtDollar(maxBet)}</p>
            </div>
          </section>

          {/* Column 2: Casino Rules */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gold uppercase tracking-wider">Casino Rules</h3>

            <label className="block">
              <span className="text-xs text-white/60">Number of Decks</span>
              <select value={numDecks}
                onChange={e => { setNumDecks(Number(e.target.value)); setActivePreset(null) }}
                className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60 cursor-pointer">
                <option value={2} className="bg-neutral-900">2</option>
                <option value={6} className="bg-neutral-900">6</option>
                <option value={8} className="bg-neutral-900">8</option>
              </select>
            </label>

            <div>
              <span className="text-xs text-white/60">Penetration: {Math.round(penetration * 100)}%</span>
              <input type="range" min={50} max={90} step={5} value={penetration * 100}
                onChange={e => { setPenetration(Number(e.target.value) / 100); setActivePreset(null) }}
                className="w-full mt-1 accent-gold" />
              <p className="text-xs text-white/40">
                {(numDecks * penetration).toFixed(1)} decks dealt of {numDecks}
              </p>
            </div>

            {/* Toggle: Dealer Soft 17 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Dealer Soft 17</span>
              <div className="flex rounded-lg overflow-hidden border border-white/20">
                <button onClick={() => { setDealerHitsSoft17(false); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!dealerHitsSoft17 ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  Stands (S17)
                </button>
                <button onClick={() => { setDealerHitsSoft17(true); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${dealerHitsSoft17 ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  Hits (H17)
                </button>
              </div>
            </div>

            {/* Toggle: DAS */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Double After Split</span>
              <div className="flex rounded-lg overflow-hidden border border-white/20">
                <button onClick={() => { setDoubleAfterSplit(true); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${doubleAfterSplit ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  Yes
                </button>
                <button onClick={() => { setDoubleAfterSplit(false); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!doubleAfterSplit ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  No
                </button>
              </div>
            </div>

            {/* Toggle: Surrender */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Surrender</span>
              <div className="flex rounded-lg overflow-hidden border border-white/20">
                <button onClick={() => { setSurrenderAllowed(true); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${surrenderAllowed ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  Allowed
                </button>
                <button onClick={() => { setSurrenderAllowed(false); setActivePreset(null) }}
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!surrenderAllowed ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  Not Allowed
                </button>
              </div>
            </div>

            {/* Toggle: Blackjack Pays */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">Blackjack Pays</span>
                <div className="flex rounded-lg overflow-hidden border border-white/20">
                  <button onClick={() => { setBlackjackPays(1.5); setActivePreset(null) }}
                    className={`px-3 py-1.5 text-xs cursor-pointer ${blackjackPays === 1.5 ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                    3:2
                  </button>
                  <button onClick={() => { setBlackjackPays(1.2); setActivePreset(null) }}
                    className={`px-3 py-1.5 text-xs cursor-pointer ${blackjackPays === 1.2 ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
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
                <span className="text-xs text-white/60">Counting Accuracy: {Math.round(countingAccuracy * 100)}%</span>
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
              <p className="text-xs text-white/40">
                {countingAccuracy >= 0.95 ? 'Good' : countingAccuracy >= 0.9 ? 'Average' : 'Needs Work'}
              </p>
            </div>

            {/* Toggle: Use Deviations */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Use Deviations</span>
              <div className="flex rounded-lg overflow-hidden border border-white/20">
                <button onClick={() => { setUseDeviations(true); setActivePreset(null) }}
                  data-testid="deviations-yes"
                  className={`px-3 py-1.5 text-xs cursor-pointer ${useDeviations ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  Yes
                </button>
                <button onClick={() => { setUseDeviations(false); setActivePreset(null) }}
                  data-testid="deviations-no"
                  className={`px-3 py-1.5 text-xs cursor-pointer ${!useDeviations ? 'bg-gold/20 text-gold' : 'bg-white/5 text-white/50'}`}>
                  No
                </button>
              </div>
            </div>

            {useDeviations && (
              <div data-testid="deviation-accuracy-slider">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">Deviation Accuracy: {Math.round(deviationAccuracy * 100)}%</span>
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
              <span className="text-xs text-white/60">Hands Per Hour</span>
              <input type="number" min={60} max={120} value={handsPerHour}
                onChange={e => { setHandsPerHour(Number(e.target.value)); setActivePreset(null) }}
                className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60" />
            </label>

            <div>
              <span className="text-xs text-white/60">Number of Shoes</span>
              <select value={numShoes}
                onChange={e => { setNumShoes(Number(e.target.value)); setActivePreset(null) }}
                className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gold/60 cursor-pointer">
                {[1000, 5000, 10000, 25000, 50000].map(n => (
                  <option key={n} value={n} className="bg-neutral-900">{n.toLocaleString()}</option>
                ))}
              </select>
              <p className="text-xs text-white/40 mt-1">
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

  const evPerHand = result.totalHands > 0 ? result.netProfit / result.totalHands : 0
  const sdPerHand = HAND_SD * result.averageBet
  const hourlySD = sdPerHand * Math.sqrt(handsPerHour)
  const recBankroll = recommendedBankroll(result, configSnapshot.bankroll)
  const risk50 = riskOf50Loss(result, configSnapshot.bankroll)
  const n0Hours = result.n0 !== Infinity ? Math.round(result.n0 / handsPerHour) : null
  const playerEdge = result.totalHands > 0 && result.netProfit > 0
    ? result.netProfit / (result.totalHands * result.averageBet)
    : result.houseEdge

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="sim-results">
      {/* Back button */}
      <button onClick={() => setPhase('config')} data-testid="modify-settings"
        className="text-sm text-gold hover:text-gold/80 transition-colors cursor-pointer">
        {'\u25C0'} Modify Settings
      </button>

      {/* Section A: Key Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Key Metrics</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="key-metrics">
          {/* Card 1: Expected Hourly Win */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="metric-hourly-ev">
            <p className="text-xs text-white/50 mb-1">Expected Hourly Win</p>
            <p className={`text-2xl md:text-3xl font-bold ${result.hourlyEV >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {fmtDollarCents(result.hourlyEV, true)}/hr
            </p>
            <p className="text-xs text-white/40 mt-1">
              Player edge: {fmtPct(playerEdge, 2)} per hand
            </p>
          </div>

          {/* Card 2: Risk of Ruin */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="metric-ror">
            <p className="text-xs text-white/50 mb-1">Risk of Ruin</p>
            <p className={`text-2xl md:text-3xl font-bold ${rorColor(result.riskOfRuin)}`}>
              {fmtPct(result.riskOfRuin)}
            </p>
            <p className="text-xs text-white/40 mt-1">Chance of losing entire bankroll</p>
          </div>

          {/* Card 3: Recommended Bankroll */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="metric-rec-bankroll">
            <p className="text-xs text-white/50 mb-1">Recommended Bankroll</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {recBankroll !== null ? fmtDollar(recBankroll) : 'N/A'}
            </p>
            <p className="text-xs text-white/40 mt-1">For {'<'}5% risk of ruin</p>
            {recBankroll !== null && configSnapshot.bankroll < recBankroll && (
              <p className="text-xs text-yellow-400 mt-1">{'\u26A0'} Your bankroll is underfunded</p>
            )}
          </div>

          {/* Card 4: N-Zero */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="metric-n0">
            <p className="text-xs text-white/50 mb-1">N-Zero</p>
            <p className="text-2xl md:text-3xl font-bold text-white">
              {result.n0 !== Infinity ? `${result.n0.toLocaleString()} hands` : '\u221E'}
            </p>
            <p className="text-xs text-white/40 mt-1">
              {n0Hours !== null ? `~${n0Hours.toLocaleString()} hours until skill beats luck` : 'Edge too small to overcome variance'}
            </p>
          </div>
        </div>
      </section>

      {/* Section B: Bankroll Journey Chart */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Bankroll Journey</h2>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="bankroll-chart">
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={result.bankrollHistory}>
              <defs>
                <linearGradient id="bankrollGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="hand" tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={{ stroke: '#ffffff20' }} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
              <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={{ stroke: '#ffffff20' }} tickLine={false}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f5f5f5' }}
                formatter={(value: number) => [fmtDollar(value), 'Bankroll']}
                labelFormatter={(label: number) => `Hand #${label.toLocaleString()}`} />
              <ReferenceLine y={configSnapshot.bankroll} stroke="#ffffff40" strokeDasharray="6 4" label={{ value: 'Start', fill: '#ffffff40', fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#ef444440" strokeDasharray="6 4" />
              <Area type="monotone" dataKey="bankroll" stroke="#06b6d4" strokeWidth={2} fill="url(#bankrollGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-white/50">
            <span>Peak: <span className="text-green-400 font-medium">{fmtDollar(result.peakBankroll)}</span></span>
            <span>Worst Drawdown: <span className="text-red-400 font-medium">-{fmtDollar(result.worstDrawdown)}</span></span>
            <span>Final: <span className="text-white font-medium">{fmtDollar(result.finalBankroll)}</span></span>
          </div>
        </div>
      </section>

      {/* Section C: Outcome Distribution */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Outcome Distribution</h2>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4" data-testid="outcome-chart">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={result.outcomeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="label" tick={{ fill: '#a3a3a3', fontSize: 10 }} axisLine={{ stroke: '#ffffff20' }} tickLine={false} />
              <YAxis tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={{ stroke: '#ffffff20' }} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f5f5f5' }}
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
        <h2 className="text-lg font-semibold text-white mb-3">Detailed Stats</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Performance */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gold mb-2">Performance</h3>
            {[
              ['Total Hands Simulated', result.totalHands.toLocaleString()],
              ['Total Wagered', fmtDollar(result.totalHands * result.averageBet)],
              ['Net Profit', fmtDollar(result.netProfit, true)],
              ['Winning Sessions', `${result.percentWinningSessions}% of shoes profitable`],
              ['Average Bet Size', fmtDollarCents(result.averageBet)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-white/50">{label}</span>
                <span className="text-white font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Risk Analysis */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gold mb-2">Risk Analysis</h3>
            {[
              ['Risk of Ruin (full)', fmtPct(result.riskOfRuin)],
              ['Risk of 50% Loss', fmtPct(risk50)],
              ['Kelly Optimal Bet', result.kellyOptimalBet > 0 ? fmtDollarCents(result.kellyOptimalBet) : 'N/A'],
              ['Standard Deviation', `${fmtDollarCents(hourlySD)}/hr`],
              ['Worst Drawdown', `-${fmtDollar(result.worstDrawdown)}`],
              ['Hours to Break Even (N0)', n0Hours !== null ? `~${n0Hours.toLocaleString()} hours` : 'N/A'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-white/50">{label}</span>
                <span className="text-white font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section E: Bet Spread Analysis */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Bet Spread Analysis</h2>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 overflow-x-auto" data-testid="spread-analysis">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-white/40 border-b border-white/10">
                <th className="text-left py-2">True Count</th>
                <th className="text-right py-2">Bet Size</th>
                <th className="text-right py-2">% of Hands</th>
                <th className="text-right py-2">Edge</th>
                <th className="text-right py-2">EV/Hand</th>
              </tr>
            </thead>
            <tbody>
              {TC_DISTRIBUTION.map(row => {
                const mult = getMultiplier(betSpread, row.tcNum)
                const bet = configSnapshot.minBet * mult
                const edge = baseEdge + row.tcNum * tcGain
                const evHand = edge * bet
                return (
                  <tr key={row.tc} className="border-b border-white/5">
                    <td className="py-2 text-white/70">{row.tc}</td>
                    <td className="text-right text-white">{fmtDollar(bet)}</td>
                    <td className="text-right text-white/60">{Math.round(row.pct * 100)}%</td>
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
          className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/10 transition-all cursor-pointer">
          {'\u25C0'} Modify Settings
        </button>
        <button onClick={handleCopySummary} data-testid="copy-summary"
          className="px-6 py-2.5 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/10 transition-all cursor-pointer">
          {'\uD83D\uDCCB'} Copy Summary
        </button>
      </section>
    </div>
  )
}
