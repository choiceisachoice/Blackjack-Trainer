import { useState } from 'react'
import { CountingSystemId } from '../../engine/counting/types'
import type { CasinoSessionConfig } from '../../engine/casino-session/types'
import { DEFAULT_CONFIG } from './helpers'

interface CasinoSessionConfigProps {
  initialConfig: CasinoSessionConfig
  onStart: (config: CasinoSessionConfig) => void
}

export function CasinoSessionConfigView({ initialConfig, onStart }: CasinoSessionConfigProps) {
  const [config, setConfig] = useState<CasinoSessionConfig>(initialConfig)

  const update = <K extends keyof CasinoSessionConfig>(key: K, val: CasinoSessionConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }))

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-xl font-bold text-gold text-center">Casino Session Setup</h2>

        {/* Session Mode */}
        <fieldset className="space-y-3 bg-contrast/5 rounded-xl p-4 border border-contrast/10">
          <legend className="text-sm font-semibold text-content/70 px-2">Session Length</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={config.sessionMode === 'hands'}
                onChange={() => update('sessionMode', 'hands')}
                className="accent-gold" />
              <span className="text-sm text-content">By Hands</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={config.sessionMode === 'time'}
                onChange={() => update('sessionMode', 'time')}
                className="accent-gold" />
              <span className="text-sm text-content">By Time</span>
            </label>
          </div>
          {config.sessionMode === 'hands' ? (
            <label className="flex items-center gap-3">
              <span className="text-sm text-content/60 w-32">Hands:</span>
              <input type="number" min={5} max={200} value={config.targetHands}
                onChange={e => update('targetHands', Math.max(5, parseInt(e.target.value) || 5))}
                className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-24" />
            </label>
          ) : (
            <label className="flex items-center gap-3">
              <span className="text-sm text-content/60 w-32">Minutes:</span>
              <input type="number" min={1} max={120} value={config.targetMinutes}
                onChange={e => update('targetMinutes', Math.max(1, parseInt(e.target.value) || 1))}
                className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-24" />
            </label>
          )}
        </fieldset>

        {/* Table Setup */}
        <fieldset className="space-y-3 bg-contrast/5 rounded-xl p-4 border border-contrast/10">
          <legend className="text-sm font-semibold text-content/70 px-2">Table Setup</legend>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Bots:</span>
            <select value={config.numBots} onChange={e => update('numBots', parseInt(e.target.value))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              {[0,1,2,3,4,5].map(n => <option key={n} value={n} className="bg-select-bg">{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Your Seat:</span>
            <select value={config.playerSeatIndex} onChange={e => update('playerSeatIndex', parseInt(e.target.value))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              {[0,1,2,3,4,5].map(n => <option key={n} value={n} className="bg-select-bg">Seat {n + 1}</option>)}
            </select>
          </label>
        </fieldset>

        {/* Bankroll & Betting */}
        <fieldset className="space-y-3 bg-contrast/5 rounded-xl p-4 border border-contrast/10">
          <legend className="text-sm font-semibold text-content/70 px-2">Bankroll & Betting</legend>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Bankroll:</span>
            <input type="number" min={100} max={100000} step={100} value={config.startingBankroll}
              onChange={e => update('startingBankroll', Math.max(100, parseInt(e.target.value) || 100))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-28" />
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Min Bet:</span>
            <input type="number" min={5} max={500} step={5} value={config.minBet}
              onChange={e => update('minBet', Math.max(5, parseInt(e.target.value) || 5))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-28" />
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Max Bet:</span>
            <input type="number" min={50} max={10000} step={50} value={config.maxBet}
              onChange={e => update('maxBet', Math.max(50, parseInt(e.target.value) || 50))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-28" />
          </label>
        </fieldset>

        {/* Rules */}
        <fieldset className="space-y-3 bg-contrast/5 rounded-xl p-4 border border-contrast/10">
          <legend className="text-sm font-semibold text-content/70 px-2">Casino Rules</legend>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Decks:</span>
            <select value={config.numDecks} onChange={e => update('numDecks', parseInt(e.target.value))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              {[2,6,8].map(n => <option key={n} value={n} className="bg-select-bg">{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.dealerHitsSoft17}
              onChange={e => update('dealerHitsSoft17', e.target.checked)}
              className="accent-gold" />
            <span className="text-sm text-content">Dealer Hits Soft 17 (H17)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.doubleAfterSplit}
              onChange={e => update('doubleAfterSplit', e.target.checked)}
              className="accent-gold" />
            <span className="text-sm text-content">Double After Split</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.surrenderAllowed}
              onChange={e => update('surrenderAllowed', e.target.checked)}
              className="accent-gold" />
            <span className="text-sm text-content">Late Surrender</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">BJ Payout:</span>
            <select value={config.blackjackPays} onChange={e => update('blackjackPays', parseFloat(e.target.value))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              <option value={1.5} className="bg-select-bg">3:2</option>
              <option value={1.2} className="bg-select-bg">6:5</option>
            </select>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Penetration:</span>
            <select value={config.penetration} onChange={e => update('penetration', parseFloat(e.target.value))}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              {[0.65, 0.70, 0.75, 0.80, 0.85].map(p => (
                <option key={p} value={p} className="bg-select-bg">{Math.round(p * 100)}%</option>
              ))}
            </select>
          </label>
        </fieldset>

        {/* Training Options */}
        <fieldset className="space-y-3 bg-contrast/5 rounded-xl p-4 border border-contrast/10">
          <legend className="text-sm font-semibold text-content/70 px-2">Training Options</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.trainingMode}
              onChange={e => update('trainingMode', e.target.checked)}
              className="accent-gold" />
            <span className="text-sm text-content">Show feedback after each hand</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">Count Check:</span>
            <select value={config.countCheckFrequency}
              onChange={e => update('countCheckFrequency', e.target.value as CasinoSessionConfig['countCheckFrequency'])}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              <option value="every" className="bg-select-bg">Every hand</option>
              <option value="every5" className="bg-select-bg">Every 5 hands</option>
              <option value="every10" className="bg-select-bg">Every 10 hands</option>
              <option value="never" className="bg-select-bg">Never</option>
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.showDeviationHints}
              onChange={e => update('showDeviationHints', e.target.checked)}
              className="accent-gold" />
            <span className="text-sm text-content">Show deviation hints</span>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-sm text-content/60 w-32">System:</span>
            <select value={config.countingSystem}
              onChange={e => update('countingSystem', e.target.value as CountingSystemId)}
              className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content">
              {Object.values(CountingSystemId).map(id => (
                <option key={id} value={id} className="bg-select-bg">{id}</option>
              ))}
            </select>
          </label>
        </fieldset>

        {/* Sound */}
        <fieldset className="space-y-3 bg-contrast/5 rounded-xl p-4 border border-contrast/10">
          <legend className="text-sm font-semibold text-content/70 px-2">Sound</legend>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={config.casinoAmbience}
              onChange={e => update('casinoAmbience', e.target.checked)}
              data-testid="toggle-ambience"
              className="accent-gold" />
            <span className="text-sm text-content">Casino Ambience</span>
          </label>
        </fieldset>

        <button
          onClick={() => onStart(config)}
          data-testid="start-session"
          className="w-full py-3 rounded-xl bg-gold text-black font-bold text-lg
            hover:bg-gold/90 transition-colors cursor-pointer"
        >
          Start Session
        </button>
      </div>
    </div>
  )
}
