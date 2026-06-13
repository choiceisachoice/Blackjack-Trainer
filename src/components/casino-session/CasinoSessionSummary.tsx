import { useState, useCallback } from 'react'
import type { CasinoSessionResult } from '../../engine/casino-session/types'
import type { SessionRecorder } from '../../services/session-recorder'
import { formatDollar, formatTime } from './helpers'

interface CasinoSessionSummaryProps {
  result: CasinoSessionResult
  onPlayAgain: () => void
  onHome: () => void
  recorder: SessionRecorder | null
}

export function CasinoSessionSummary({ result, onPlayAgain, onHome, recorder }: CasinoSessionSummaryProps) {
  const [debugExported, setDebugExported] = useState(false)
  const anomalyCount = recorder?.getAnomalyCount() ?? 0

  const downloadDebugLog = useCallback(() => {
    if (!recorder) return
    const log = recorder.exportLog()
    const blob = new Blob([log], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `casino-debug-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setDebugExported(true)
    setTimeout(() => setDebugExported(false), 3000)
  }, [recorder])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Grade */}
        <div className="text-center">
          <div className="text-6xl font-black mb-1" style={{ color: result.gradeColor }}>
            {result.grade}
          </div>
          <div className="text-sm text-content/50">
            Overall Score: {result.overallScore.toFixed(1)}%
          </div>
        </div>

        {/* Bankroll Summary */}
        <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-2">
          <h3 className="text-sm font-semibold text-gold">Bankroll</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-content/60">Starting:</span>
            <span className="text-content text-right">{formatDollar(result.startingBankroll)}</span>
            <span className="text-content/60">Final:</span>
            <span className="text-content text-right">{formatDollar(result.finalBankroll)}</span>
            <span className="text-content/60">Net:</span>
            <span className={`text-right font-semibold ${result.netProfit >= 0 ? 'text-success' : 'text-error'}`}>
              {formatDollar(result.netProfit)}
            </span>
            <span className="text-content/60">Peak:</span>
            <span className="text-content text-right">{formatDollar(result.peakBankroll)}</span>
            <span className="text-content/60">Worst Drawdown:</span>
            <span className="text-content text-right">{formatDollar(result.worstDrawdown)}</span>
          </div>
        </div>

        {/* Accuracy Breakdown */}
        <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-3">
          <h3 className="text-sm font-semibold text-gold">Accuracy</h3>
          {[
            { label: 'Betting', val: result.betAccuracy, detail: `${result.correctBetDecisions}/${result.totalBetDecisions}` },
            { label: 'Play', val: result.playAccuracy, detail: `${result.correctPlayDecisions}/${result.totalPlayDecisions}` },
            { label: 'Counting', val: result.countAccuracy, detail: `RC: ${result.correctRCChecks}/${result.totalCountChecks}, TC: ${result.correctTCChecks}/${result.totalCountChecks}` },
            { label: 'Deviations', val: result.deviationAccuracy, detail: `${result.correctDeviations}/${result.totalDeviationSituations}` },
            { label: 'Insurance', val: result.insuranceAccuracy, detail: `${result.correctInsuranceDecisions}/${result.totalInsuranceOffers}` },
          ].map(({ label, val, detail }) => (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-content/70">{label}</span>
                <span className="text-content">{val.toFixed(1)}% <span className="text-content/40 text-xs">({detail})</span></span>
              </div>
              <div className="h-2 bg-contrast/10 rounded-full overflow-hidden">
                <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${Math.min(100, val)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Session Stats */}
        <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-2">
          <h3 className="text-sm font-semibold text-gold">Session Stats</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-content/60">Hands:</span>
            <span className="text-content text-right">{result.hands.length}</span>
            <span className="text-content/60">Duration:</span>
            <span className="text-content text-right">{formatTime(result.durationSeconds)}</span>
            <span className="text-content/60">Avg RC Error:</span>
            <span className="text-content text-right">{result.avgRCError.toFixed(1)}</span>
            <span className="text-content/60">Avg TC Error:</span>
            <span className="text-content text-right">{result.avgTCError.toFixed(1)}</span>
          </div>
        </div>

        {/* Missed Deviations */}
        {result.missedDeviations.length > 0 && (
          <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-2">
            <h3 className="text-sm font-semibold text-error">Missed Deviations</h3>
            <ul className="text-sm text-content/70 space-y-1">
              {result.missedDeviations.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Anomaly Warning */}
        {anomalyCount > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-center" data-testid="anomaly-warning">
            <span className="text-warning text-sm font-semibold">
              {'\u26A0'} {anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'} detected during session
            </span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onPlayAgain} data-testid="play-again"
            className="flex-1 py-3 rounded-xl bg-gold text-black font-bold hover:bg-gold/90 transition-colors cursor-pointer">
            Play Again
          </button>
          <button onClick={downloadDebugLog} data-testid="export-debug-log"
            className="flex-1 py-3 rounded-xl bg-contrast/10 text-content font-bold hover:bg-contrast/20 transition-colors cursor-pointer">
            {debugExported ? '\u2713 Downloaded' : 'Export Debug Log \uD83D\uDCCB'}
          </button>
          <button onClick={onHome} data-testid="go-home"
            className="flex-1 py-3 rounded-xl bg-contrast/10 text-content font-bold hover:bg-contrast/20 transition-colors cursor-pointer">
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
