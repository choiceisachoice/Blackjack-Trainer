import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeckEstimationDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'
import { activeLocale } from '../../i18n'
import { FlashNext } from './FlashPanel'
import { DeckTray } from './DeckTray'
import { DeckChoices } from './DeckChoices'
import { DeckAsk, DeckHistory, DeckProgress, DeckStats, DeckVerdict, type DeckAnswer } from './DeckPanel'
import { RoundSummary, type SummaryMiss } from './RoundSummary'
import { captureRound, type RoundCapture } from './round-capture'
import { DECK_TOLERANCE, deckOptions as getDeckOptions, formatDecks, generateRemainingCards } from './deck-estimation-model'

type DeckCount = 6 | 8
type AccuracyMode = 'half' | 'whole'
type Phase = 'settings' | 'question' | 'feedback' | 'summary'

/**
 * How many rounds a session runs.
 *
 * Same ladder as Bet Spread and Flashcards, and the same control — this was
 * the one mode where it was missing, so a normal session simply never ended.
 * Quick Fire used to carry its own fixed count of ten; it now adds only the
 * per-round clock, which is one rule fewer to remember and one less place for
 * the two paths to disagree.
 */
const ROUND_COUNTS = [10, 20, 30, 50]
const DEFAULT_ROUNDS = 20
const QUICK_FIRE_SECONDS = 3
/** A deck count in the reader's language; `fixed` keeps one decimal. */
function decks(n: number, fixed = false): string {
  return formatDecks(n, activeLocale(), fixed)
}

interface Stats {
  correct: number
  total: number
  totalError: number
  streak: number
  bestStreak: number
}

const INITIAL_STATS: Stats = { correct: 0, total: 0, totalError: 0, streak: 0, bestStreak: 0 }

/**
 * Deck Estimation training mode.
 *
 * Shows a visual shoe and the player must estimate how many decks remain.
 * Supports normal (untimed) and Quick Fire (3s per round) modes; a session
 * ends on the shared round summary (`RoundSummary`).
 */
