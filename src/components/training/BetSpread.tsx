import { useState, useCallback, useEffect, useRef } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Coins, Check, X, Minus, Plus } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { calculateTrueCount } from '../../engine/counting/counting-engine'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { BetSpreadDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'
import { BET_SPREAD, rand, getMultiplier, getCorrectBet, buildBracketSequence } from './bet-spread-math'

type QuestionType = 'A' | 'B' | 'C'
type QuestionMode = 'A' | 'B' | 'C' | 'random'
type Phase = 'settings' | 'question' | 'feedback' | 'summary'

/** Bet multipliers shown as options (1–16 spread). */
const MULTIPLIERS = [1, 2, 4, 8, 12, 16]

/** Realistic table minimums (the "unit"). Varies per question for realism. */
const TABLE_MINIMUMS = [5, 10, 15, 25, 50, 100]

const REMAINING_DECKS_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const QUESTION_COUNTS = [10, 20, 30, 50]

/** Format TC as "+N" or "N". */
function formatTC(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rand() * arr.length)] }

interface Question {
  type: QuestionType
  tableMin: number
  rc: number
  remainingDecks: number
  tc: number
  correctBet: number
}

/** Picks a representative integer TC inside a bracket (adds variety). */
function pickTargetTC(bracketIdx: number): number {
  switch (bracketIdx) {
    case 0: return pick([-1, 0])
    case 5: return pick([5, 6, 7])
    default: return bracketIdx // brackets 1..4 map to TC 1..4
  }
}

/** Builds one concrete question in the target bracket, avoiding a repeat of prev. */
function makeQuestion(bracketIdx: number, type: QuestionType, prev: Question | null): Question {
  const targetTC = pickTargetTC(bracketIdx)

  // Vary the table minimum; avoid repeating the previous one
  let tableMin = pick(TABLE_MINIMUMS)
  if (prev && tableMin === prev.tableMin) {
    const others = TABLE_MINIMUMS.filter(m => m !== prev.tableMin)
    tableMin = pick(others)
  }

  let rc = 0
  let remainingDecks = 1
  let tc = targetTC

  if (type !== 'B') {
    // Type A/C: present RC + remaining decks; the engine derives the TC
    remainingDecks = pick(REMAINING_DECKS_OPTIONS)
    rc = Math.round(targetTC * remainingDecks)
    tc = calculateTrueCount(rc, remainingDecks)
  }

  return { type, tableMin, rc, remainingDecks, tc, correctBet: getCorrectBet(tc, tableMin) }
}

/** Builds a full, non-repeating session of questions. */
function buildSession(mode: QuestionMode, count: number): Question[] {
  const seq = buildBracketSequence(count)
  const questions: Question[] = []
  let prev: Question | null = null
  for (const bracketIdx of seq) {
    const type: QuestionType = mode === 'random' ? pick(['A', 'B', 'C'] as const) : mode
    const q = makeQuestion(bracketIdx, type, prev)
    questions.push(q)
    prev = q
  }
  return questions
}

/**
 * Bet Spread training mode.
 *
 * Realistic scenarios: each question uses a different table minimum, and the
 * player picks the correct bet from that table's 1–16 spread. Sessions are a
 * fixed length with no repeated questions, then show a summary.
 */
