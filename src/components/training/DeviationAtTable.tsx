import { useState, useEffect, useCallback, useRef } from 'react'
import { useGameStore } from '../../store/game-store'
import { useAppStore } from '../../store/app-store'
import { useSessionSave } from '../../hooks/useSessionSave'
import { findMatchingDeviation } from '../../engine/counting/deviations'
import { getHandValue } from '../../engine/rules/hand-utils'
import { GameTable } from '../table/GameTable'
import { ACTION_LABEL, getDeviations, ALL_ACTIONS, formatTC } from './deviation-utils'
import type { DeviationSet } from './deviation-utils'
import type { Deviation } from '../../engine/counting/types'
import { Action } from '../../engine/rules/types'
import type { DeviationDetails } from '../../services/stats-types'

type OverlayPhase = 'none' | 'countdown' | 'deviation-prompt' | 'trap-prompt' | 'feedback'

interface DeviationAtTableProps {
  deviationSet: DeviationSet
}

/**
 * "At the Table" deviation training mode.
 *
 * Wraps GameTable and overlays a deviation quiz when the dealt hand
 * matches a deviation situation. Periodically shows trap questions
 * on non-deviation hands to test recognition.
 */
export function DeviationAtTable({ deviationSet }: DeviationAtTableProps) {
  const selectedSystem = useAppStore(s => s.selectedSystem)

  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('none')
  const [activeDeviation, setActiveDeviation] = useState<Deviation | null>(null)
  const [tcAnswer, setTcAnswer] = useState(0)
  const [selectedAction, setSelectedAction] = useState<Action | null>(null)
  const [trapAnswer, setTrapAnswer] = useState<boolean | null>(null)

  // Feedback state
  const [isTcCorrect, setIsTcCorrect] = useState(false)
  const [isActionCorrect, setIsActionCorrect] = useState(false)
  const [isTrapCorrect, setIsTrapCorrect] = useState(false)
  const [correctAction, setCorrectAction] = useState<Action | null>(null)

  // Stats
  const [handsPlayed, setHandsPlayed] = useState(0)
  const [deviationsCorrect, setDeviationsCorrect] = useState(0)
  const [deviationsTotal, setDeviationsTotal] = useState(0)
  const [tcErrors, setTcErrors] = useState<number[]>([])
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  // Per-deviation tracking for session save
  const deviationResultsRef = useRef<Record<string, { correct: number; incorrect: number }>>({})

  // ── Session stats persistence ──
  const { statsRef } = useSessionSave('deviationAtTable', (): DeviationDetails => ({
    type: 'deviationAtTable',
    deviationSet,
    perDeviation: { ...deviationResultsRef.current },
    avgTcError: tcErrors.length > 0
      ? tcErrors.reduce((a, b) => a + b, 0) / tcErrors.length
      : 0,
  }))

  // Detection refs
  const hasCheckedRef = useRef(false)
  const nonDeviationCountRef = useRef(0)
  const trapThresholdRef = useRef(Math.floor(Math.random() * 3) + 3) // 3-5

  // Countdown state (3s delay before overlay appears)
  const [countdown, setCountdown] = useState(0)
  const countdownTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const pendingPhaseRef = useRef<'deviation-prompt' | 'trap-prompt' | null>(null)

  // Subscribe to game store
  const gameState = useGameStore(s => s.gameState)
  const trueCount = useGameStore(s => s.trueCount)

  // Hide count display and sync counting system
  useEffect(() => {
    const store = useGameStore.getState()
    if (store.showCount) store.toggleCountDisplay()
    store.setCountingSystem(selectedSystem)
  }, [selectedSystem])

  // Core detection via Zustand subscription.
  // More reliable than useEffect dependency tracking — fires synchronously
  // when the store changes, avoiding React effect scheduling issues.
  useEffect(() => {
    const deviations = getDeviations(deviationSet)

    const clearTimers = () => {
      for (const t of countdownTimersRef.current) clearTimeout(t)
      countdownTimersRef.current = []
    }

    const cancelCountdown = () => {
      clearTimers()
      if (pendingPhaseRef.current) {
        setOverlayPhase('none')
        pendingPhaseRef.current = null
        setCountdown(0)
      }
    }

    const startCountdown = (targetPhase: 'deviation-prompt' | 'trap-prompt') => {
      clearTimers()
      pendingPhaseRef.current = targetPhase
      setCountdown(3)
      setOverlayPhase('countdown')
      countdownTimersRef.current = [
        setTimeout(() => setCountdown(2), 1000),
        setTimeout(() => setCountdown(1), 2000),
        setTimeout(() => {
          if (pendingPhaseRef.current) {
            setOverlayPhase(pendingPhaseRef.current)
            pendingPhaseRef.current = null
          }
          setCountdown(0)
        }, 3000),
      ]
    }

    const unsub = useGameStore.subscribe((state, prevState) => {
      // Detect: deal animation just ended (isAnimating: true → false)
      if (prevState.isAnimating && !state.isAnimating) {
        const gs = state.gameState
        if (
          gs &&
          gs.phase === 'playerTurn' &&
          !hasCheckedRef.current &&
          gs.playerHands[0].cards.length === 2
        ) {
          hasCheckedRef.current = true
          setHandsPlayed(prev => prev + 1)

          const playerCards = gs.playerHands[0].cards
          const dealerUpcard = gs.dealerHand.cards[0]
          const match = findMatchingDeviation(playerCards, dealerUpcard, deviations)

          if (match) {
            setActiveDeviation(match)
            setTcAnswer(0)
            setSelectedAction(null)
            startCountdown('deviation-prompt')
          } else {
            nonDeviationCountRef.current++

            if (nonDeviationCountRef.current >= trapThresholdRef.current) {
              setActiveDeviation(null)
              setTrapAnswer(null)
              startCountdown('trap-prompt')
              nonDeviationCountRef.current = 0
              trapThresholdRef.current = Math.floor(Math.random() * 3) + 3
            }
          }
        }
      }

      // Reset hasChecked when round ends or game resets (AFTER detection block)
      if (!state.gameState && prevState.gameState) {
        hasCheckedRef.current = false
        cancelCountdown()
      }
      if (state.gameState?.isRoundOver && !prevState.gameState?.isRoundOver) {
        hasCheckedRef.current = false
        cancelCountdown()
      }
    })

    return () => {
      unsub()
      clearTimers()
    }
  }, [deviationSet])

  const handleDeviationSubmit = useCallback(() => {
    if (!activeDeviation) return

    const actualTC = trueCount
    const tcError = Math.abs(tcAnswer - actualTC)
    const tcOk = tcError <= 0.5

    // Determine correct action based on actual TC
    const correct = actualTC >= activeDeviation.trueCountThreshold
      ? activeDeviation.actionAbove
      : activeDeviation.actionBelow
    const actionOk = selectedAction === correct

    setIsTcCorrect(tcOk)
    setIsActionCorrect(actionOk)
    setCorrectAction(correct)
    setTcErrors(prev => [...prev, tcError])
    setDeviationsTotal(prev => prev + 1)

    const bothCorrect = tcOk && actionOk

    // Track per-deviation results
    const devName = activeDeviation.name
    if (!deviationResultsRef.current[devName]) {
      deviationResultsRef.current[devName] = { correct: 0, incorrect: 0 }
    }
    if (bothCorrect) {
      deviationResultsRef.current[devName].correct++
    } else {
      deviationResultsRef.current[devName].incorrect++
    }

    if (bothCorrect) {
      setDeviationsCorrect(prev => prev + 1)
      setCurrentStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      setCurrentStreak(0)
    }

    // Sync stats ref for session save
    const newTotal = deviationsTotal + 1
    const newCorrect = deviationsCorrect + (bothCorrect ? 1 : 0)
    const newBestStreak = bothCorrect
      ? Math.max(bestStreak, currentStreak + 1)
      : bestStreak
    statsRef.current = {
      totalQuestions: newTotal,
      correctAnswers: newCorrect,
      bestStreak: newBestStreak,
    }

    setOverlayPhase('feedback')
  }, [activeDeviation, trueCount, tcAnswer, selectedAction, deviationsTotal, deviationsCorrect, bestStreak, currentStreak, statsRef])

  const handleTrapAnswer = useCallback((answer: boolean) => {
    setTrapAnswer(answer)
    const correct = !answer // correct answer is always "No"
    setIsTrapCorrect(correct)

    if (correct) {
      setCurrentStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      setCurrentStreak(0)
    }

    setOverlayPhase('feedback')
  }, [])

  const handleDismiss = useCallback(() => {
    setOverlayPhase('none')
    setActiveDeviation(null)
    setSelectedAction(null)
    setTrapAnswer(null)
    // Clear any pending countdown timers
    for (const t of countdownTimersRef.current) clearTimeout(t)
    countdownTimersRef.current = []
    pendingPhaseRef.current = null
    setCountdown(0)
  }, [])

  // Block keyboard shortcuts during overlay (capture phase, before useKeyboardShortcuts)
  useEffect(() => {
    if (overlayPhase === 'none') return

    const blocker = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (['h', 's', 'd', 'p', 'r', 'i', ' '].includes(key)) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', blocker, true) // capture phase
    return () => window.removeEventListener('keydown', blocker, true)
  }, [overlayPhase])

  // Keyboard: Enter submits or continues
  useEffect(() => {
    if (overlayPhase === 'none') return

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      if (overlayPhase === 'feedback') {
        handleDismiss()
      } else if (overlayPhase === 'deviation-prompt' && selectedAction !== null) {
        handleDeviationSubmit()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [overlayPhase, selectedAction, handleDeviationSubmit, handleDismiss])

  // Stats calculations
  const deviationAccuracy = deviationsTotal > 0
    ? Math.round((deviationsCorrect / deviationsTotal) * 100)
    : 0
  const avgTcError = tcErrors.length > 0
    ? (tcErrors.reduce((a, b) => a + b, 0) / tcErrors.length).toFixed(1)
    : '0.0'

  // Current player hand info for overlay display
  const playerCards = gameState?.playerHands[0]?.cards
  const dealerUpcard = gameState?.dealerHand?.cards[0]
  const handValue = playerCards ? getHandValue(playerCards).best : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-black/40 text-xs text-white/50 shrink-0" data-testid="deviation-stats">
        <span>Hands: {handsPlayed}</span>
        <span>Deviations: {deviationsCorrect}/{deviationsTotal} ({deviationAccuracy}%)</span>
        <span>TC Avg Error: \u00B1{avgTcError}</span>
        <span>Streak: {currentStreak} (Best: {bestStreak})</span>
      </div>

      {/* GameTable fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <GameTable />
      </div>

      {/* Countdown overlay — transparent, blocks clicks while cards are visible */}
      {overlayPhase === 'countdown' && (
        <div className="absolute inset-0 z-50" data-testid="countdown-overlay">
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <div className="bg-black/80 text-gold px-5 py-2.5 rounded-full text-sm font-medium animate-pulse shadow-lg">
              Deviation check in {countdown}...
            </div>
          </div>
        </div>
      )}

      {/* Deviation Prompt Overlay */}
      {overlayPhase === 'deviation-prompt' && activeDeviation && (
        <div className="absolute inset-0 bg-black/30 flex items-start justify-center pt-16 z-50" data-testid="deviation-overlay">
          <div className="bg-neutral-900/95 border border-gold/30 rounded-2xl p-5 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center mb-4">Deviation Check</h3>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Your Hand:</span>
                <span className="text-white font-bold" data-testid="overlay-hand-value">{handValue}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Dealer Shows:</span>
                <span className="text-white font-bold" data-testid="overlay-dealer-card">{dealerUpcard?.rank}</span>
              </div>
            </div>

            {/* TC Input */}
            <div className="mb-4">
              <p className="text-white/70 text-sm text-center mb-2">What is the True Count?</p>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setTcAnswer(prev => prev - 0.5)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-lg
                    text-white font-bold transition-colors cursor-pointer"
                >
                  &minus;
                </button>
                <input
                  type="number"
                  step="0.5"
                  value={tcAnswer}
                  onChange={(e) => setTcAnswer(Number(e.target.value) || 0)}
                  data-testid="deviation-tc-input"
                  className="w-16 h-12 text-center text-xl font-bold bg-white/10 border border-white/20
                    rounded-xl text-white focus:outline-none focus:border-gold/60
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setTcAnswer(prev => prev + 0.5)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-lg
                    text-white font-bold transition-colors cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mb-4">
              <p className="text-white/70 text-sm text-center mb-2">What should you do?</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {ALL_ACTIONS.map(action => {
                  const enabled =
                    action === Action.Hit ? true :
                    action === Action.Stand ? true :
                    action === Action.Double ? (playerCards?.length === 2) :
                    action === Action.Split ? (activeDeviation.playerHand.includes(',')) :
                    action === Action.Surrender ? (playerCards?.length === 2) :
                    action === Action.Insurance ? (dealerUpcard?.rank === 'A') :
                    false
                  return (
                    <button
                      key={action}
                      onClick={() => enabled && setSelectedAction(action)}
                      disabled={!enabled}
                      data-testid={`deviation-action-${action.toLowerCase()}`}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                        ${!enabled
                          ? 'bg-white/5 text-white/20 cursor-not-allowed'
                          : selectedAction === action
                            ? 'bg-gold text-black cursor-pointer'
                            : 'bg-white/10 hover:bg-white/20 text-white cursor-pointer'}`}
                    >
                      {ACTION_LABEL[action]}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={handleDeviationSubmit}
              disabled={selectedAction === null}
              data-testid="deviation-submit"
              className="w-full px-6 py-3 bg-gold text-black font-bold rounded-xl
                hover:bg-gold/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {/* Trap Prompt Overlay */}
      {overlayPhase === 'trap-prompt' && (
        <div className="absolute inset-0 bg-black/30 flex items-start justify-center pt-16 z-50" data-testid="trap-overlay">
          <div className="bg-neutral-900/95 border border-gold/30 rounded-2xl p-5 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center mb-4">Deviation Check</h3>

            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Your Hand:</span>
                <span className="text-white font-bold">{handValue}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">Dealer Shows:</span>
                <span className="text-white font-bold">{dealerUpcard?.rank}</span>
              </div>
            </div>

            <p className="text-white font-medium text-center mb-4">Is there a deviation here?</p>

            <div className="flex gap-3">
              <button
                onClick={() => handleTrapAnswer(true)}
                data-testid="trap-yes"
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-medium
                  rounded-xl transition-colors cursor-pointer text-sm"
              >
                Yes - there is a deviation
              </button>
              <button
                onClick={() => handleTrapAnswer(false)}
                data-testid="trap-no"
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-medium
                  rounded-xl transition-colors cursor-pointer text-sm"
              >
                No - play Basic Strategy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Overlay */}
      {overlayPhase === 'feedback' && (
        <div className="absolute inset-0 bg-black/30 flex items-start justify-center pt-16 z-50" data-testid="feedback-overlay">
          <div className="bg-neutral-900/95 border border-gold/30 rounded-2xl p-5 max-w-sm w-full mx-4 shadow-2xl">
            {activeDeviation ? (
              // Deviation feedback
              <>
                <div className={`text-center mb-4 ${isTcCorrect && isActionCorrect ? 'text-success' : 'text-error'}`}>
                  <span className="text-4xl">{isTcCorrect && isActionCorrect ? '\u2705' : '\u274C'}</span>
                  <h3 className="text-xl font-bold mt-2" data-testid="deviation-feedback-result">
                    {isTcCorrect && isActionCorrect ? 'Correct!' : 'Wrong!'}
                  </h3>
                </div>

                <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-2">
                  {/* TC feedback */}
                  <p className="text-white/70 text-sm" data-testid="deviation-tc-feedback">
                    True Count: {formatTC(trueCount)}
                    {!isTcCorrect && (
                      <span className="text-error"> (you said {formatTC(tcAnswer)})</span>
                    )}
                  </p>

                  {/* Action feedback */}
                  {!isActionCorrect && selectedAction && correctAction && (
                    <p className="text-white/70 text-sm">
                      You chose <span className="text-error font-medium">{ACTION_LABEL[selectedAction]}</span>,
                      correct was <span className="text-success font-medium">{ACTION_LABEL[correctAction]}</span>.
                    </p>
                  )}

                  {/* Rule explanation */}
                  <p className="text-white/40 text-xs" data-testid="deviation-rule">
                    {activeDeviation.isIllustrious18 ? 'I18' : 'Fab 4'}: {activeDeviation.name} → {ACTION_LABEL[activeDeviation.actionAbove]} at TC ≥ {formatTC(activeDeviation.trueCountThreshold)}
                    {' '}(instead of {ACTION_LABEL[activeDeviation.actionBelow]})
                  </p>
                </div>
              </>
            ) : (
              // Trap feedback
              <>
                <div className={`text-center mb-4 ${isTrapCorrect ? 'text-success' : 'text-error'}`}>
                  <span className="text-4xl">{isTrapCorrect ? '\u2705' : '\u274C'}</span>
                  <h3 className="text-xl font-bold mt-2" data-testid="trap-feedback-result">
                    {isTrapCorrect ? 'Correct!' : 'Wrong!'}
                  </h3>
                </div>

                <div className="bg-white/5 rounded-xl p-4 mb-4">
                  <p className="text-white/70 text-sm" data-testid="trap-feedback-text">
                    {isTrapCorrect
                      ? 'No deviation applies here — play Basic Strategy.'
                      : 'There is no deviation for this hand — play Basic Strategy.'}
                  </p>
                </div>
              </>
            )}

            <button
              onClick={handleDismiss}
              data-testid="deviation-continue"
              className="w-full px-6 py-3 bg-gold text-black font-bold rounded-xl
                hover:bg-gold/90 transition-colors cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