export function DeckEstimation() {
  const { t } = useTranslation()
  const [deckCount, setDeckCount] = useState<DeckCount>(6)
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>('half')
  const [quickFire, setQuickFire] = useState(false)
  const [numRounds, setNumRounds] = useState(DEFAULT_ROUNDS)
  const [phase, setPhase] = useState<Phase>('settings')

  // Question state
  const [remainingCards, setRemainingCards] = useState(0)
  const [totalCards, setTotalCards] = useState(312)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [correctDecks, setCorrectDecks] = useState(0)
  const [isCorrect, setIsCorrect] = useState(false)

  // Stats
  const [stats, setStats] = useState<Stats>(INITIAL_STATS)
  /** Every answer of the session, for the trail and the list beside the tray. */
  const [answers, setAnswers] = useState<DeckAnswer[]>([])

  // Estimations tracking for session save
  const estimationsRef = useRef<{ actual: number; estimated: number | null; error: number }[]>([])

  // ── Session stats persistence ──
  const { statsRef, finish, begin } = useSessionSave('deckEstimation', (): DeckEstimationDetails => ({
    type: 'deckEstimation',
    deckCount,
    accuracyMode,
    quickFire,
    estimations: [...estimationsRef.current],
  }))

  /** What the summary compares the round against, taken as it ended. */
  const [capture, setCapture] = useState<RoundCapture | null>(null)

  /** Current round, 1-based. Counts in both modes now, not just Quick Fire. */
  const [round, setRound] = useState(0)

  // Quick Fire state
  const [qfTimer, setQfTimer] = useState(QUICK_FIRE_SECONDS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Mirrors qfTimer so the countdown can act on expiry outside the setState
  // updater (which React runs twice under StrictMode → double-counted timeouts).
  const qfTimerRef = useRef(QUICK_FIRE_SECONDS)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const generateQuestion = useCallback(() => {
    const total = deckCount * 52
    const remaining = generateRemainingCards(total)
    setTotalCards(total)
    setRemainingCards(remaining)
    setCorrectDecks(remaining / 52)
    setSelectedAnswer(null)
    setIsCorrect(false)
    setPhase('question')

    if (quickFire) {
      setQfTimer(QUICK_FIRE_SECONDS)
    }
  }, [deckCount, quickFire])

  const processAnswer = useCallback((answer: number | null) => {
    clearTimer()
    const actual = remainingCards / 52
    const error = answer !== null ? Math.abs(answer - actual) : actual
    const correct = answer !== null && error <= DECK_TOLERANCE

    if (correct) {
      soundEngine.correct()
    } else {
      soundEngine.wrong()
    }

    setSelectedAnswer(answer)
    setIsCorrect(correct)

    // Track estimation for session save
    estimationsRef.current.push({ actual, estimated: answer, error })
    setAnswers(prev => [...prev, { actual, estimated: answer, correct }])

    setStats(prev => {
      const newStreak = correct ? prev.streak + 1 : 0
      const newStats = {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        totalError: prev.totalError + error,
        streak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
      }

      // Sync stats ref for session save
      statsRef.current = {
        totalQuestions: newStats.total,
        correctAnswers: newStats.correct,
        bestStreak: newStats.bestStreak,
      }

      return newStats
    })

    setPhase('feedback')
  }, [remainingCards, clearTimer, statsRef])

  const handleAnswer = useCallback((decks: number) => {
    processAnswer(decks)
  }, [processAnswer])

  const handleNext = useCallback(() => {
    if (round >= numRounds) {
      soundEngine.sessionComplete()
      // Pay out here, not on unmount: the summary is the moment the player is
      // looking for the reward. The summary shows that reward itself, so the
      // XP toast for it stays quiet (`captureRound`).
      setCapture(captureRound(finish))
      setPhase('summary')
      return
    }
    generateQuestion()
    setRound(prev => prev + 1)
  }, [round, numRounds, generateQuestion, finish])

  const startTraining = useCallback(() => {
    begin()
    setCapture(null)
    // Not the previous session's: the list was never cleared, so every later
    // session's record contained all the estimates made before it.
    estimationsRef.current = []
    setAnswers([])
    setStats(INITIAL_STATS)
    setRound(1)
    generateQuestion()
  }, [generateQuestion, begin])

  // Quick Fire timer countdown
  useEffect(() => {
    if (phase !== 'question' || !quickFire) return
    clearTimer()

    qfTimerRef.current = qfTimer
    timerRef.current = setInterval(() => {
      const prev = qfTimerRef.current
      if (prev <= 1) {
        // Time's up — stop the clock and score outside the updater.
        clearTimer()
        qfTimerRef.current = 0
        setQfTimer(0)
        processAnswer(null)
        return
      }
      qfTimerRef.current = prev - 1
      setQfTimer(prev - 1)
    }, 1000)

    return clearTimer
    // qfTimer is intentionally read once at interval start (not a dep — it would
    // restart the countdown every tick).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, quickFire, clearTimer, processAnswer])

  // Keyboard: Enter → next in feedback. A focused button presses itself on
  // Enter; acting here as well would skip a round.
  useEffect(() => {
    if (phase !== 'feedback') return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (e.target instanceof Element && e.target.closest('button:not(:disabled)')) return
      handleNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleNext])

  const avgError = decks(stats.total > 0 ? stats.totalError / stats.total : 0, true)
  const deckOptions = getDeckOptions(deckCount, accuracyMode)
  const results = answers.map(a => a.correct)

  // ── Settings Phase ──
  if (phase === 'settings') {
    return (
      <div className="relative isolate overflow-hidden flex-1 flex flex-col items-center justify-center px-4">
        <TrainingBackdrop mode="deckEstimation" showRails />
        <Panel icon={Layers} title={t('training.deck.title')} subtitle={t('training.deck.sub')} className="w-full max-w-xl">
          {/* Deck Count */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.deck.decksInShoe')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.deck.decksInShoe')}
              value={deckCount}
              onChange={v => setDeckCount(v as DeckCount)}
              options={([6, 8] as DeckCount[]).map(d => ({ label: t('training.deck.nDecks', { n: d }), value: d }))}
            />
          </div>

          {/* Precision */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.deck.precision')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.deck.precision')}
              value={accuracyMode}
              onChange={setAccuracyMode}
              options={[
                { label: t('training.deck.halfDecks'), value: 'half' as AccuracyMode },
                { label: t('training.deck.wholeDecks'), value: 'whole' as AccuracyMode },
              ]}
            />
          </div>

          {/* Mode (custom pair to keep the quick-fire-toggle testid) */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.deck.mode')}</span>
            <div role="group" aria-label={t('training.deck.mode')} className="inline-flex w-full p-0.5 rounded-lg bg-contrast/5 border border-contrast/10">
              <button
                onClick={() => setQuickFire(false)}
                aria-pressed={!quickFire}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
                  ${!quickFire ? 'bg-gold text-on-gold shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
              >
                {t('training.deck.normal')}
              </button>
              <button
                onClick={() => setQuickFire(true)}
                data-testid="quick-fire-toggle"
                aria-pressed={quickFire}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
                  ${quickFire ? 'bg-gold text-on-gold shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
              >
                {t('training.deck.quickFire')}
              </button>
            </div>
            {quickFire && (
              <p className="text-xs text-warning mt-2">
                {t('training.deck.quickFireHint', { rounds: numRounds, secs: QUICK_FIRE_SECONDS })}
              </p>
            )}
          </div>

          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.common.questions')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.deck.numRoundsAria')}
              value={numRounds}
              onChange={setNumRounds}
              options={ROUND_COUNTS.map(n => ({ label: String(n), value: n }))}
            />
          </div>

          <Button size="lg" className="w-full mt-1" onClick={startTraining} data-testid="start-training">
            {t('training.flash.start')}
          </Button>
        </Panel>
      </div>
    )
  }

  // ── Summary Phase ──
  if (phase === 'summary') {
    // Worded as the verdict words it: what was left, what was said — or that
    // the clock ran out, where nothing was said.
    const misses: SummaryMiss[] = answers.flatMap((a, i) => a.correct ? [] : [{
      id: String(i),
      spot: t('training.deck.remaining', { n: decks(a.actual, true) }),
      chosen: a.estimated === null ? t('training.deck.timesUp') : decks(a.estimated),
      right: decks(a.actual, true),
    }])
    return (
      <RoundSummary
        mode="deckEstimation"
        score={{ correct: stats.correct, total: stats.total }}
        capture={capture}
        trail={results}
        figures={[
          { label: t('training.common.bestStreak'), value: stats.bestStreak },
          { label: t('training.deck.avgErrorTitle'), value: <span data-testid="avg-error">{t('training.deck.avgErrorValue', { v: avgError })}</span> },
        ]}
        misses={misses}
        onAgain={startTraining}
        onBack={() => setPhase('settings')}
      />
    )
  }

  // ── Question and feedback ──
  //
  // One grid, three shapes, as in Flashcards and the Speed Drill. Wide (lg):
  // the tray on the felt with the answers under it, a side panel on the right
  // with the round, the figures, the answers so far and — at its foot — the
  // question or the verdict. A phone: the round as a strip, the felt, the
  // question and the answers, which the verdict and the way on replace. A
  // phone held sideways (`short`): the felt on the left, the rest beside it.
  // The panel is `display: contents` below lg, so its parts are placed by
  // area name and each is drawn once at every size.
  const answered = phase === 'feedback'
  // On a phone the verdict and the way on take the place of the question and
  // the answers. The two are held to one height (the verdict's floor, the
  // question's top padding — measured at 360 and 390 px in both languages),
  // so the tray does not jump at the moment it is to be compared with the guess.
  // The answers run six to a row there, 50 px a row: fewer rows, more padding;
  // the question's line is held to the Quick Fire clock's height either way.
  const askPad = Math.max(0, 50 + (2 - Math.ceil(deckOptions.length / 6)) * 50)
  const areas = answered
    ? `grid-rows-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'prog'_'felt'_'verdict'_'next']
       max-lg:short:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-lg:short:grid-rows-[auto_minmax(0,1fr)_auto]
       max-lg:short:[grid-template-areas:'felt_prog'_'felt_verdict'_'felt_next']`
    : `grid-rows-[auto_minmax(0,1fr)_auto_auto] [grid-template-areas:'prog'_'felt'_'ask'_'acts']
       max-lg:short:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-lg:short:grid-rows-[auto_minmax(0,1fr)_auto]
       max-lg:short:[grid-template-areas:'felt_prog'_'felt_ask'_'felt_acts']`

  return (
    <div
      data-drill-run
      className="flex-1 min-h-0 flex flex-col px-3 sm:px-5 lg:px-8 pt-3 lg:pt-4 short:pt-2
        pb-[calc(0.75rem+var(--cookie-bar,0px))] lg:pb-[calc(1.5rem+var(--cookie-bar,0px))] short:pb-[calc(0.5rem+var(--cookie-bar,0px))]"
    >
      <div
        className={`mx-auto w-full max-w-[96rem] flex-1 min-h-0 grid gap-3 sm:gap-4 ${areas}
          max-lg:short:gap-x-4 max-lg:short:gap-y-2.5
          lg:grid-cols-[minmax(0,1fr)_clamp(20rem,26vw,26rem)] lg:grid-rows-[minmax(0,1fr)_auto]
          lg:[grid-template-areas:'felt_panel'_'acts_panel'] lg:gap-x-6 lg:gap-y-4`}
      >
        <section className="[grid-area:felt] min-h-0 min-w-0">
          <DeckTray
            remainingCards={remainingCards}
            totalCards={totalCards}
            answer={answered ? { guess: selectedAnswer, correct: isCorrect } : null}
            step={accuracyMode === 'half' ? 0.5 : 1}
          />
        </section>

        {/* The answers. On a phone the verdict takes their place once given;
            on a wide screen they stay, showing the band that would have counted. */}
        <DeckChoices
          options={deckOptions}
          onAnswer={handleAnswer}
          answered={answered ? { guess: selectedAnswer, actual: correctDecks } : null}
          className={`[grid-area:acts] min-w-0 self-end ${answered ? 'max-lg:hidden' : ''}`}
        />

        <aside className="contents lg:[grid-area:panel] lg:flex lg:flex-col lg:min-h-0 lg:gap-5 [@media(max-height:820px)]:lg:gap-4 lg:overflow-hidden surface lg:p-5 xl:p-6 [@media(max-height:820px)]:lg:py-4">
          <DeckProgress
            round={round}
            total={numRounds}
            results={results}
            streak={stats.streak}
            avgError={stats.total > 0 ? stats.totalError / stats.total : null}
            className="[grid-area:prog] shrink-0 max-lg:px-1"
          />
          <DeckStats
            results={results}
            avgError={stats.total > 0 ? stats.totalError / stats.total : null}
            bestStreak={stats.bestStreak}
            className="shrink-0 hidden lg:grid"
          />
          <DeckHistory
            answers={answered ? answers.slice(0, -1) : answers}
            className="hidden lg:flex lg:flex-1 lg:min-h-0"
          />
          {answered ? (
            <>
              <DeckVerdict
                actual={correctDecks}
                guess={selectedAnswer}
                correct={isCorrect}
                className="[grid-area:verdict] shrink-0 lg:mt-auto max-lg:px-1 max-lg:min-h-[132px] max-lg:short:min-h-0"
              />
              <FlashNext onNext={handleNext} last={round >= numRounds} className="[grid-area:next] shrink-0 max-lg:short:self-end" />
            </>
          ) : (
            <DeckAsk
              seconds={quickFire ? qfTimer : null}
              className="[grid-area:ask] shrink-0 lg:mt-auto max-lg:min-h-[calc(2.25rem+var(--ask-pad))] max-lg:pt-[var(--ask-pad)] max-lg:short:pt-0 max-lg:short:self-end"
              style={{ '--ask-pad': `${askPad}px` } as CSSProperties}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
