import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getHandValue, isBust, isPair } from '../../engine/rules/hand-utils'
import { Action } from '../../engine/rules/types'
import { casinoAmbient } from '../../services/casino-ambient'
import type { CasinoSessionConfig, CasinoSessionResult } from '../../engine/casino-session/types'
import type { SessionRecorder } from '../../services/session-recorder'
import { useGameLoop } from './useGameLoop'
import { CasinoTable } from './CasinoTable'
import { ActionButtons } from './ActionButtons'
import { BettingControls } from './BettingControls'
import { formatDollar, formatTime } from './helpers'

interface CasinoSessionGameProps {
  config: CasinoSessionConfig
  recorder: SessionRecorder | null
  soundEnabled: boolean
  onSessionEnd: (result: CasinoSessionResult) => void
}

export function CasinoSessionGame({ config, recorder, soundEnabled, onSessionEnd }: CasinoSessionGameProps) {
  const {
    state,
    actions,
    seatLayout,
    shoeProgress,
    cardsRemaining,
    cardsDealt,
    totalCards,
    bankroll,
    handNum,
    initSession,
  } = useGameLoop(config, recorder, onSessionEnd)

  const targetHands = config.sessionMode === 'hands' ? config.targetHands : undefined

  // Init session on mount
  useEffect(() => {
    initSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Volume slider state (synced from singleton)
  const [ambientVolume, setAmbientVolume] = useState(() => casinoAmbient.volume)

  // Ambient sound — respects config.casinoAmbience + soundEnabled + pause
  useEffect(() => {
    const shouldPlay = soundEnabled && config.casinoAmbience
    if (shouldPlay) {
      casinoAmbient.start()
      // Reduce volume to 30% when paused
      if (state.isPaused) {
        casinoAmbient.volume = ambientVolume * 0.3
      } else {
        casinoAmbient.volume = ambientVolume
      }
    } else {
      casinoAmbient.stop()
    }
    return () => { casinoAmbient.stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEnabled, config.casinoAmbience, state.isPaused, ambientVolume])

  // Time limit check
  useEffect(() => {
    if (config.sessionMode === 'time' && state.elapsedSeconds >= config.targetMinutes * 60) {
      actions.quitSession()
    }
  }, [state.elapsedSeconds, config.sessionMode, config.targetMinutes, actions])

  // Auto-stand at 21
  useEffect(() => {
    if (state.gameStep !== 'human_playing') return
    const cards = state.humanHands[state.activeHandIndex] ?? []
    if (cards.length < 2) return
    if (isBust(cards)) return
    if (getHandValue(cards).best === 21) {
      const t = setTimeout(() => actions.handleAction(Action.Stand), 500)
      return () => clearTimeout(t)
    }
  }, [state.gameStep, state.humanHands, state.activeHandIndex, actions])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state.isPaused) {
        if (e.key === 'Escape') actions.setPaused(false)
        return
      }

      if (e.key === 'Escape') {
        actions.setPaused(true)
        return
      }

      if (state.gameStep === 'human_playing') {
        if (e.key === 'h' || e.key === 'H') actions.handleAction(Action.Hit)
        else if (e.key === 's' || e.key === 'S') actions.handleAction(Action.Stand)
        else if (e.key === 'd' || e.key === 'D') actions.handleAction(Action.Double)
        else if (e.key === 'p' || e.key === 'P') actions.handleAction(Action.Split)
        else if (e.key === 'r' || e.key === 'R') actions.handleAction(Action.Surrender)
      }

      if (state.gameStep === 'insurance') {
        if (e.key === 'y' || e.key === 'Y') actions.handleInsurance(true)
        else if (e.key === 'n' || e.key === 'N') actions.handleInsurance(false)
      }

      if (state.gameStep === 'betting' && e.key === 'Enter') {
        actions.confirmBet()
      }

      if (state.gameStep === 'count_check' && e.key === 'Enter') {
        actions.submitCount()
      }

      if ((state.gameStep === 'hand_review' || state.gameStep === 'settlement') && (e.key === 'Enter' || e.key === ' ')) {
        actions.nextHand()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.gameStep, state.isPaused, actions])

  // Derived play state
  const humanCards = state.humanHands[state.activeHandIndex] ?? []
  const isFirstAction = humanCards.length === 2
  const canSplitNow = isFirstAction && isPair(humanCards) && state.humanHands.length < config.maxSplitHands && bankroll >= state.currentBet
  const canDoubleNow = isFirstAction && bankroll >= state.currentBet && (state.humanHands.length === 1 || config.doubleAfterSplit)
  const canSurrenderNow = isFirstAction && config.surrenderAllowed && state.humanHands.length === 1 && !state.isSurrendered
  const humanBusted = humanCards.length > 0 && isBust(humanCards)
  const isDealPhase = state.gameStep === 'dealing'

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: '#0c0c0c' }}>
      {/* Pause Overlay */}
      <AnimatePresence>
        {state.isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center gap-6"
          >
            <h2 className="text-3xl font-bold text-gold">Paused</h2>
            <button onClick={() => actions.setPaused(false)}
              className="px-8 py-3 bg-gold text-black rounded-xl font-bold text-lg hover:bg-gold/90 cursor-pointer">
              Resume
            </button>
            <button onClick={actions.quitSession} data-testid="quit-session"
              className="px-8 py-3 bg-error text-white rounded-xl font-bold hover:bg-error/80 cursor-pointer">
              Quit Session
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reshuffle Notification Overlay */}
      <AnimatePresence>
        {state.showReshuffle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            <div className="px-10 py-5 rounded-2xl shadow-2xl text-center"
              style={{ background: 'rgba(0,0,0,0.85)', border: '2px solid rgba(212, 168, 67, 0.5)' }}
              data-testid="reshuffle-notification"
            >
              <div className="text-gold text-xl md:text-2xl font-bold mb-1">Shuffling Cards...</div>
              <div className="text-white/50 text-sm">New shoe</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-contrast/5 border-b border-contrast/10 text-xs shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-content/60">
            Hand: <span className="text-content font-semibold">{handNum}{targetHands ? `/${targetHands}` : ''}</span>
          </span>
          <span className="text-content/60">
            Bankroll: <span className={`font-semibold ${bankroll >= config.startingBankroll ? 'text-success' : 'text-error'}`}>
              {formatDollar(bankroll)}
            </span>
          </span>
          <span className="text-content/60">
            Session: <span className={`font-semibold ${bankroll - config.startingBankroll >= 0 ? 'text-success' : 'text-error'}`}>
              {formatDollar(bankroll - config.startingBankroll)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5" data-testid="shoe-progress">
            <span className="text-content/40 text-[10px]">Shoe</span>
            <div className="w-16 h-1.5 bg-contrast/10 rounded-full overflow-hidden">
              <div className="h-full bg-gold/60 rounded-full transition-all" style={{ width: `${Math.min(100, shoeProgress * 100)}%` }} />
            </div>
          </div>
          {soundEnabled && config.casinoAmbience && (
            <div className="flex items-center gap-1" data-testid="volume-slider">
              <span className="text-content/40 text-[10px]">{Math.round(ambientVolume * 100)}%</span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={ambientVolume}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setAmbientVolume(v)
                  casinoAmbient.volume = v
                }}
                className="w-20 h-1 accent-gold cursor-pointer"
                title="Ambient volume"
              />
            </div>
          )}
          <span className="text-content/60">{formatTime(state.elapsedSeconds)}</span>
          <button onClick={() => actions.setPaused(true)} data-testid="pause-button"
            className="text-content/50 hover:text-content cursor-pointer">
            Pause
          </button>
        </div>
      </div>

      {/* Casino Table */}
      <CasinoTable
        dealerCards={state.dealerCards}
        dealerHoleRevealed={state.dealerHoleRevealed}
        gameStep={state.gameStep}
        isDealPhase={isDealPhase}
        seatLayout={seatLayout}
        humanHands={state.humanHands}
        humanVisibleCards={state.humanVisibleCards}
        activeHandIndex={state.activeHandIndex}
        currentBet={state.currentBet}
        handDoubled={state.handDoubled}
        isSurrendered={state.isSurrendered}
        humanSettlement={state.humanSettlement}
        activeBotId={state.activeBotId}
        botStatuses={state.botStatuses}
        botResults={state.botResults}
        botVisibleCards={state.botVisibleCards}
        botActiveSplitHands={state.botActiveSplitHands}
        botSplitVisibleCards={state.botSplitVisibleCards}
        bankroll={bankroll}
        cardsRemaining={cardsRemaining}
        cardsDealt={cardsDealt}
        totalCards={totalCards}
        penetration={config.penetration}
      />

      {/* Controls Area */}
      <div className="shrink-0 bg-contrast/5 border-t border-contrast/10 px-4 py-3">
        {/* Betting */}
        {state.gameStep === 'betting' && (
          <BettingControls
            currentBet={state.currentBet}
            minBet={config.minBet}
            maxBet={config.maxBet}
            bankroll={bankroll}
            onBetChange={actions.setBet}
            onConfirm={actions.confirmBet}
          />
        )}

        {/* Insurance */}
        {state.gameStep === 'insurance' && (
          <div className="flex flex-col items-center gap-3" data-testid="insurance-controls">
            <span className="text-sm text-content">Insurance? (Dealer shows Ace)</span>
            <div className="flex gap-3">
              <button onClick={() => actions.handleInsurance(true)} data-testid="insurance-yes"
                className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
                Yes (Y)
              </button>
              <button onClick={() => actions.handleInsurance(false)} data-testid="insurance-no"
                className="px-6 py-2 bg-contrast/10 text-content rounded-xl font-bold hover:bg-contrast/20 cursor-pointer">
                No (N)
              </button>
            </div>
          </div>
        )}

        {/* Human Playing */}
        {state.gameStep === 'human_playing' && (
          <ActionButtons
            onAction={actions.handleAction}
            canDouble={canDoubleNow}
            canSplit={canSplitNow}
            canSurrender={canSurrenderNow}
            humanBusted={humanBusted}
          />
        )}

        {/* Count Check */}
        {state.gameStep === 'count_check' && (
          <div className="flex flex-col items-center gap-3" data-testid="count-check">
            <span className="text-sm text-content">What's your count?</span>
            {!state.countFeedback ? (
              <>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-content/60">RC:</span>
                    <input type="number" value={state.rcInput} onChange={e => actions.setRcInput(e.target.value)}
                      data-testid="rc-input" autoFocus
                      className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-20 text-center" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-content/60">TC:</span>
                    <input type="number" step="0.5" value={state.tcInput} onChange={e => actions.setTcInput(e.target.value)}
                      data-testid="tc-input"
                      className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-20 text-center" />
                  </label>
                </div>
                <button onClick={actions.submitCount} data-testid="submit-count"
                  className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
                  Submit (Enter)
                </button>
              </>
            ) : (
              <div className="text-center space-y-1">
                <p className={`text-sm font-semibold ${state.countFeedback.rcCorrect ? 'text-success' : 'text-error'}`}>
                  RC: {state.countFeedback.rcCorrect ? 'Correct' : `Wrong (actual: ${state.countFeedback.actualRC})`}
                </p>
                <p className={`text-sm font-semibold ${state.countFeedback.tcCorrect ? 'text-success' : 'text-error'}`}>
                  TC: {state.countFeedback.tcCorrect ? 'Correct' : `Wrong (actual: ${state.countFeedback.actualTC})`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Hand Review */}
        {state.gameStep === 'hand_review' && state.handReview && (
          <div className="flex flex-col items-center gap-2" data-testid="hand-review">
            <div className="flex flex-wrap gap-4 justify-center text-xs">
              <span className={state.handReview.betCorrect ? 'text-success' : 'text-error'}>
                Bet: {state.handReview.betCorrect ? 'Correct' : `Wrong (should: ${formatDollar(state.handReview.correctBet)})`}
              </span>
              {state.handReview.wasDeviationSituation && (
                <span className={state.handReview.playerFollowedDeviation ? 'text-success' : 'text-error'}>
                  Dev: {state.handReview.playerFollowedDeviation ? 'Followed' : `Missed (${state.handReview.deviationName})`}
                </span>
              )}
            </div>
            {(() => {
              const decisions = state.handReview.decisions ?? []
              const handIndices = [...new Set(decisions.map(d => (d as { handIndex?: number }).handIndex ?? 0))]
              const isSplitReview = handIndices.length > 1

              if (isSplitReview) {
                return (
                  <div className="flex flex-col gap-1 text-xs text-center">
                    {handIndices.map(hi => {
                      const hDecisions = decisions.filter(d => ((d as { handIndex?: number }).handIndex ?? 0) === hi)
                      const actionsStr = hDecisions.map(d => d.action).join(', ')
                      const allCorrect = hDecisions.every(d => d.isCorrect)
                      const lastVal = hDecisions[hDecisions.length - 1]?.handValueAfter ?? 0
                      return (
                        <span key={hi} className={allCorrect ? 'text-success' : 'text-error'}>
                          Hand {hi + 1}: {actionsStr} ({lastVal}) {allCorrect ? '\u2713' : `\u2717 (should: ${hDecisions.find(d => !d.isCorrect)?.correctAction})`}
                        </span>
                      )
                    })}
                  </div>
                )
              }

              return (
                <span className={`text-xs ${state.handReview.firstActionCorrect ? 'text-success' : 'text-error'}`}>
                  Play: {state.handReview.firstActionCorrect ? 'Correct' : `Wrong (should: ${state.handReview.correctFirstAction})`}
                </span>
              )
            })()}
            <button onClick={actions.nextHand} data-testid="next-hand"
              className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
              Next Hand (Enter)
            </button>
          </div>
        )}

        {/* Settlement */}
        {state.gameStep === 'settlement' && (
          <div className="flex flex-col items-center gap-2">
            <button onClick={actions.nextHand} data-testid="next-hand"
              className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
              Next Hand (Enter)
            </button>
          </div>
        )}

        {/* Dealing / Bot / Dealer animation (no controls needed) */}
        {(state.gameStep === 'dealing' || state.gameStep === 'bot_playing' || state.gameStep === 'dealer_playing') && (
          <div className="h-10" />
        )}
      </div>
    </div>
  )
}