export function BetSpread() {
  const { t } = useTranslation()
  const [questionMode, setQuestionMode] = useState<QuestionMode>('random')
  const [numQuestions, setNumQuestions] = useState(20)
  const [phase, setPhase] = useState<Phase>('settings')

  // Session
  const [session, setSession] = useState<Question[]>([])
  const [qIndex, setQIndex] = useState(0)
  const question = session[qIndex] ?? null

  // Answer state
  const [tcAnswer, setTcAnswer] = useState(0)
  const [selectedBet, setSelectedBet] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState(false)
  const [tcCorrect, setTcCorrect] = useState(true)

  // Stats
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  const tcCorrectRef = useRef(0)
  const tcTotalRef = useRef(0)
  const betCorrectRef = useRef(0)
  const betTotalRef = useRef(0)

  const { statsRef, finish, begin } = useSessionSave('betSpread', (): BetSpreadDetails => ({
    type: 'betSpread',
    questionMode,
    tcCorrect: tcCorrectRef.current,
    tcTotal: tcTotalRef.current,
    betCorrect: betCorrectRef.current,
    betTotal: betTotalRef.current,
  }))

  const startSession = useCallback(() => {
    begin()
    setSession(buildSession(questionMode, numQuestions))
    setQIndex(0)
    setTcAnswer(0)
    setSelectedBet(null)
    setIsCorrect(false)
    setTcCorrect(true)
    setTotalCorrect(0)
    setTotalAttempts(0)
    setCurrentStreak(0)
    setBestStreak(0)
    tcCorrectRef.current = 0
    tcTotalRef.current = 0
    betCorrectRef.current = 0
    betTotalRef.current = 0
    setPhase('question')
  }, [questionMode, numQuestions, begin])

  const handleSubmitBet = useCallback((bet: number) => {
    if (!question) return

    const betOk = bet === question.correctBet
    let correct = betOk
    let tcOk = true

    betTotalRef.current++
    if (betOk) betCorrectRef.current++

    if (question.type === 'C') {
      tcOk = tcAnswer === question.tc
      tcTotalRef.current++
      if (tcOk) tcCorrectRef.current++
      correct = correct && tcOk
    }

    setSelectedBet(bet)
    setIsCorrect(correct)
    setTcCorrect(tcOk)

    const newAttempts = totalAttempts + 1
    const newCorrect = totalCorrect + (correct ? 1 : 0)
    const newBestStreak = correct ? Math.max(bestStreak, currentStreak + 1) : bestStreak

    setTotalAttempts(newAttempts)
    if (correct) {
      soundEngine.correct()
      setTotalCorrect(newCorrect)
      setCurrentStreak(currentStreak + 1)
      setBestStreak(newBestStreak)
    } else {
      soundEngine.wrong()
      setCurrentStreak(0)
    }

    statsRef.current = {
      totalQuestions: newAttempts,
      correctAnswers: newCorrect,
      bestStreak: newBestStreak,
    }

    setPhase('feedback')
  }, [question, tcAnswer, totalAttempts, totalCorrect, bestStreak, currentStreak, statsRef])

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
    setTcAnswer(0)
    setSelectedBet(null)
    setIsCorrect(false)
    setTcCorrect(true)
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
        <TrainingBackdrop mode="betSpread" showRails />
        <Panel icon={Coins} title={t('training.bet.title')} subtitle={t('training.bet.sub')} className="w-full max-w-xl">
          {/* Bet Spread Reference (multiplier ladder) */}
          <div className="rounded-xl p-4 bg-contrast/5 border border-contrast/10">
            <p className="text-xs font-semibold tracking-widest uppercase text-content/40 mb-3 text-center">{t('training.bet.reference')}</p>
            <div className="space-y-1">
              {BET_SPREAD.map((row, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-content/70">{row.label}</span>
                  <span className="text-gold font-medium">
                    {row.multiplier}×{i === 0 ? t('training.bet.minTag') : i === BET_SPREAD.length - 1 ? t('training.bet.maxTag') : ''}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[0.75rem] text-content/40 mt-3 text-center">
              {t('training.bet.betEquals')}
            </p>
          </div>

          {/* Question Type */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.bet.questionType')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.bet.questionType')}
              value={questionMode}
              onChange={setQuestionMode}
              options={[
                { value: 'random' as QuestionMode, label: t('training.bet.typeRandom') },
                { value: 'A' as QuestionMode, label: t('training.bet.typeA') },
                { value: 'B' as QuestionMode, label: t('training.bet.typeB') },
                { value: 'C' as QuestionMode, label: t('training.bet.typeC') },
              ]}
            />
            <p className="text-xs text-content/40 mt-2">
              {t(`training.bet.help${questionMode === 'random' ? 'Random' : questionMode}`)}
            </p>
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
              <div className="text-xl font-bold text-content" data-testid="summary-accuracy">{accuracy}%</div>
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
  const betOptions = MULTIPLIERS.map(m => m * question.tableMin)

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
          {/* Table minimum — always shown (realistic scenario) */}
          <div className="flex justify-between items-center pb-3 mb-3 border-b border-contrast/10">
            <span className="text-content/60 text-sm">{t('training.bet.tableMinimum')}</span>
            <span className="text-gold font-bold text-lg" data-testid="table-min">${question.tableMin}</span>
          </div>

          <div className="space-y-3 mb-6">
            {(question.type === 'A' || question.type === 'C') && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-content/60 text-sm">{t('training.bet.runningCount')}</span>
                  <span className="text-content font-bold text-lg" data-testid="running-count">{formatTC(question.rc)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-content/60 text-sm">{t('training.bet.remainingDecks')}</span>
                  <span className="text-content font-bold text-lg" data-testid="remaining-decks">~{question.remainingDecks}</span>
                </div>
              </>
            )}

            {question.type === 'B' && (
              <div className="flex justify-between items-center">
                <span className="text-content/60 text-sm">{t('training.flash.trueCount')}</span>
                <span className="text-gold font-bold text-lg" data-testid="true-count">{formatTC(question.tc)}</span>
              </div>
            )}
          </div>

          {/* Type C: TC input */}
          {question.type === 'C' && (
            <div className="mb-6">
              <p className="text-content/70 text-sm mb-2 text-center">{t('training.bet.whatIsTc')}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setTcAnswer(prev => prev - 0.5)}
                  aria-label={t('training.bet.decreaseTc')}
                  className="grid place-items-center w-10 h-10 rounded-full bg-contrast/10 hover:bg-contrast/20 text-content transition-colors cursor-pointer"
                >
                  <Minus size={18} />
                </button>
                <input
                  type="number"
                  step="0.5"
                  value={tcAnswer}
                  onChange={(e) => setTcAnswer(Number(e.target.value) || 0)}
                  data-testid="tc-input"
                  className="w-20 h-12 text-center text-xl font-bold bg-contrast/10 border border-contrast/20
                    rounded-xl text-content focus:outline-none focus:border-gold/60
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setTcAnswer(prev => prev + 0.5)}
                  aria-label={t('training.bet.increaseTc')}
                  className="grid place-items-center w-10 h-10 rounded-full bg-contrast/10 hover:bg-contrast/20 text-content transition-colors cursor-pointer"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          )}

          <p className="text-content font-medium text-center mb-4">{t('training.bet.whatIsBet')}</p>

          <div className="flex flex-wrap gap-2 justify-center">
            {betOptions.map(bet => (
              <button
                key={bet}
                onClick={() => handleSubmitBet(bet)}
                data-testid={`bet-${bet}`}
                className="px-5 py-2.5 bg-contrast/10 hover:bg-contrast/20 text-content font-medium
                  rounded-xl transition-colors cursor-pointer text-sm min-w-[70px]"
              >
                ${bet}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Feedback Phase ──
  const multiplier = getMultiplier(question.tc)

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
        <span>{t('training.common.questionProgress', { n: qIndex + 1, total: session.length })}</span>
        <span>{t('training.common.correctOf', { n: totalCorrect, total: totalAttempts, pct: accuracy })}</span>
        <span>{t('training.common.streakOf', { n: currentStreak })}</span>
      </div>

      {/* Result card */}
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

        {/* Explanation */}
        <div className="bg-contrast/5 rounded-xl p-4 mb-4 space-y-2">
          {question.type === 'C' && !tcCorrect && (
            <p className="text-content/70 text-sm">
              <Trans
                i18nKey="training.bet.tcYouSaid"
                values={{
                  said: formatTC(tcAnswer),
                  right: formatTC(question.tc),
                  rc: formatTC(question.rc),
                  decks: question.remainingDecks,
                }}
                components={{ h: <span className="text-gold font-medium" /> }}
              />
            </p>
          )}
          <p className="text-content/70 text-sm" data-testid="feedback-explanation">
            <Trans
              i18nKey="training.bet.betExplain"
              values={{ tc: formatTC(question.tc), mult: multiplier, min: question.tableMin, bet: question.correctBet }}
              components={{ h: <span className="text-gold font-medium" /> }}
            />
            {selectedBet !== null && selectedBet !== question.correctBet && (
              <span className="text-error">{t('training.bet.youChoseBet', { bet: selectedBet })}</span>
            )}
          </p>
        </div>

        {/* Bet spread reference with highlight */}
        <div className="bg-contrast/5 rounded-xl p-3 mb-4">
          <p className="text-xs text-content/40 mb-2 text-center">{t('training.bet.spreadOf', { min: question.tableMin })}</p>
          <div className="space-y-0.5">
            {BET_SPREAD.map((row, i) => {
              const isHighlighted = Math.floor(question.tc) >= row.minTC && Math.floor(question.tc) <= row.maxTC
              return (
                <div key={i} className={`flex justify-between text-xs px-2 py-0.5 rounded ${
                  isHighlighted ? 'bg-gold/20 text-gold font-medium' : 'text-content/50'
                }`}>
                  <span>{row.label}</span>
                  <span>{t('training.betSpreadUnit', { mult: row.multiplier, amount: `$${row.multiplier * question.tableMin}` })}</span>
                </div>
              )
            })}
          </div>
        </div>

        <Button
          onClick={handleNext}
          data-testid="next-question"
          className="w-full"
        >
          {qIndex + 1 >= session.length ? t('training.common.seeResults') : t('training.common.next')}
        </Button>
      </div>
    </div>
  )
}
