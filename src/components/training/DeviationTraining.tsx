import { useState, useCallback, useEffect, useRef } from 'react'
import { Action } from '../../engine/rules/types'
import type { Deviation } from '../../engine/counting/types'
import { ACTION_LABEL, getDeviations, ALL_ACTIONS, getFlashCardActionEnabled, formatTC, getBasicAction, isReversedDeviation, getDeviationAction as getDevAction } from './deviation-utils'
import { DeviationAtTable } from './DeviationAtTable'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeviationSet } from './deviation-utils'
import type { DeviationDetails } from '../../services/stats-types'

type TrainingMode = 'flashCards' | 'atTheTable'
type Phase = 'settings' | 'question' | 'feedback' | 'atTheTable'

/** Generates a random TC around the threshold. */
function generateTrueCount(threshold: number, isAbove: boolean): number {
  if (isAbove) {
    // TC at or above threshold: threshold to threshold+4
    return threshold + Math.floor(Math.random() * 5)
  }
  // TC below threshold: threshold-4 to threshold-1
  return threshold - 1 - Math.floor(Math.random() * 4)
}

interface QuestionState {
  deviation: Deviation
  trueCount: number
  isAboveThreshold: boolean
  correctAction: Action
}

/**
 * Deviation Training mode.
 *
 * Flash card style: shows a blackjack situation with a True Count,
 * player must decide whether to follow Basic Strategy or deviate.
 */
