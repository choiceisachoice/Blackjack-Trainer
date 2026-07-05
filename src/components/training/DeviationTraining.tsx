import { useState, useCallback, useEffect } from 'react'
import { GraduationCap, Check, X } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { Action } from '../../engine/rules/types'
import { buildFlashSession, enabledActions, type FlashLevel, type FlashQuestion } from '../../engine/strategy/flashcards'
import { ACTION_LABEL, ALL_ACTIONS, formatTC } from './deviation-utils'
import { useAppStore } from '../../store/app-store'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeviationDetails } from '../../services/stats-types'

type Phase = 'settings' | 'question' | 'feedback' | 'summary'

const QUESTION_COUNTS = [10, 20, 30, 50]

const LEVEL_HELP: Record<FlashLevel, string> = {
  basic: 'Learn what to do at every hand — no counting yet.',
  deviations: 'Harder: the count is high or low — do you change your play?',
  mixed: 'A blend of both — basic hands plus count-based decisions.',
}

/** Display label for a hand. */
function formatHand(q: FlashQuestion): string {
  return q.hand === '*' ? 'Any' : q.hand
}

/**
 * Flashcards trainer.
 *
 * Drills Basic Strategy across every meaningful hand, and — at higher levels —
 * count-based deviations. Finite sessions, no repeated questions in a row.
 */
