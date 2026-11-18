import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, Check, X } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { DiscardTray } from '../table/ShoeProgress'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeckEstimationDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'
import { activeLocale } from '../../i18n'

type DeckCount = 6 | 8
type AccuracyMode = 'half' | 'whole'
type Phase = 'settings' | 'question' | 'feedback' | 'summary'

const TOLERANCE = 0.5
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
/** The large tray's scale on a wide screen, where there is room for it. */
const LARGE_PX_PER_CARD = 1.4
/** What `DiscardTray` draws under the tray: its base, the gap and the label. */
const DISCARD_FOOT_PX = 34

/**
 * A deck count the way the reader's language writes it — "1.5" in English,
 * "1,5" in German. `fixed` keeps one decimal on a measured value ("2.0").
 */
function decks(n: number, fixed = false): string {
  return n.toLocaleString(activeLocale(), {
    minimumFractionDigits: fixed ? 1 : 0,
    maximumFractionDigits: 1,
  })
}

/** Returns button options for deck selection. */
function getDeckOptions(maxDecks: number, mode: AccuracyMode): number[] {
  const step = mode === 'half' ? 0.5 : 1
  const start = mode === 'half' ? 0.5 : 1
  const options: number[] = []
  for (let d = start; d <= maxDecks; d += step) {
    options.push(d)
  }
  return options
}

