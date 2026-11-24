import { useState, useCallback, useEffect, useRef } from 'react'
import { GraduationCap, Target } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { Action } from '../../engine/rules/types'
import {
  buildFlashSession,
  buildFocusFlashSession,
  drillableDeviationNames,
  enabledActions,
  type FlashLevel,
  type FlashQuestion,
} from '../../engine/strategy/flashcards'
import { useTranslation } from 'react-i18next'
import { preloadCardImages } from '../cards/card-suits'
import { dealQuestionCards, handName, type QuestionCards } from './flash-scene'
import { chartRowFor } from './flash-teach'
import { FlashFelt } from './FlashFelt'
import { FlashActionPad } from './FlashActionPad'
import { ACTION_KEY, actionForKey, formatPercent } from './deviation-utils'
import { FlashChartRow, FlashHistory, FlashNext, FlashProgress, FlashSituation, FlashVerdict, type AnsweredHand } from './FlashPanel'
import { formatTC } from '../strategy-chart/chart-primitives'
import { RoundSummary, type SummaryMiss } from './RoundSummary'
import { captureRound, type RoundCapture } from './round-capture'
import { useAppStore } from '../../store/app-store'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeviationDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'
import { activeStage, stageIndex } from '../../services/curriculum'
import { useStatsStore } from '../../store/stats-store'
import { selectIsPro, useEntitlementStore } from '../../store/entitlement-store'

type Phase = 'settings' | 'question' | 'feedback' | 'summary'

const QUESTION_COUNTS = [10, 20, 30, 50]

const LEVEL_HELP: Record<FlashLevel, string> = {
  basic: 'training.flash.helpBasic',
  deviations: 'training.flash.helpDeviations',
  mixed: 'training.flash.helpMixed',
}

/**
 * The hands a focus session is about, in the order Analytics ranked them.
 * Null means the ordinary drill.
 */
function focusFromHandoff(names: string[] | null): string[] | null {
  if (!names) return null
  const drillable = drillableDeviationNames(names)
  return drillable.length > 0 ? drillable : null
}

/**
 * Flashcards trainer.
 *
 * Drills Basic Strategy across every meaningful hand, and — at higher levels —
 * count-based deviations. Finite sessions, no repeated questions in a row.
 *
 * ## The focus drill
 *
 * "Drill these hands" on the Analytics page arrives here with a list of
 * deviation names in the app store. Then every question is one of those
 * hands, in turn, until the person chooses to drill everything again. The
 * session is recorded and paid exactly like any other flashcards round — the
 * same `useSessionSave`, the same `perDeviation` tally — so the next visit to
 * Analytics shows whether the drilling worked. The hand-off is cleared when
 * this screen unmounts: it belongs to the click that made it, not to the mode.
 */
/**
 * The level the setup opens on: the one the learner's plan is asking for.
 *
 * It always opened on Basic Strategy. A learner on the Deviations stage
 * pressed "Start drilling" in the plan, pressed Start here, scored 100% three
 * times — and the plan still said 0 of 3, because those were basic-strategy
 * sessions and the stage counts only sessions with deviation questions.
 * Nothing told them why. From the Deviations stage on, deviations are the
 * default; before it, basic strategy still is. The choice stays theirs.
 */
function startingLevel(): FlashLevel {
  const stage = activeStage(useStatsStore.getState().sessions, selectIsPro(useEntitlementStore.getState()))
  return stage && stageIndex(stage) >= stageIndex('deviations') ? 'deviations' : 'basic'
}

