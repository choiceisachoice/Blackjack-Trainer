import { useState, useCallback, useEffect } from 'react'
import { ILLUSTRIOUS_18, FAB_4 } from '../../engine/counting/deviations'
import { Action } from '../../engine/rules/types'
import type { Deviation } from '../../engine/counting/types'

type DeviationSet = 'i18' | 'fab4' | 'all'
type TrainingMode = 'flashCards' | 'atTheTable'
type Phase = 'settings' | 'question' | 'feedback'

/** Human-readable action labels. */
const ACTION_LABEL: Record<string, string> = {
  [Action.Hit]: 'Hit',
  [Action.Stand]: 'Stand',
  [Action.Double]: 'Double',
  [Action.Split]: 'Split',
  [Action.Surrender]: 'Surrender',
  [Action.Insurance]: 'Insurance',
}

/** Returns the deviation set based on user selection. */
function getDeviations(set: DeviationSet): Deviation[] {
  switch (set) {
    case 'i18': return ILLUSTRIOUS_18
    case 'fab4': return FAB_4
    case 'all': return [...ILLUSTRIOUS_18, ...FAB_4]
  }
}

/** Returns possible player actions for a given deviation. */
function getActionChoices(deviation: Deviation): Action[] {
  const actions = new Set<Action>([deviation.actionAbove, deviation.actionBelow])
  // Always include Hit/Stand as baseline options
  actions.add(Action.Hit)
  actions.add(Action.Stand)
  // Add contextual actions
  if (deviation.actionAbove === Action.Double || deviation.actionBelow === Action.Double) {
    actions.add(Action.Double)
  }
  if (deviation.actionAbove === Action.Split || deviation.actionBelow === Action.Split) {
    actions.add(Action.Split)
  }
  if (deviation.actionAbove === Action.Surrender || deviation.actionBelow === Action.Surrender) {
    actions.add(Action.Surrender)
  }
  if (deviation.actionAbove === Action.Insurance) {
    actions.add(Action.Insurance)
  }
  return Array.from(actions)
}

/** Generates a random TC around the threshold. */
function generateTrueCount(threshold: number, isAbove: boolean): number {
  if (isAbove) {
    // TC at or above threshold: threshold to threshold+4
    return threshold + Math.floor(Math.random() * 5)
  }
  // TC below threshold: threshold-4 to threshold-1
  return threshold - 1 - Math.floor(Math.random() * 4)
}

/** Format TC as "+N" or "N". */
function formatTC(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
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

    if (correct) {
      setTotalCorrect(prev => prev + 1)
      setCurrentStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      setCurrentStreak(0)
    }

    setPhase('feedback')
  }, [question])

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
        <h2 className="text-2xl font-bold text-white">Deviation Training</h2>

        {/* Deviation Set */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Deviation Set</span>
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
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Training Mode */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Mode</span>
          <div className="flex gap-2">
            <button
              onClick={() => setTrainingMode('flashCards')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${trainingMode === 'flashCards'
                  ? 'bg-gold text-black'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              Flash Cards
            </button>
            <button
              onClick={() => setTrainingMode('atTheTable')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${trainingMode === 'atTheTable'
                  ? 'bg-gold text-black'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              At the Table
            </button>
          </div>
          {trainingMode === 'atTheTable' && (
            <p className="text-xs text-warning mt-1">Coming soon — Flash Cards available now</p>
          )}
        </div>

        <button
          onClick={generateQuestion}
          data-testid="start-training"
          className="mt-4 px-8 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors text-lg cursor-pointer"
        >
          Start Training
        </button>
      </div>
    )
  }

  if (!question) return null
  const { deviation, trueCount, correctAction } = question
  const actionChoices = getActionChoices(deviation)

  // ── Question Phase ──
  if (phase === 'question') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-black/40 text-xs text-white/50 rounded-lg">
          <span>Correct: {totalCorrect}/{totalAttempts} ({accuracy}%)</span>
          <span>Streak: {currentStreak} (Best: {bestStreak})</span>
        </div>

        {/* Situation card */}
        <div className="bg-neutral-900/95 border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Your Hand:</span>
              <span className="text-white font-bold text-lg" data-testid="player-hand">
                {deviation.playerHand === '*' ? 'Any' : deviation.playerHand}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Dealer Shows:</span>
              <span className="text-white font-bold text-lg" data-testid="dealer-card">
                {deviation.dealerUpcard}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">True Count:</span>
              <span className="text-gold font-bold text-lg" data-testid="true-count">
                {formatTC(trueCount)}
              </span>
            </div>
            <div className="border-t border-white/10 pt-3">
              <span className="text-white/40 text-xs">
                Basic Strategy says: <span className="text-white/70 font-medium">{ACTION_LABEL[deviation.actionBelow]}</span>
              </span>
            </div>
          </div>

          <p className="text-white font-medium text-center mb-4">What do you do?</p>

          <div className="flex flex-wrap gap-2 justify-center">
            {actionChoices.map(action => (
              <button
                key={action}
                onClick={() => handleAnswer(action)}
                data-testid={`action-${action.toLowerCase()}`}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium
                  rounded-xl transition-colors cursor-pointer text-sm"
              >
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Feedback Phase ──
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-black/40 text-xs text-white/50 rounded-lg">
        <span>Correct: {totalCorrect}/{totalAttempts} ({accuracy}%)</span>
        <span>Streak: {currentStreak} (Best: {bestStreak})</span>
      </div>

      {/* Result card */}
      <div className="bg-neutral-900/95 border border-white/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className={`text-center mb-4 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className="text-4xl">{isCorrect ? '\u2705' : '\u274C'}</span>
          <h3 className="text-xl font-bold mt-2" data-testid="feedback-result">
            {isCorrect ? 'Correct!' : 'Wrong!'}
          </h3>
        </div>

        {/* Explanation */}
        <div className="bg-white/5 rounded-xl p-4 mb-4 space-y-2">
          {!isCorrect && selectedAction && (
            <p className="text-white/70 text-sm">
              You chose <span className="text-error font-medium">{ACTION_LABEL[selectedAction]}</span>,
              correct was <span className="text-success font-medium">{ACTION_LABEL[correctAction]}</span>.
            </p>
          )}
          <p className="text-white/70 text-sm" data-testid="feedback-explanation">
            {question.isAboveThreshold
              ? `${ACTION_LABEL[correctAction]} at TC \u2265 ${formatTC(deviation.trueCountThreshold)} (you had ${formatTC(trueCount)})`
              : `Basic Strategy: ${ACTION_LABEL[correctAction]} (TC ${formatTC(trueCount)} is below ${formatTC(deviation.trueCountThreshold)})`}
          </p>
          <p className="text-white/40 text-xs">
            {deviation.isIllustrious18 ? 'I18' : 'Fab 4'}: {deviation.name} → {ACTION_LABEL[deviation.actionAbove]} at TC ≥ {formatTC(deviation.trueCountThreshold)}
            {' '}(instead of {ACTION_LABEL[deviation.actionBelow]})
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