/** Generates a weighted random remaining-cards value. */
function generateRemainingCards(totalCards: number): number {
  const u = Math.random()
  let fraction: number
  if (u < 0.7) {
    // 70%: 30–80% remaining (typical play positions)
    fraction = 0.3 + Math.random() * 0.5
  } else if (u < 0.85) {
    // 15%: 10–30%
    fraction = 0.1 + Math.random() * 0.2
  } else {
    // 15%: 80–95%
    fraction = 0.8 + Math.random() * 0.15
  }
  return Math.max(1, Math.round(fraction * totalCards))
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
 * The estimation scene — a realistic discard tray on a felt table surface.
 * The player estimates the decks remaining from the thickness of the played
 * (discarded) cards, exactly like a real counter watches the discard rack.
 * No deck graduation marks — estimating is the skill being trained.
 */
function DiscardScene({ remainingCards, totalCards, size }: {
  remainingCards: number
  totalCards: number
  size: 'large' | 'small'
}) {
  const { t } = useTranslation()
  const dealt = Math.max(0, totalCards - remainingCards)
  const numDecks = Math.round(totalCards / 52)
  const isLarge = size === 'large'

  return (
    <div
      data-testid="discard-visual"
      className={`relative rounded-2xl ${isLarge
        ? `flex-1 min-h-0 max-h-[580px] flex flex-col px-6 pt-3 pb-3.5 md:flex-none md:max-h-none md:block md:px-10 md:pt-5 md:pb-7
           short:flex-none short:max-h-none short:self-stretch short:min-h-0 short:flex short:flex-col short:px-8 short:pt-2 short:pb-3`
        : ''}`}
      style={{
        padding: isLarge ? undefined : '12px 24px 16px',
        // Same felt and wood as the casino table, read from the theme. The hex
        // here was `#12613a` and `#4a2f18` — the exact token values, retyped —
        // so this swap changes nothing on screen and removes the second copy
        // that would have drifted the next time the felt was tuned. The darker
        // stops derive from the token the way the table's do.
        background:
          'radial-gradient(ellipse 130% 100% at 50% 0%,' +
          ' var(--color-felt) 0%,' +
          ' color-mix(in srgb, var(--color-felt) 78%, black) 55%,' +
          ' color-mix(in srgb, var(--color-felt) 60%, black) 100%)',
        border: `${isLarge ? 10 : 6}px solid var(--color-wood)`,
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.35), 0 10px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className={`text-center ${isLarge ? 'mb-2 md:mb-3 short:mb-1 text-xs' : 'mb-3 text-[0.6875rem]'} tracking-widest uppercase text-white/45 font-semibold`}>
        {t('training.deckShoeTray', { n: numDecks })}
      </div>
      {/*
        Large: the height comes from the phone's free space, up to what a wide
        screen shows at its fixed scale. Both 6 and 8 decks fill the same space
        on a phone; the share of the tray that holds cards is what is trained.
        A phone held sideways (`short:`) is wide enough for the two-column
        layout and far too low for its fixed scale — the tray was 582px on a
        390px screen — so there the height comes from the free space again.
      */}
      <div
        className={isLarge ? 'flex-1 min-h-0 flex justify-center md:h-[var(--tray-height)] md:flex-none short:h-auto short:flex-1 short:min-h-0' : 'flex justify-center'}
        style={isLarge ? { '--tray-height': `${Math.round(totalCards * LARGE_PX_PER_CARD) + 8 + DISCARD_FOOT_PX}px` } as CSSProperties : undefined}
      >
        <DiscardTray
          cardCount={dealt}
          totalCards={totalCards}
          showTicks={false}
          pxPerCard={0.5}
          width={isLarge ? 200 : 90}
          fill={isLarge}
        />
      </div>
    </div>
  )
}

/**
 * Deck Estimation training mode.
 *
 * Shows a visual shoe and the player must estimate how many decks remain.
 * Supports normal (untimed) and Quick Fire (3s per round, 10 rounds) modes.
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
    const correct = answer !== null && error <= TOLERANCE

    if (correct) {
      soundEngine.correct()
    } else {
      soundEngine.wrong()
    }

    setSelectedAnswer(answer)
    setIsCorrect(correct)

    // Track estimation for session save
    estimationsRef.current.push({ actual, estimated: answer, error })

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
      // looking for the reward.
      finish()
      setPhase('summary')
      return
    }
    generateQuestion()
    setRound(prev => prev + 1)
  }, [round, numRounds, generateQuestion, finish])

  const startTraining = useCallback(() => {
    begin()
    // Not the previous session's: the list was never cleared, so every later
    // session's record contained all the estimates made before it.
    estimationsRef.current = []
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

  // Keyboard: Enter → next in feedback
  useEffect(() => {
    if (phase !== 'feedback') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleNext])

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
  const avgError = decks(stats.total > 0 ? stats.totalError / stats.total : 0, true)
  const deckOptions = getDeckOptions(deckCount, accuracyMode)

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

  // ── Quick Fire Summary ──
  if (phase === 'summary') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <div className="bg-casino-bg/95 border border-contrast/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
          <h3 className="text-xl font-bold text-gold text-center mb-4" data-testid="summary-title">
            {t(quickFire ? 'training.deck.quickFireComplete' : 'training.common.sessionComplete')}
          </h3>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between">
              <span className="text-content/60">{t('training.deck.correctLabel')}</span>
              <span className="text-content font-bold">{stats.correct}/{stats.total} ({(accuracy / 100).toLocaleString(activeLocale(), { style: 'percent', maximumFractionDigits: 0 })})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content/60">{t('training.deck.avgErrorLabel')}</span>
              <span className="text-content font-bold" data-testid="avg-error">{t('training.deck.avgErrorValue', { v: avgError })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content/60">{t('training.deck.bestStreakLabel')}</span>
              <span className="text-content font-bold">{stats.bestStreak}</span>
            </div>
          </div>
          <Button onClick={() => setPhase('settings')} data-testid="back-to-settings" className="w-full">
            {t('training.common.backToSettings')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Question Phase ──
  if (phase === 'question') {
    return (
      <div data-drill-run className="flex-1 overflow-y-auto flex flex-col items-center gap-3 px-4 py-3 md:gap-6 md:py-6 short:gap-2 short:py-2">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
          <span>{t('training.common.correctOf', { n: stats.correct, total: stats.total, pct: accuracy })}</span>
          <span>
            {/* The round counter is the honest one now that every session has an
                end. The streak still matters, so it keeps the untimed mode. */}
            {quickFire
              ? t('training.deck.round', { n: round, total: numRounds })
              : t('training.deck.streakBest', { n: stats.streak, best: stats.bestStreak })}
          </span>
        </div>

        {/* Quick Fire timer */}
        {quickFire && (
          <div className="text-center">
            <span
              data-testid="qf-timer"
              className={`text-3xl font-bold ${qfTimer <= 1 ? 'text-error' : 'text-gold'}`}
            >
              {qfTimer}
            </span>
          </div>
        )}

        {/*
          The tray and the answers have to be on screen together. In Quick Fire
          there are three seconds to answer, and the buttons used to sit below
          the fold — the player looked at the tray, scrolled, and lost the round
          to the scrollbar. On a wide screen the two sit side by side; on a
          narrow one the tray takes the height the answers leave. Only below
          its floor does the page scroll, and the answer row then sticks to
          the bottom of the scroll box to stay in reach. A phone on its side
          (`short:`) gets the side-by-side layout with the tray fitted to the
          height that is left, and the back bar's row on top (`data-drill-run`).
        */}
        <div className="w-full flex-1 max-w-4xl flex flex-col items-center gap-3 md:flex-none md:grid md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10
          short:flex-1 short:min-h-0 short:grid short:grid-cols-[auto_minmax(0,1fr)] short:grid-rows-[minmax(0,1fr)] short:items-center short:gap-6">
          <div className="w-full flex-1 min-h-[220px] flex flex-col items-center justify-center md:contents short:contents">
            <DiscardScene remainingCards={remainingCards} totalCards={totalCards} size="large" />
          </div>

          <div
            className="w-full flex flex-col items-center gap-2 md:gap-4
              sticky bottom-0 z-10 py-2 -mb-3 bg-casino-bg/90 backdrop-blur-sm
              md:static md:py-0 md:mb-0 md:bg-transparent md:backdrop-blur-none
              short:static short:py-0 short:mb-0 short:bg-transparent short:backdrop-blur-none"
          >
            <p className="text-content font-medium text-center">{t('training.deck.howMany')}</p>

            {/* Deck option buttons */}
            {/* Six to a row on a phone, so half decks of a 6-deck shoe take two rows. */}
            <div className="w-full flex flex-wrap gap-1.5 justify-center max-w-lg md:w-auto md:gap-2">
              {deckOptions.map(d => (
                <button
                  key={d}
                  onClick={() => handleAnswer(d)}
                  data-testid={`deck-${d}`}
                  className="basis-[calc((100%-1.875rem)/6)] py-2.5 bg-contrast/10 hover:bg-contrast/20 text-content font-medium
                    rounded-xl transition-colors cursor-pointer text-sm
                    md:basis-auto md:px-4 md:min-w-[56px] short:basis-auto short:px-4 short:min-w-[56px]"
                >
                  {decks(d)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Feedback Phase ──
  const errorDecks = selectedAnswer !== null ? Math.abs(selectedAnswer - correctDecks) : correctDecks
  const closeEnough = isCorrect && selectedAnswer !== null && Math.abs(selectedAnswer - correctDecks) > 0.01

  return (
    <div data-drill-run className="flex-1 overflow-y-auto flex flex-col items-center gap-3 px-4 py-3 md:gap-6 md:py-6 short:gap-2 short:py-2">
      {/* Stats bar */}
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
        <span>{t('training.common.correctOf', { n: stats.correct, total: stats.total, pct: accuracy })}</span>
        <span>{t('training.deck.avgErrorInline', { v: avgError })}</span>
      </div>

      {/* Result card */}
      {/* Sideways phone: verdict, explanation and the way on left, the tray
          recap beside them at 70% — stacked they were 570px on a 390px screen. */}
      <div className="bg-casino-bg/95 border border-contrast/20 rounded-2xl p-4 md:p-6 max-w-md w-full shadow-2xl
        short:max-w-2xl short:p-3 short:grid short:grid-cols-[minmax(0,1fr)_auto] short:items-center short:gap-x-6">
        <div className="contents short:block">
        <div className={`flex flex-col items-center text-center mb-4 short:mb-2 short:flex-row short:justify-center short:gap-3 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className={`grid place-items-center w-12 h-12 short:w-9 short:h-9 rounded-full border
            ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'}`}>
            {isCorrect ? <Check size={24} /> : <X size={24} />}
          </span>
          <h3 className="text-xl font-bold mt-2 short:mt-0" data-testid="feedback-result">
            {isCorrect
              ? (closeEnough ? t('training.deck.closeEnough') : t('training.common.correctBang'))
              : (selectedAnswer === null ? t('training.deck.timesUp') : t('training.common.wrongBang'))}
          </h3>
        </div>

        {/* Explanation */}
        <div className="bg-contrast/5 rounded-xl p-4 mb-4 short:p-3 short:mb-3 space-y-2">
          <p className="text-content/70 text-sm" data-testid="feedback-explanation">
            {t('training.deck.remaining', { n: decks(correctDecks, true) })}
            {selectedAnswer !== null && t('training.deck.youSaid', { v: decks(selectedAnswer) })}
          </p>
          {!isCorrect && selectedAnswer !== null && (
            <p className="text-content/50 text-xs">
              {t('training.deck.offBy', { v: decks(errorDecks, true) })}
            </p>
          )}
        </div>

        {/* The way on comes before the recap. Under the tray it sat at
            y 675–717 on a 640px screen: every round of a session ended in a
            scroll to reach the one button there is. */}
        <Button onClick={handleNext} data-testid="next-question" className="w-full">
          {round >= numRounds ? t('training.common.seeResults') : t('training.common.next')}
        </Button>
        </div>

        {/* Discard tray recap */}
        <div className="flex justify-center mt-4 short:mt-0 short:[zoom:0.7]">
          <DiscardScene remainingCards={remainingCards} totalCards={totalCards} size="small" />
        </div>
      </div>
    </div>
  )
}
