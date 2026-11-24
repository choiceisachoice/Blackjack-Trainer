import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { calculateTrueCount } from '../../engine/counting/counting-engine'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { BetSpreadDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'
import { BET_SPREAD, rand, getCorrectBet, buildBracketSequence } from './bet-spread-math'
import { BET_CAP, chipForKey, money, signed, type BetAnswer, type BetQuestion, type BetQuestionType } from './bet-model'
import { BetFelt } from './BetFelt'
import { BetHistory, BetKeys, BetRamp, BetSpot } from './BetPanel'
import { FlashProgress } from './FlashPanel'
import { RoundSummary, type SummaryMiss } from './RoundSummary'
import { captureRound, type RoundCapture } from './round-capture'

type QuestionType = BetQuestionType
type QuestionMode = 'A' | 'B' | 'C' | 'random'
type Phase = 'settings' | 'question' | 'feedback' | 'summary'

/** Realistic table minimums (the "unit"). Varies per question for realism. */
const TABLE_MINIMUMS = [5, 10, 15, 25, 50, 100]

const REMAINING_DECKS_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const QUESTION_COUNTS = [10, 20, 30, 50]

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rand() * arr.length)] }

type Question = BetQuestion

/**
 * Picks a representative integer TC inside a bracket (adds variety).
 *
 * The bottom bracket includes +1 on purpose: "the count is positive, so I
 * raise" is the mistake this ramp exists to train out.
 */
