import { useState, useCallback, useEffect, useRef } from 'react'
import { GraduationCap, Check, X } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { Action } from '../../engine/rules/types'
import { buildFlashSession, enabledActions, type FlashLevel, type FlashQuestion } from '../../engine/strategy/flashcards'
import { Trans, useTranslation } from 'react-i18next'
import { ACTION_KEY, ALL_ACTIONS, formatTC } from './deviation-utils'
import { useAppStore } from '../../store/app-store'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeviationDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'

type Phase = 'settings' | 'question' | 'feedback' | 'summary'

const QUESTION_COUNTS = [10, 20, 30, 50]

const LEVEL_HELP: Record<FlashLevel, string> = {
  basic: 'training.flash.helpBasic',
  deviations: 'training.flash.helpDeviations',
  mixed: 'training.flash.helpMixed',
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
  const { t } = useTranslation()
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

  // Per-deviation results accumulated across the session and saved on unmount,
  // so Analytics' weakest-hands panel and deviation stats reflect real answers.
  const perDeviationRef = useRef<Record<string, { correct: number; incorrect: number }>>({})

  const { statsRef, finish } = useSessionSave('deviationFlashCards', (): DeviationDetails => ({
    type: 'deviationFlashCards',
    deviationSet: 'all',
    perDeviation: perDeviationRef.current,
  }))

  const startSession = useCallback(() => {
    perDeviationRef.current = {}
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

    // Record per-deviation results (only count-based deviation questions).
    if (question.isDeviation && question.deviationName) {
      const name = question.deviationName
      // Tally in place. This runs in an event handler, not during render, so
      // mutating the ref's contents is legitimate; the rule cannot tell the two
      // apart here.
      const entry = perDeviationRef.current[name] ?? { correct: 0, incorrect: 0 }
      // eslint-disable-next-line react-hooks/immutability -- event handler, not render
      if (correct) entry.correct++
      else entry.incorrect++
      perDeviationRef.current[name] = entry
    }

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
      // Pay out at the summary, not on unmount — this is the moment the player
      // is looking for the reward.
      finish()
      setPhase('summary')
      return
    }
    setQIndex(qIndex + 1)
    setSelectedAction(null)
    setIsCorrect(false)
    setPhase('question')
  }, [qIndex, session.length, finish])

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
      <div className="relative isolate overflow-hidden flex-1 flex flex-col items-center justify-center px-4">
        <TrainingBackdrop mode="deviationFlashCards" showRails />
        <Panel icon={GraduationCap} title={t('training.flash.title')} subtitle={t('training.flash.sub')} className="w-full max-w-xl">
          {/* Level */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.common.level')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.common.level')}
              value={level}
              onChange={setLevel}
              options={[
                { value: 'basic' as FlashLevel, label: t('training.flash.levelBasic') },
                { value: 'deviations' as FlashLevel, label: t('training.flash.levelDeviations') },
                { value: 'mixed' as FlashLevel, label: t('training.flash.levelMixed') },
              ]}
            />
            <p className="text-xs text-content/40 mt-2">{t(LEVEL_HELP[level])}</p>
          </div>

          {/* Number of questions */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.common.questions')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.flash.numQuestionsAria')}
              value={numQuestions}
              onChange={setNumQuestions}
              options={QUESTION_COUNTS.map(n => ({ label: String(n), value: n }))}
            />
          </div>

          <Button size="lg" className="w-full mt-1" onClick={startSession} data-testid="start-training">
            {t('training.flash.start')}
          </Button>
        </Panel>
      </div>
    )
  }

  // ── Summary Phase ──
  if (phase === 'summary') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="surface w-full max-w-xl p-7 md:p-8 flex flex-col items-center gap-6">
          <h3 className="text-xl font-bold text-gold-gradient" data-testid="summary-title">{t('training.common.sessionComplete')}</h3>
          <div className="grid grid-cols-2 gap-3 w-full text-center">
            <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
              <div className="text-xs text-content/50">{t('training.common.accuracy')}</div>
              <div className="text-xl font-bold text-content">{accuracy}%</div>
            </div>
            <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
              <div className="text-xs text-content/50">{t('training.common.correct')}</div>
              <div className="text-xl font-bold text-content">{totalCorrect}/{totalAttempts}</div>
            </div>
            <div className="rounded-xl px-4 py-3 col-span-2 bg-contrast/5 border border-contrast/10">
              <div className="text-xs text-content/50">{t('training.common.bestStreak')}</div>
              <div className="text-xl font-bold text-gold">{bestStreak}</div>
            </div>
          </div>
          <Button className="w-full" onClick={() => setPhase('settings')} data-testid="back-to-settings">
            {t('training.common.backToSettings')}
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
          <span data-testid="question-progress">{t('training.common.questionProgress', { n: qIndex + 1, total: session.length })}</span>
          <span>{t('training.common.correctOf', { n: totalCorrect, total: totalAttempts, pct: accuracy })}</span>
          <span>{t('training.common.streakOf', { n: currentStreak })}</span>
        </div>

        {/* Situation card */}
        <div className="surface p-6 max-w-md w-full">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">{t('training.flash.yourHand')}</span>
              <span className="text-content font-bold text-lg" data-testid="player-hand">{formatHand(question)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-content/60 text-sm">{t('training.flash.dealerShows')}</span>
              <span className="text-content font-bold text-lg" data-testid="dealer-card">{question.dealer}</span>
            </div>
            {question.trueCount !== null && (
              <div className="flex justify-between items-center">
                <span className="text-content/60 text-sm">{t('training.flash.trueCount')}</span>
                <span className="text-gold font-bold text-lg" data-testid="true-count">{formatTC(question.trueCount)}</span>
              </div>
            )}
          </div>

          <p className="text-content font-medium text-center mb-4">{t('training.flash.whatDoYouDo')}</p>

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
                  {t(ACTION_KEY[action])}
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
        <span>{t('training.common.questionProgress', { n: qIndex + 1, total: session.length })}</span>
        <span>{t('training.common.correctOf', { n: totalCorrect, total: totalAttempts, pct: accuracy })}</span>
        <span>{t('training.common.streakOf', { n: currentStreak })}</span>
      </div>

      <div className="surface p-6 max-w-md w-full">
        <div className={`flex flex-col items-center text-center mb-4 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className={`grid place-items-center w-12 h-12 rounded-full border
            ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'}`}>
            {isCorrect ? <Check size={24} /> : <X size={24} />}
          </span>
          <h3 className="text-xl font-bold mt-2" data-testid="feedback-result">
            {isCorrect ? t('training.common.correctBang') : t('training.common.wrongBang')}
          </h3>
        </div>

        <div className="bg-contrast/5 rounded-xl p-4 mb-4 space-y-2">
          {!isCorrect && selectedAction && (
            <p className="text-content/70 text-sm">
              <Trans
                i18nKey="training.flash.youChose"
                values={{ chosen: t(ACTION_KEY[selectedAction]), right: t(ACTION_KEY[question.correctAction]) }}
                components={{
                  w: <span className="text-error font-medium" />,
                  r: <span className="text-success font-medium" />,
                }}
              />
            </p>
          )}
          <p className="text-content/70 text-sm" data-testid="feedback-explanation">
            <Trans
              i18nKey={
                question.trueCount === null ? 'training.flash.basicIs'
                  : deviated ? 'training.flash.deviation'
                  : 'training.flash.noDeviation'
              }
              values={{
                action: t(ACTION_KEY[question.correctAction]),
                basic: t(ACTION_KEY[question.basicAction]),
                tc: question.trueCount === null ? '' : formatTC(question.trueCount),
              }}
              components={{ h: <span className="text-gold font-medium" /> }}
            />
          </p>
        </div>

        <Button onClick={handleNext} data-testid="next-question" className="w-full">
          {qIndex + 1 >= session.length ? t('training.common.seeResults') : t('training.common.next')}
        </Button>
      </div>
    </div>
  )
}