export function DeviationTraining() {
  const { t, i18n } = useTranslation()
  const dealerHitsSoft17 = useAppStore(s => s.selectedRules.dealerHitsSoft17)

  const [level, setLevel] = useState<FlashLevel>(startingLevel)
  const [numQuestions, setNumQuestions] = useState(20)
  const [phase, setPhase] = useState<Phase>('settings')

  // Read once, on mount. Later changes to the store do not restart a drill.
  const [focus, setFocus] = useState<string[] | null>(() => focusFromHandoff(useAppStore.getState().flashFocus))
  useEffect(() => () => useAppStore.getState().setFlashFocus(null), [])
  const clearFocus = useCallback(() => {
    setFocus(null)
    useAppStore.getState().setFlashFocus(null)
  }, [])

  const [session, setSession] = useState<FlashQuestion[]>([])
  // The cards of every question, dealt once when the round starts, so a
  // re-render never re-deals the hand someone is looking at.
  const [hands, setHands] = useState<QuestionCards[]>([])
  const [qIndex, setQIndex] = useState(0)
  const question = session[qIndex] ?? null

  const [selectedAction, setSelectedAction] = useState<Action | null>(null)
  const [isCorrect, setIsCorrect] = useState(false)

  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  /** Every answer of the round, in order — the trail, the list of previous hands, the summary. */
  const [answers, setAnswers] = useState<AnsweredHand[]>([])
  const results = answers.map(a => a.correct)

  // The card faces are images; fetch them while the setup screen is read, so
  // the first hand is not dealt as white rectangles.
  useEffect(() => { preloadCardImages() }, [])

  // Per-deviation results accumulated across the session and saved on unmount,
  // so Analytics' weakest-hands panel and deviation stats reflect real answers.
  const perDeviationRef = useRef<Record<string, { correct: number; incorrect: number }>>({})

  const { statsRef, finish, begin } = useSessionSave('deviationFlashCards', (): DeviationDetails => ({
    type: 'deviationFlashCards',
    deviationSet: 'all',
    perDeviation: perDeviationRef.current,
  }))

  /** What the summary compares the round against, taken as it ended. */
  const [capture, setCapture] = useState<RoundCapture | null>(null)

  /** Deals a round; `hands` makes it a focus round on those deviation names. */
  const startSession = useCallback((hands: string[] | null = focus) => {
    begin()
    perDeviationRef.current = {}
    const questions = hands
      ? buildFocusFlashSession(hands, numQuestions, dealerHitsSoft17)
      : buildFlashSession(level, numQuestions, dealerHitsSoft17)
    setSession(questions)
    setHands(questions.map(q => dealQuestionCards(q)))
    setQIndex(0)
    setSelectedAction(null)
    setIsCorrect(false)
    setTotalCorrect(0)
    setTotalAttempts(0)
    setCurrentStreak(0)
    setBestStreak(0)
    setAnswers([])
    setCapture(null)
    setPhase('question')
  }, [focus, level, numQuestions, dealerHitsSoft17, begin])

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

    setAnswers(prev => [...prev, { question, chosen: action, correct }])
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
      // is looking for the reward. The summary shows that reward itself, so
      // the snapshot is taken (and the toast told) before the payout.
      setCapture(captureRound(finish))
      setPhase('summary')
      return
    }
    setQIndex(qIndex + 1)
    setSelectedAction(null)
    setIsCorrect(false)
    setPhase('question')
  }, [qIndex, session.length, finish])

  // Keyboard: the table's keys answer (H S D P R, and I for insurance);
  // Enter goes on once answered.
  useEffect(() => {
    if (phase !== 'question' && phase !== 'feedback') return
    const offered = question ? enabledActions(question) : null
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (phase === 'feedback') {
        // The Next button presses itself on Enter when it has the focus; a
        // second press from here would skip a question.
        const onNext = e.target instanceof Element && e.target.closest('[data-testid=next-question]')
        if (e.key === 'Enter' && !onNext) handleNext()
        return
      }
      const action = actionForKey(e.key)
      if (action && offered?.[action]) {
        e.preventDefault()
        handleAnswer(action)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, question, handleNext, handleAnswer])

  // ── Settings Phase ──
  if (phase === 'settings') {
    return (
      <div className="relative isolate overflow-hidden flex-1 flex flex-col items-center justify-center px-4">
        <TrainingBackdrop mode="deviationFlashCards" showRails railVariant={level === 'basic' ? 'flashBasic' : undefined} />
        <Panel
          icon={focus ? Target : GraduationCap}
          title={focus ? t('training.flash.focusTitle') : t('training.flash.title')}
          subtitle={focus ? t('training.flash.focusSub', { count: focus.length }) : t('training.flash.sub')}
          className="w-full max-w-xl"
        >
          {focus ? (
            /* The hands themselves, so the person sees what they are about to
               drill and can check it against what Analytics showed them. */
            <div data-testid="focus-hands">
              <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.flash.focusHands')}</span>
              <ul className="flex flex-wrap gap-2">
                {focus.map(name => (
                  <li key={name} className="px-3 py-1.5 rounded-lg bg-gold/10 border border-gold/25 text-sm font-semibold text-gold tabular-nums">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            /* Level */
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
          )}

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

          <Button size="lg" className="w-full mt-1" onClick={() => startSession()} data-testid="start-training">
            {focus ? t('analytics.drillTheseHands') : t('training.flash.start')}
          </Button>
          {focus && (
            <button
              onClick={clearFocus}
              data-testid="focus-clear"
              className="w-full text-sm text-content/50 hover:text-content transition-colors cursor-pointer"
            >
              {t('training.flash.focusClear')}
            </button>
          )}
        </Panel>
      </div>
    )
  }

  // ── Summary Phase ──
  if (phase === 'summary') {
    // For a focus round, the answer to the question the person came with:
    // did each of those hands get better? Same tally that Analytics reads.
    const perHand = focus
      ? focus.map(name => {
          const r = perDeviationRef.current[name] ?? { correct: 0, incorrect: 0 }
          const total = r.correct + r.incorrect
          return { name, correct: r.correct, total, pct: total > 0 ? Math.round((r.correct / total) * 100) : 0 }
        })
      : []
    const misses: SummaryMiss[] = answers.flatMap((a, i) => {
      if (a.correct) return []
      const name = handName(a.question)
      return [{
        id: String(i),
        spot: t('try.end.hand', { hand: t(name.key, name.values), dealer: a.question.dealer }),
        tag: a.question.trueCount !== null ? `TC ${formatTC(a.question.trueCount)}` : undefined,
        chosen: t(ACTION_KEY[a.chosen]),
        right: t(ACTION_KEY[a.question.correctAction]),
      }]
    })
    // "Drill these" exists only where the focus drill can deal them: count
    // deviations. A missed basic-strategy hand has no drill of its own.
    const missedDeviations = drillableDeviationNames(
      answers.filter(a => !a.correct && a.question.isDeviation && a.question.deviationName).map(a => a.question.deviationName as string),
    )
    return (
      <RoundSummary
        mode="deviationFlashCards"
        score={{ correct: totalCorrect, total: totalAttempts }}
        capture={capture}
        trail={results}
        figures={[{ label: t('training.common.bestStreak'), value: bestStreak }]}
        misses={misses}
        aside={focus ? (
          <div data-testid="focus-results">
            <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] uppercase text-content/50 mb-1.5">{t('training.flash.focusResults')}</span>
            <ul className="divide-y divide-contrast/8 rounded-xl border border-contrast/10 overflow-hidden">
              {perHand.map(h => (
                <li key={h.name} className="flex items-center justify-between px-3 py-2 text-sm tabular-nums">
                  <span className="font-semibold text-content">{h.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-content/50">{h.correct}/{h.total}</span>
                    <span className={`font-bold ${h.pct >= 80 ? 'text-success' : h.pct >= 50 ? 'text-gold' : 'text-error'}`}>{formatPercent(h.pct / 100, i18n.language)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : undefined}
        drill={missedDeviations.length > 0 ? {
          label: t('training.summary.drillMisses', { count: missedDeviations.length }),
          onDrill: () => {
            setFocus(missedDeviations)
            startSession(missedDeviations)
          },
        } : null}
        onAgain={() => startSession()}
        againLabel={focus ? t('training.flash.focusAgain') : undefined}
        againTestId={focus ? 'focus-again' : undefined}
        onBack={() => setPhase('settings')}
      />
    )
  }

  const cards = hands[qIndex]
  if (!question || !cards) return null
  const enabled = enabledActions(question)
  const answered = phase === 'feedback' && selectedAction !== null
  const chartRow = chartRowFor(question, dealerHitsSoft17)
  const prompt = t('training.flash.whatDoYouDo')

  // ── Question and feedback ──
  //
  // One grid, three shapes. Wide (lg): the felt and the answers on the left,
  // a side panel on the right with the round, the spot, the chart row and —
  // once answered — the verdict. A phone: the round as a strip, the felt, and
  // under it the answers, which the verdict takes the place of. A phone held
  // sideways (`short`): the felt on the left, everything else on the right.
  //
  // The side panel is `display: contents` below lg, so its parts become the
  // grid's own items there and are placed by area name; each thing is drawn
  // once at every size.
  return (
    // `data-drill-run`: on a phone held sideways the back bar gives its row to
    // the question (see `BackToMenu`).
    <div
      data-drill-run
      className="flex-1 min-h-0 flex flex-col px-3 sm:px-5 lg:px-8 pt-3 lg:pt-4 short:pt-2
        pb-[calc(0.75rem+var(--cookie-bar,0px))] lg:pb-[calc(1.5rem+var(--cookie-bar,0px))] short:pb-[calc(0.5rem+var(--cookie-bar,0px))]"
    >
      <div
        className={`mx-auto w-full max-w-[96rem] flex-1 min-h-0 grid ${answered ? 'gap-2.5 sm:gap-3' : 'gap-3 sm:gap-4'}
          ${answered
            ? `grid-rows-[auto_minmax(0,1fr)_auto_auto_auto] [grid-template-areas:'prog'_'felt'_'verdict'_'chart'_'next']
               max-lg:short:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] max-lg:short:grid-rows-[auto_minmax(0,1fr)_auto_auto]
               max-lg:short:[grid-template-areas:'felt_prog'_'felt_verdict'_'felt_chart'_'felt_next']`
            : `grid-rows-[auto_minmax(0,1fr)_auto] [grid-template-areas:'prog'_'felt'_'acts']
               max-lg:short:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] max-lg:short:grid-rows-[auto_auto_minmax(0,1fr)]
               max-lg:short:[grid-template-areas:'felt_prog'_'felt_spot'_'felt_acts']`}
          max-lg:short:gap-x-4 max-lg:short:gap-y-2
          lg:grid-cols-[minmax(0,1fr)_clamp(20rem,26vw,26rem)] lg:grid-rows-[minmax(0,1fr)_auto]
          lg:[grid-template-areas:'felt_panel'_'acts_panel'] lg:gap-x-6 lg:gap-y-5`}
      >
        <section className="[grid-area:felt] min-h-0 min-w-0">
          <FlashFelt question={question} cards={cards} deal={qIndex} verdict={answered ? isCorrect : null} />
        </section>

        {/* The answers. On a phone the verdict takes their place once given;
            on a wide screen they stay, marked right and wrong. */}
        <div className={`[grid-area:acts] min-w-0 flex flex-col justify-end gap-2 ${answered ? 'max-lg:hidden' : ''}`}>
          <p className="lg:hidden text-center text-sm font-semibold text-content/80">{prompt}</p>
          <FlashActionPad
            enabled={enabled}
            onAnswer={handleAnswer}
            answered={answered && selectedAction ? { chosen: selectedAction, correct: question.correctAction } : null}
          />
        </div>

        <aside className="contents lg:[grid-area:panel] lg:flex lg:flex-col lg:min-h-0 lg:gap-5 [@media(max-height:820px)]:lg:gap-3.5 lg:overflow-hidden surface lg:p-5 xl:p-6 [@media(max-height:820px)]:lg:py-4">
          <FlashProgress
            index={qIndex}
            total={session.length}
            results={results}
            streak={currentStreak}
            className="[grid-area:prog] shrink-0 max-lg:px-1"
          />
          <FlashSituation
            question={question}
            className={`[grid-area:spot] shrink-0 hidden lg:block ${answered ? '' : 'max-lg:short:block'}`}
          />
          {chartRow && (
            <FlashChartRow
              row={chartRow}
              revealed={answered}
              rules={dealerHitsSoft17 ? 'H17' : 'S17'}
              deviation={question.isDeviation}
              className={`[grid-area:chart] shrink-0 min-w-0 ${answered ? '' : 'hidden lg:block'}`}
            />
          )}
          {/* Wide screens only: the round so far, in the room beside the felt. */}
          <FlashHistory answers={answered ? answers.slice(0, -1) : answers} className={`hidden lg:flex lg:flex-1 lg:min-h-0 ${answered ? '[@media(max-height:820px)]:lg:hidden' : ''}`} />
          {answered && selectedAction ? (
            <>
              <FlashVerdict
                question={question}
                isCorrect={isCorrect}
                selected={selectedAction}
                className="[grid-area:verdict] shrink-0 lg:mt-auto"
              />
              <FlashNext onNext={handleNext} last={qIndex + 1 >= session.length} className="[grid-area:next] shrink-0 max-lg:short:self-end" />
            </>
          ) : (
            <p className="hidden lg:block shrink-0 text-xl font-bold text-content/90">{prompt}</p>
          )}
        </aside>
      </div>
    </div>
  )
}