function pickTargetTC(bracketIdx: number): number {
  const step = BET_SPREAD[bracketIdx]
  if (step.minTC === -Infinity) return pick([-1, 0, 1])
  if (step.maxTC === Infinity) return pick([step.minTC, step.minTC + 1, step.minTC + 2])
  return step.minTC
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
  // The shoe on the felt: the question's decks, or — with the true count
  // given — any level, since the drawing then tells nothing the question does not.
  const shoeDecks = type === 'B' ? pick(REMAINING_DECKS_OPTIONS) : remainingDecks

  return { type, tableMin, rc, remainingDecks, shoeDecks, tc, correctBet: getCorrectBet(tc, tableMin) }
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
 * Realistic scenarios: each question is asked at a table — a different table
 * minimum each time, the shoe and the discard tray on the felt — and the
 * player puts the bet down in chips, as at the casino table. Sessions are a
 * fixed length with no repeated questions, then end on the shared round
 * summary (`RoundSummary`): the score against the best, what the round earned
 * and the bets that were wrong with the right ones.
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

  // Answer state: the true count entered (type C) and the chips placed, in order.
  const [tcAnswer, setTcAnswer] = useState(0)
  const [placed, setPlaced] = useState<number[]>([])
  const bet = placed.reduce((sum, c) => sum + c, 0)
  /** Every answer of the round, in order — the trail, the list of previous bets, the feedback. */
  const [answers, setAnswers] = useState<BetAnswer[]>([])

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

  /** What the summary compares the round against, taken as it ended. */
  const [capture, setCapture] = useState<RoundCapture | null>(null)

  const startSession = useCallback(() => {
    begin()
    setCapture(null)
    setSession(buildSession(questionMode, numQuestions))
    setQIndex(0)
    setTcAnswer(0)
    setPlaced([])
    setAnswers([])
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
    if (!question || phase !== 'question') return

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

    setAnswers(prev => [...prev, { question, bet, tcAnswer: question.type === 'C' ? tcAnswer : null, correct }])

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
  }, [question, phase, tcAnswer, totalAttempts, totalCorrect, bestStreak, currentStreak, statsRef])

  const handleNext = useCallback(() => {
    if (qIndex + 1 >= session.length) {
      soundEngine.sessionComplete()
      // Pay out at the summary, not on unmount — this is the moment the player
      // is looking for the reward. The summary shows that reward itself, so
      // the XP toast for it stays quiet (`captureRound`).
      setCapture(captureRound(finish))
      setPhase('summary')
      return
    }
    setQIndex(qIndex + 1)
    setTcAnswer(0)
    setPlaced([])
    setPhase('question')
  }, [qIndex, session.length, finish])

  // ── Building the bet ──
  const addChip = useCallback((value: number) => {
    if (!question) return
    setPlaced(prev => {
      const total = prev.reduce((sum, c) => sum + c, 0)
      return total + value > BET_CAP ? prev : [...prev, value]
    })
    soundEngine.chipPlace()
  }, [question])
  const undoChip = useCallback(() => setPlaced(prev => prev.slice(0, -1)), [])
  const clearBet = useCallback(() => setPlaced([]), [])
  const placeBet = useCallback(() => {
    if (bet > 0) handleSubmitBet(bet)
  }, [bet, handleSubmitBet])

  // Keyboard: 1–5 put a chip down (smallest to largest), Backspace takes the
  // last one back, Escape clears, Enter places the bet; once answered, Enter
  // goes on. Typing in the true-count field keeps its own digits and
  // Backspace; Enter from there places the bet like anywhere else.
  useEffect(() => {
    if (phase !== 'question' && phase !== 'feedback') return
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target instanceof Element ? e.target : null
      if (phase === 'feedback') {
        // The Next button presses itself on Enter when it has the focus; a
        // second press from here would skip a question.
        if (e.key === 'Enter' && !target?.closest('[data-testid=next-question]')) handleNext()
        return
      }
      if (e.key === 'Enter') {
        // A focused chip or button presses itself; only the bet is placed here.
        if (target?.closest('button')) return
        e.preventDefault()
        placeBet()
        return
      }
      if (target?.closest('input, textarea')) return
      const chip = chipForKey(e.key)
      if (chip !== null) { e.preventDefault(); addChip(chip); return }
      if (e.key === 'Backspace') { e.preventDefault(); undoChip(); return }
      if (e.key === 'Escape') clearBet()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleNext, placeBet, addChip, undoChip, clearBet])

  // ── Settings Phase ──
  if (phase === 'settings') {
    // The tallest setup screen of the drills (the ladder plus two choices):
    // 683px against 595px at 2000×720, and the shell does not scroll for this
    // mode. Centred with `justify-center` inside `overflow-hidden`, the panel
    // was cut at both ends — the title under the back bar, the start button
    // 19px below the screen, no way to reach either. The backdrop stays on the
    // frame (`overflow-hidden`, so the big suits do not spill); the panel
    // scrolls in its own box, and `my-auto` centres it while it fits without
    // pushing its top out of reach when it does not.
    return (
      <div className="relative isolate overflow-hidden flex-1 min-h-0 flex flex-col">
        <TrainingBackdrop mode="betSpread" showRails />
        <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-4 py-4" data-testid="bet-settings-scroller">
        <Panel icon={Coins} title={t('training.bet.title')} subtitle={t('training.bet.sub')} className="w-full max-w-xl my-auto">
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
      </div>
    )
  }

  // ── Summary Phase ──
  if (phase === 'summary') {
    // The spot is worded as in the panel's "previous bets". A wrong bet shows
    // the bet and the right one; a right bet on a wrong true count (type C)
    // shows the two true counts, since the bet is not what went wrong.
    const misses: SummaryMiss[] = answers.flatMap((a, i) => {
      if (a.correct) return []
      const spot = t('training.bet.historySpot', { tc: signed(a.question.tc), min: money(a.question.tableMin) })
      const betWrong = a.bet !== a.question.correctBet
      return [{
        id: String(i),
        spot,
        chosen: betWrong ? money(a.bet) : a.tcAnswer !== null ? `TC ${signed(a.tcAnswer)}` : undefined,
        right: betWrong ? money(a.question.correctBet) : `TC ${signed(a.question.tc)}`,
      }]
    })
    return (
      <RoundSummary
        mode="betSpread"
        score={{ correct: totalCorrect, total: totalAttempts }}
        capture={capture}
        trail={answers.map(a => a.correct)}
        figures={[{ label: t('training.common.bestStreak'), value: bestStreak }]}
        misses={misses}
        onAgain={startSession}
        onBack={() => setPhase('settings')}
      />
    )
  }

  if (!question) return null
  const answered = phase === 'feedback' && answers.length > 0 ? answers[answers.length - 1] : null
  const results = answers.map(a => a.correct)

  // ── Question and feedback ──
  //
  // One grid, as in Flashcards and the Speed Drill. Wide (lg): the felt left,
  // a side panel right with the round, the spot, the ramp and the bets so far.
  // Below lg the round is a strip above the felt and the felt carries the
  // rest; once answered, a phone held upright gets the ramp under the felt.
  // The panel is `display: contents` below lg, so its parts are placed by
  // area name and each is drawn once at every size.
  return (
    // `data-drill-run`: on a phone held sideways the back bar gives its row to
    // the question (see `BackToMenu`).
    <div
      data-drill-run
      className="flex-1 min-h-0 flex flex-col px-3 sm:px-5 lg:px-8 pt-3 lg:pt-4 short:pt-2
        pb-[calc(0.75rem+var(--cookie-bar,0px))] lg:pb-[calc(1.5rem+var(--cookie-bar,0px))] short:pb-[calc(0.5rem+var(--cookie-bar,0px))]"
    >
      <div
        className={`mx-auto w-full max-w-[96rem] flex-1 min-h-0 grid gap-3 sm:gap-4
          ${answered
            ? `grid-rows-[auto_minmax(0,1fr)_auto] [grid-template-areas:'prog'_'felt'_'ramp']
               max-lg:short:grid-rows-[auto_minmax(0,1fr)] max-lg:short:[grid-template-areas:'prog'_'felt']`
            : `grid-rows-[auto_minmax(0,1fr)] [grid-template-areas:'prog'_'felt']`}
          max-lg:short:gap-y-1.5
          lg:grid-cols-[minmax(0,1fr)_clamp(20rem,26vw,26rem)] lg:grid-rows-[minmax(0,1fr)]
          lg:[grid-template-areas:'felt_panel'] lg:gap-x-6`}
      >
        <section className="[grid-area:felt] min-h-0 min-w-0">
          <BetFelt
            key={qIndex}
            question={question}
            bet={bet}
            placed={placed}
            onChip={addChip}
            onUndo={undoChip}
            onClear={clearBet}
            onPlace={placeBet}
            tcAnswer={tcAnswer}
            onTcAnswer={setTcAnswer}
            answer={answered}
            onNext={handleNext}
            last={qIndex + 1 >= session.length}
          />
        </section>

        <aside className="contents lg:[grid-area:panel] lg:flex lg:flex-col lg:min-h-0 lg:gap-5 [@media(max-height:820px)]:lg:gap-3.5 lg:overflow-hidden surface lg:p-5 xl:p-6 [@media(max-height:820px)]:lg:py-4">
          <FlashProgress
            index={qIndex}
            total={session.length}
            results={results}
            streak={currentStreak}
            className="[grid-area:prog] shrink-0 max-lg:px-1"
          />
          <BetSpot question={question} className="shrink-0 hidden lg:block" />
          <BetRamp
            question={question}
            placed={answered ? answered.bet : null}
            className={`[grid-area:ramp] shrink-0 min-w-0 ${answered ? 'max-lg:short:hidden compact:hidden' : 'hidden lg:block'}`}
          />
          <BetHistory answers={answered ? answers.slice(0, -1) : answers} className="hidden lg:flex lg:flex-1 lg:min-h-0" />
          <BetKeys className="hidden lg:block shrink-0" />
        </aside>
      </div>
    </div>
  )
}