export function DeviationTraining() {
  const [deviationSet, setDeviationSet] = useState<DeviationSet>('i18')
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('flashCards')
  const [phase, setPhase] = useState<Phase>('settings')

  // Question state
  const [question, setQuestion] = useState<QuestionState | null>(null)
  const [selectedAction, setSelectedAction] = useState<Action | null>(null)
  const [isCorrect, setIsCorrect] = useState(false)

  // Stats
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  // Per-deviation tracking for session save
  const deviationResultsRef = useRef<Record<string, { correct: number; incorrect: number }>>({})

  // ── Session stats persistence (flash cards only) ──
  const { statsRef } = useSessionSave('deviationFlashCards', (): DeviationDetails => ({
    type: 'deviationFlashCards',
    deviationSet,
    perDeviation: { ...deviationResultsRef.current },
  }))

  const generateQuestion = useCallback(() => {
    const deviations = getDeviations(deviationSet)
    const deviation = deviations[Math.floor(Math.random() * deviations.length)]
    const isAbove = Math.random() < 0.5
    const tc = generateTrueCount(deviation.trueCountThreshold, isAbove)
    const correctAction = isAbove ? deviation.actionAbove : deviation.actionBelow

    setQuestion({ deviation, trueCount: tc, isAboveThreshold: isAbove, correctAction })
    setSelectedAction(null)
    setIsCorrect(false)
    setPhase('question')
  }, [deviationSet])

  const handleAnswer = useCallback((action: Action) => {
    if (!question) return
    const correct = action === question.correctAction
    setSelectedAction(action)
    setIsCorrect(correct)
    setTotalAttempts(prev => prev + 1)

    // Track per-deviation results
    const devName = question.deviation.name
    if (!deviationResultsRef.current[devName]) {
      deviationResultsRef.current[devName] = { correct: 0, incorrect: 0 }
    }
    if (correct) {
      deviationResultsRef.current[devName].correct++
    } else {
      deviationResultsRef.current[devName].incorrect++
    }

    if (correct) {
      soundEngine.correct()
      setTotalCorrect(prev => prev + 1)
      setCurrentStreak(prev => {
        const next = prev + 1
        if (next > bestStreak) soundEngine.streak()
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      soundEngine.wrong()
      setCurrentStreak(0)
    }

    // Sync stats ref for session save
    const newAttempts = totalAttempts + 1
    const newCorrect = totalCorrect + (correct ? 1 : 0)
    const newBestStreak = correct
      ? Math.max(bestStreak, currentStreak + 1)
      : bestStreak
    statsRef.current = {
      totalQuestions: newAttempts,
      correctAnswers: newCorrect,
      bestStreak: newBestStreak,
    }

    setPhase('feedback')
  }, [question, totalAttempts, totalCorrect, bestStreak, currentStreak, statsRef])

  // Keyboard: Enter → next question in feedback phase
  useEffect(() => {
    if (phase !== 'feedback') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') generateQuestion()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, generateQuestion])

  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0

  // ── Settings Phase ──
  if (phase === 'settings') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <h2 className="text-2xl font-bold text-content">Deviation Training</h2>

        {/* Deviation Set */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-content/50">Deviation Set</span>
          <div className="flex gap-2">
            {([
              { value: 'i18' as DeviationSet, label: 'Illustrious 18' },
              { value: 'fab4' as DeviationSet, label: 'Fab 4' },
              { value: 'all' as DeviationSet, label: 'All 22' },
            ]).map(d => (
              <button
                key={d.value}
                onClick={() => setDeviationSet(d.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${deviationSet === d.value
                    ? 'bg-gold text-black'
                    : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Training Mode */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-content/50">Mode</span>
          <div className="flex gap-2">
            <button
              onClick={() => setTrainingMode('flashCards')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${trainingMode === 'flashCards'
                  ? 'bg-gold text-black'
                  : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
            >
              Flash Cards
            </button>
            <button
              onClick={() => setTrainingMode('atTheTable')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${trainingMode === 'atTheTable'
                  ? 'bg-gold text-black'
                  : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
            >
              At the Table
            </button>
          </div>
        </div>

        <button
          onClick={() => trainingMode === 'atTheTable' ? setPhase('atTheTable') : generateQuestion()}
          data-testid="start-training"
          className="mt-4 px-8 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors text-lg cursor-pointer"
        >
          Start Training
        </button>
      </div>
    )
  }

  if (phase === 'atTheTable') {
    return <DeviationAtTable deviationSet={deviationSet} />
  }

  if (!question) return null
  const { deviation, trueCount, correctAction } = question
  const actionEnabled = getFlashCardActionEnabled(deviation)

  // ── Question Phase ──
  if (phase === 'question') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
          <span>Correct: {totalCorrect}/{totalAttempts} ({accuracy}%)</span>
          <span>Streak: {currentStreak} (Best: {bestStreak})</span>
        </div>

        {/* Situation card */}
        <div className="bg-casino-bg/95 border border-contrast/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">Your Hand:</span>
              <span className="text-content font-bold text-lg" data-testid="player-hand">
                {deviation.playerHand === '*' ? 'Any' : deviation.playerHand}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">Dealer Shows:</span>
              <span className="text-content font-bold text-lg" data-testid="dealer-card">
                {deviation.dealerUpcard}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">True Count:</span>
              <span className="text-gold font-bold text-lg" data-testid="true-count">
                {formatTC(trueCount)}
              </span>
            </div>
            <div className="border-t border-contrast/10 pt-3">
              <span className="text-content/40 text-xs">
                Basic Strategy says: <span className="text-content/70 font-medium">{ACTION_LABEL[getBasicAction(deviation)]}</span>
              </span>
            </div>
          </div>

          <p className="text-content font-medium text-center mb-4">What do you do?</p>

          <div className="flex flex-wrap gap-2 justify-center">
            {ALL_ACTIONS.map(action => {
              const enabled = actionEnabled[action]
              return (
                <button
                  key={action}
                  onClick={() => enabled && handleAnswer(action)}
                  disabled={!enabled}
                  data-testid={`action-${action.toLowerCase()}`}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-colors
                    ${enabled
                      ? 'bg-contrast/10 hover:bg-contrast/20 text-content cursor-pointer'
                      : 'bg-contrast/5 text-content/20 cursor-not-allowed'}`}
                >
                  {ACTION_LABEL[action]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Feedback Phase ──
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
        <span>Correct: {totalCorrect}/{totalAttempts} ({accuracy}%)</span>
        <span>Streak: {currentStreak} (Best: {bestStreak})</span>
      </div>

      {/* Result card */}
      <div className="bg-casino-bg/95 border border-contrast/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className={`text-center mb-4 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className="text-4xl">{isCorrect ? '\u2705' : '\u274C'}</span>
          <h3 className="text-xl font-bold mt-2" data-testid="feedback-result">
            {isCorrect ? 'Correct!' : 'Wrong!'}
          </h3>
        </div>

        {/* Explanation */}
        <div className="bg-contrast/5 rounded-xl p-4 mb-4 space-y-2">
          {!isCorrect && selectedAction && (
            <p className="text-content/70 text-sm">
              You chose <span className="text-error font-medium">{ACTION_LABEL[selectedAction]}</span>,
              correct was <span className="text-success font-medium">{ACTION_LABEL[correctAction]}</span>.
            </p>
          )}
          <p className="text-content/70 text-sm" data-testid="feedback-explanation">
            {correctAction === getBasicAction(deviation)
              ? `Basic Strategy: ${ACTION_LABEL[correctAction]} (TC ${formatTC(trueCount)} — deviation does not apply)`
              : `${ACTION_LABEL[correctAction]} at TC ${isReversedDeviation(deviation) ? '<' : '\u2265'} ${formatTC(deviation.trueCountThreshold)} (you had ${formatTC(trueCount)})`}
          </p>
          <p className="text-content/40 text-xs">
            {deviation.isIllustrious18 ? 'I18' : 'Fab 4'}: {deviation.name} → {ACTION_LABEL[getDevAction(deviation)]} at TC {isReversedDeviation(deviation) ? '<' : '\u2265'} {formatTC(deviation.trueCountThreshold)}
            {' '}(instead of {ACTION_LABEL[getBasicAction(deviation)]})
          </p>
        </div>

        <button
          onClick={generateQuestion}
          data-testid="next-question"
          className="w-full px-6 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  )
}
