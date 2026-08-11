import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
            {t('casino.summary.overallScore', { pct: result.overallScore.toFixed(1) })}
          </div>
        </div>

        {/* Bankroll Summary */}
        <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-2">
          <h3 className="text-sm font-semibold text-gold">{t('casino.summary.bankroll')}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-content/60">{t('casino.summary.starting')}</span>
            <span className="text-content text-right">{formatDollar(result.startingBankroll)}</span>
            <span className="text-content/60">{t('casino.summary.final')}</span>
            <span className="text-content text-right">{formatDollar(result.finalBankroll)}</span>
            <span className="text-content/60">{t('casino.summary.net')}</span>
            <span className={`text-right font-semibold ${result.netProfit >= 0 ? 'text-success' : 'text-error'}`}>
              {formatDollar(result.netProfit)}
            </span>
            <span className="text-content/60">{t('casino.summary.peak')}</span>
            <span className="text-content text-right">{formatDollar(result.peakBankroll)}</span>
            <span className="text-content/60">{t('casino.summary.drawdown')}</span>
            <span className="text-content text-right">{formatDollar(result.worstDrawdown)}</span>
          </div>
        </div>

        {/* Accuracy Breakdown */}
        <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-3">
          <h3 className="text-sm font-semibold text-gold">{t('casino.summary.accuracy')}</h3>
          {[
            { label: t('casino.summary.betting'), val: result.betAccuracy, detail: `${result.correctBetDecisions}/${result.totalBetDecisions}` },
            { label: t('casino.summary.play'), val: result.playAccuracy, detail: `${result.correctPlayDecisions}/${result.totalPlayDecisions}` },
            { label: t('casino.summary.counting'), val: result.countAccuracy, detail: `RC: ${result.correctRCChecks}/${result.totalCountChecks}, TC: ${result.correctTCChecks}/${result.totalCountChecks}` },
            { label: t('casino.summary.deviations'), val: result.deviationAccuracy, detail: `${result.correctDeviations}/${result.totalDeviationSituations}` },
            { label: t('casino.summary.insurance'), val: result.insuranceAccuracy, detail: `${result.correctInsuranceDecisions}/${result.totalInsuranceOffers}` },
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
          <h3 className="text-sm font-semibold text-gold">{t('casino.summary.stats')}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-content/60">{t('casino.summary.handsLabel')}</span>
            <span className="text-content text-right">{result.hands.length}</span>
            <span className="text-content/60">{t('casino.summary.duration')}</span>
            <span className="text-content text-right">{formatTime(result.durationSeconds)}</span>
            <span className="text-content/60">{t('casino.summary.avgRcError')}</span>
            <span className="text-content text-right">{result.avgRCError.toFixed(1)}</span>
            <span className="text-content/60">{t('casino.summary.avgTcError')}</span>
            <span className="text-content text-right">{result.avgTCError.toFixed(1)}</span>
          </div>
        </div>

        {/* Missed Deviations */}
        {result.missedDeviations.length > 0 && (
          <div className="bg-contrast/5 rounded-xl p-4 border border-contrast/10 space-y-2">
            <h3 className="text-sm font-semibold text-error">{t('casino.summary.missedDeviations')}</h3>
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
              {'\u26A0'} {t('casino.summary.anomalies', { count: anomalyCount })}
            </span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onPlayAgain} data-testid="play-again"
            className="flex-1 py-3 rounded-xl bg-gold text-black font-bold hover:bg-gold/90 transition-colors cursor-pointer">
            {t('casino.summary.playAgain')}
          </button>
          <button onClick={downloadDebugLog} data-testid="export-debug-log"
            className="flex-1 py-3 rounded-xl bg-contrast/10 text-content font-bold hover:bg-contrast/20 transition-colors cursor-pointer">
            {debugExported ? `\u2713 ${t('casino.summary.downloaded')}` : `${t('casino.summary.exportDebug')} \uD83D\uDCCB`}
          </button>
          <button onClick={onHome} data-testid="go-home"
            className="flex-1 py-3 rounded-xl bg-contrast/10 text-content font-bold hover:bg-contrast/20 transition-colors cursor-pointer">
            {t('casino.summary.home')}
          </button>
        </div>
      </div>
    </div>
  )
}