export function DeviationTraining() {
  const dealerHitsSoft17 = useAppStore(s => s.selectedRules.dealerHitsSoft17)

  const [level, setLevel] = useState<FlashLevel>('basic')
  const [numQuestions, setNumQuestions] = useState(20)
  const [phase, setPhase] = useState<Phase>('settings')

  const [session, setSession] = useState<FlashQuestion[]>([])
  const [qIndex, setQIndex] = useState(0)
  const question = session[qIndex] ?? null

  const [selectedAction, setSelectedAction] = useState<Action | null>(null)
  const [isCorrect, setIsCorrect] = useState(false)

  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  const { statsRef } = useSessionSave('deviationFlashCards', (): DeviationDetails => ({
    type: 'deviationFlashCards',
    deviationSet: 'all',
    perDeviation: {},
  }))

  const startSession = useCallback(() => {
    setSession(buildFlashSession(level, numQuestions, dealerHitsSoft17))
    setQIndex(0)
    setSelectedAction(null)
    setIsCorrect(false)
    setTotalCorrect(0)
    setTotalAttempts(0)
    setCurrentStreak(0)
    setBestStreak(0)
    setPhase('question')
  }, [level, numQuestions, dealerHitsSoft17])

  const handleAnswer = useCallback((action: Action) => {
    if (!question) return
    const correct = action === question.correctAction
    setSelectedAction(action)
    setIsCorrect(correct)

    const newAttempts = totalAttempts + 1
    const newCorrect = totalCorrect + (correct ? 1 : 0)
    const newBestStreak = correct ? Math.max(bestStreak, currentStreak + 1) : bestStreak

    setTotalAttempts(newAttempts)
    if (correct) {
      soundEngine.correct()
      setTotalCorrect(newCorrect)
      setCurrentStreak(currentStreak + 1)
      if (currentStreak + 1 > bestStreak) soundEngine.streak()
      setBestStreak(newBestStreak)
    } else {
      soundEngine.wrong()
      setCurrentStreak(0)
    }

    statsRef.current = { totalQuestions: newAttempts, correctAnswers: newCorrect, bestStreak: newBestStreak }
    setPhase('feedback')
  }, [question, totalAttempts, totalCorrect, bestStreak, currentStreak, statsRef])

  const handleNext = useCallback(() => {
    if (qIndex + 1 >= session.length) {
      soundEngine.sessionComplete()
      setPhase('summary')
      return
    }
    setQIndex(qIndex + 1)
    setSelectedAction(null)
    setIsCorrect(false)
    setPhase('question')
  }, [qIndex, session.length])

  // Keyboard: Enter → next in feedback
  useEffect(() => {
    if (phase !== 'feedback') return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Enter') handleNext() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleNext])

  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0

  // ── Settings Phase ──
  if (phase === 'settings') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <Panel icon={GraduationCap} title="Flashcards" subtitle="Drill every hand — and when to deviate." className="w-full max-w-md">
          {/* Level */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">Level</span>
            <Segmented
              fluid
              ariaLabel="Level"
              value={level}
              onChange={setLevel}
              options={[
                { value: 'basic' as FlashLevel, label: 'Basic Strategy' },
                { value: 'deviations' as FlashLevel, label: 'Deviations' },
                { value: 'mixed' as FlashLevel, label: 'Mixed' },
              ]}
            />
            <p className="text-xs text-content/40 mt-2">{LEVEL_HELP[level]}</p>
          </div>

          {/* Number of questions */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">Questions</span>
            <Segmented
              fluid
              ariaLabel="Number of questions"
              value={numQuestions}
              onChange={setNumQuestions}
              options={QUESTION_COUNTS.map(n => ({ label: String(n), value: n }))}
            />
          </div>

          <Button size="lg" className="w-full mt-1" onClick={startSession} data-testid="start-training">
            Start Training
          </Button>
        </Panel>
      </div>
    )
  }

  // ── Summary Phase ──
  if (phase === 'summary') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="surface w-full max-w-md p-7 flex flex-col items-center gap-6">
          <h3 className="text-xl font-bold text-gold-gradient" data-testid="summary-title">Session Complete!</h3>
          <div className="grid grid-cols-2 gap-3 w-full text-center">
            <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
              <div className="text-xs text-content/50">Accuracy</div>
              <div className="text-xl font-bold text-content">{accuracy}%</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
              <div className="text-xs text-content/50">Correct</div>
              <div className="text-xl font-bold text-content">{totalCorrect}/{totalAttempts}</div>
            </div>
            <div className="rounded-xl px-4 py-3 col-span-2 bg-contrast/5 border border-contrast/10">
              <div className="text-xs text-content/50">Best Streak</div>
              <div className="text-xl font-bold text-gold">{bestStreak}</div>
            </div>
          </div>
          <Button className="w-full" onClick={() => setPhase('settings')} data-testid="back-to-settings">
            Back to Settings
          </Button>
        </div>
      </div>
    )
  }

  if (!question) return null
  const enabled = enabledActions(question)

  // ── Question Phase ──
  if (phase === 'question') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
          <span data-testid="question-progress">Question {qIndex + 1}/{session.length}</span>
          <span>Correct: {totalCorrect}/{totalAttempts} ({accuracy}%)</span>
          <span>Streak: {currentStreak}</span>
        </div>

        {/* Situation card */}
        <div className="surface p-6 max-w-md w-full">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">Your Hand</span>
              <span className="text-content font-bold text-lg" data-testid="player-hand">{formatHand(question)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">Dealer Shows</span>
              <span className="text-content font-bold text-lg" data-testid="dealer-card">{question.dealer}</span>
            </div>
            {question.trueCount !== null && (
              <div className="flex justify-between items-center">
                <span className="text-content/60 text-sm">True Count</span>
                <span className="text-gold font-bold text-lg" data-testid="true-count">{formatTC(question.trueCount)}</span>
              </div>
            )}
          </div>

          <p className="text-content font-medium text-center mb-4">What do you do?</p>

          <div className="flex flex-wrap gap-2 justify-center">
            {ALL_ACTIONS.map(action => {
              const on = enabled[action]
              return (
                <button
                  key={action}
                  onClick={() => on && handleAnswer(action)}
                  disabled={!on}
                  data-testid={`action-${action.toLowerCase()}`}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-colors
                    ${on ? 'bg-contrast/10 hover:bg-contrast/20 text-content cursor-pointer'
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
  const deviated = question.correctAction !== question.basicAction
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
        <span>Question {qIndex + 1}/{session.length}</span>
        <span>Correct: {totalCorrect}/{totalAttempts} ({accuracy}%)</span>
        <span>Streak: {currentStreak}</span>
      </div>

      <div className="surface p-6 max-w-md w-full">
        <div className={`flex flex-col items-center text-center mb-4 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className={`grid place-items-center w-12 h-12 rounded-full border
            ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'}`}>
            {isCorrect ? <Check size={24} /> : <X size={24} />}
          </span>
          <h3 className="text-xl font-bold mt-2" data-testid="feedback-result">
            {isCorrect ? 'Correct!' : 'Wrong!'}
          </h3>
        </div>

        <div className="bg-contrast/5 rounded-xl p-4 mb-4 space-y-2">
          {!isCorrect && selectedAction && (
            <p className="text-content/70 text-sm">
              You chose <span className="text-error font-medium">{ACTION_LABEL[selectedAction]}</span>,
              correct was <span className="text-success font-medium">{ACTION_LABEL[question.correctAction]}</span>.
            </p>
          )}
          <p className="text-content/70 text-sm" data-testid="feedback-explanation">
            {question.trueCount === null ? (
              <>Basic Strategy: <span className="text-gold font-medium">{ACTION_LABEL[question.correctAction]}</span>.</>
            ) : deviated ? (
              <>At TC {formatTC(question.trueCount)}, <span className="text-gold font-medium">{ACTION_LABEL[question.correctAction]}</span> — a deviation from the basic play ({ACTION_LABEL[question.basicAction]}).</>
            ) : (
              <>At TC {formatTC(question.trueCount)}, stick with basic strategy: <span className="text-gold font-medium">{ACTION_LABEL[question.correctAction]}</span> (no deviation here).</>
            )}
          </p>
        </div>

        <Button onClick={handleNext} data-testid="next-question" className="w-full">
          {qIndex + 1 >= session.length ? 'See Results' : 'Next'}
        </Button>
      </div>
    </div>
  )
}
