import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { SessionRecorder } from '../../services/session-recorder'
import { casinoAmbient } from '../../services/casino-ambient'
import type { CasinoSessionConfig, CasinoSessionResult } from '../../engine/casino-session/types'
import type { CasinoSessionDetails } from '../../services/stats-types'
import { DEFAULT_CONFIG } from './helpers'
import type { Phase } from './helpers'
import { CasinoSessionConfigView } from './CasinoSessionConfig'
import { CasinoSessionSummary } from './CasinoSessionSummary'
import { CasinoSessionGame } from './CasinoSessionGame'

export function CasinoSession() {
  const setMode = useAppStore(s => s.setMode)
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const selectedSystem = useAppStore(s => s.selectedSystem)

  const [phase, setPhase] = useState<Phase>('config')
  const [lastConfig, setLastConfig] = useState<CasinoSessionConfig>({
    ...DEFAULT_CONFIG,
    countingSystem: selectedSystem,
  })
  const [result, setResult] = useState<CasinoSessionResult | null>(null)
  const recorderRef = useRef<SessionRecorder | null>(null)

  const handleStart = useCallback((config: CasinoSessionConfig) => {
    const recorder = new SessionRecorder()
    recorder.start(config)
    recorderRef.current = recorder
    setLastConfig(config)
    setPhase('playing')
  }, [])

  const handleSessionEnd = useCallback((sessionResult: CasinoSessionResult) => {
    setResult(sessionResult)
    setPhase('summary')
    casinoAmbient.stop()

    // Compute achievement-relevant fields from hand data
    const hands = sessionResult.hands
    const hadBlackjack = hands.some(h => h.result === 'blackjack')
    const splitAces = hands.some(h =>
      h.playerCards.length >= 2 &&
      h.playerCards[0].rank === 'A' && h.playerCards[1].rank === 'A' &&
      h.firstAction === 'Split'
    )
    let longestWinStreak = 0
    let currentStreak = 0
    for (const h of hands) {
      if (h.result === 'win' || h.result === 'blackjack') {
        currentStreak++
        if (currentStreak > longestWinStreak) longestWinStreak = currentStreak
      } else {
        currentStreak = 0
      }
    }
    let maxSplitHands = 1
    for (const h of hands) {
      const splitCount = h.decisions.filter(d => d.action === 'Split').length
      if (splitCount + 1 > maxSplitHands) maxSplitHands = splitCount + 1
    }

    // Save to stats store for analytics
    const details: CasinoSessionDetails = {
      type: 'casinoSession',
      handsPlayed: hands.length,
      netProfit: sessionResult.netProfit,
      overallScore: sessionResult.overallScore,
      grade: sessionResult.grade,
      betAccuracy: sessionResult.betAccuracy,
      playAccuracy: sessionResult.playAccuracy,
      countAccuracy: sessionResult.countAccuracy,
      totalCountChecks: sessionResult.totalCountChecks,
      deviationAccuracy: sessionResult.deviationAccuracy,
      totalDeviationSituations: sessionResult.totalDeviationSituations,
      numBots: sessionResult.config.numBots,
      hadBlackjack,
      longestWinStreak,
      splitAces,
      maxSplitHands,
    }
    const totalDecisions = sessionResult.totalPlayDecisions + sessionResult.totalBetDecisions
    const correctDecisions = sessionResult.correctPlayDecisions + sessionResult.correctBetDecisions
    useStatsStore.getState().recordSession({
      mode: 'casinoSession',
      startTime: sessionResult.startTime,
      totalQuestions: totalDecisions,
      correctAnswers: correctDecisions,
      bestStreak: 0,
      details,
      countingSystem: sessionResult.config.countingSystem,
    })

    // Auto-track in Casino Session Tracker
    const trackerStore = useCasinoSessionTrackerStore.getState()
    if (trackerStore.startingBankroll > 0 || trackerStore.sessions.length > 0) {
      const now = new Date()
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      trackerStore.addSession({
        id: `cs-${Date.now()}`,
        date: dateStr,
        timestamp: Date.now(),
        handsPlayed: hands.length,
        duration: sessionResult.durationSeconds,
        startingBankroll: sessionResult.startingBankroll,
        finalBankroll: sessionResult.finalBankroll,
        profit: sessionResult.netProfit,
        betAccuracy: sessionResult.betAccuracy,
        playAccuracy: sessionResult.playAccuracy,
        countAccuracy: sessionResult.countAccuracy,
        overallScore: sessionResult.overallScore,
        grade: sessionResult.grade,
        numBots: sessionResult.config.numBots,
        config: {
          numDecks: sessionResult.config.numDecks,
          minBet: sessionResult.config.minBet,
          blackjackPays: sessionResult.config.blackjackPays,
        },
      })
    }
  }, [])

  if (phase === 'config') {
    return (
      <CasinoSessionConfigView
        initialConfig={lastConfig}
        onStart={handleStart}
      />
    )
  }

  if (phase === 'summary' && result) {
    return (
      <CasinoSessionSummary
        result={result}
        onPlayAgain={() => { setPhase('config'); setResult(null) }}
        onHome={() => setMode('home')}
        recorder={recorderRef.current}
      />
    )
  }

  return (
    <CasinoSessionGame
      config={lastConfig}
      recorder={recorderRef.current}
      soundEnabled={soundEnabled}
      onSessionEnd={handleSessionEnd}
    />
  )
}
