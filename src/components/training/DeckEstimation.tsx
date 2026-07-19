import { useState, useCallback, useEffect, useRef } from 'react'
import { Layers, Check, X } from 'lucide-react'
import { Panel, Segmented, Button } from '../common/ui'
import { DiscardTray } from '../table/ShoeProgress'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeckEstimationDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'

type DeckCount = 6 | 8
type AccuracyMode = 'half' | 'whole'
type Phase = 'settings' | 'question' | 'feedback' | 'summary'

const TOLERANCE = 0.5
const QUICK_FIRE_ROUNDS = 10
const QUICK_FIRE_SECONDS = 3

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
  const dealt = Math.max(0, totalCards - remainingCards)
  const numDecks = Math.round(totalCards / 52)
  const isLarge = size === 'large'

  return (
    <div
      data-testid="discard-visual"
      className="relative rounded-2xl"
      style={{
        padding: isLarge ? '20px 40px 28px' : '12px 24px 16px',
        background: 'radial-gradient(ellipse 130% 100% at 50% 0%, #12613a 0%, #0c4a2d 55%, #083a24 100%)',
        border: `${isLarge ? 10 : 6}px solid #4a2f18`,
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.35), 0 10px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className={`text-center mb-3 ${isLarge ? 'text-xs' : 'text-[0.6875rem]'} tracking-widest uppercase text-white/45 font-semibold`}>
        {numDecks}-Deck Shoe · Discard Tray
      </div>
      <div className="flex justify-center">
        <DiscardTray
          cardCount={dealt}
          totalCards={totalCards}
          showTicks={false}
          pxPerCard={isLarge ? 1.4 : 0.5}
          width={isLarge ? 200 : 90}
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
  const [deckCount, setDeckCount] = useState<DeckCount>(6)
  const [accuracyMode, setAccuracyMode] = useState<AccuracyMode>('half')
  const [quickFire, setQuickFire] = useState(false)
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
  const { statsRef } = useSessionSave('deckEstimation', (): DeckEstimationDetails => ({
    type: 'deckEstimation',
    deckCount,
    accuracyMode,
    quickFire,
    estimations: [...estimationsRef.current],
  }))

  // Quick Fire state
  const [qfRound, setQfRound] = useState(0)
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
    if (quickFire && qfRound >= QUICK_FIRE_ROUNDS) {
      soundEngine.sessionComplete()
      setPhase('summary')
      return
    }
    generateQuestion()
    if (quickFire) {
      setQfRound(prev => prev + 1)
    }
  }, [quickFire, qfRound, generateQuestion])

  const startTraining = useCallback(() => {
    setStats(INITIAL_STATS)
    setQfRound(1)
    generateQuestion()
  }, [generateQuestion])

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
  const avgError = stats.total > 0 ? (stats.totalError / stats.total).toFixed(1) : '0.0'
  const deckOptions = getDeckOptions(deckCount, accuracyMode)

  // ── Settings Phase ──
  if (phase === 'settings') {
    return (
      <div className="relative isolate overflow-hidden flex-1 flex flex-col items-center justify-center px-4">
        <TrainingBackdrop mode="deckEstimation" showRails />
        <Panel icon={Layers} title="Deck Estimation" subtitle="Estimate the decks remaining in the shoe." className="w-full max-w-xl">
          {/* Deck Count */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">Decks in Shoe</span>
            <Segmented
              fluid
              ariaLabel="Decks in shoe"
              value={deckCount}
              onChange={v => setDeckCount(v as DeckCount)}
              options={([6, 8] as DeckCount[]).map(d => ({ label: `${d} Decks`, value: d }))}
            />
          </div>

          {/* Precision */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">Precision</span>
            <Segmented
              fluid
              ariaLabel="Precision"
              value={accuracyMode}
              onChange={setAccuracyMode}
              options={[
                { label: 'Half Decks', value: 'half' as AccuracyMode },
                { label: 'Whole Decks', value: 'whole' as AccuracyMode },
              ]}
            />
          </div>

          {/* Mode (custom pair to keep the quick-fire-toggle testid) */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">Mode</span>
            <div role="group" aria-label="Mode" className="inline-flex w-full p-0.5 rounded-lg bg-contrast/5 border border-contrast/10">
              <button
                onClick={() => setQuickFire(false)}
                aria-pressed={!quickFire}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
                  ${!quickFire ? 'bg-gold text-black shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
              >
                Normal
              </button>
              <button
                onClick={() => setQuickFire(true)}
                data-testid="quick-fire-toggle"
                aria-pressed={quickFire}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
                  ${quickFire ? 'bg-gold text-black shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
              >
                Quick Fire
              </button>
            </div>
            {quickFire && (
              <p className="text-xs text-warning mt-2">
                {QUICK_FIRE_ROUNDS} rounds, {QUICK_FIRE_SECONDS}s each
              </p>
            )}
          </div>

          <Button size="lg" className="w-full mt-1" onClick={startTraining} data-testid="start-training">
            Start Training
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
            Quick Fire Complete!
          </h3>
          <div className="space-y-3 mb-6">
            <div className="flex justify-between">
              <span className="text-content/60">Correct:</span>
              <span className="text-content font-bold">{stats.correct}/{stats.total} ({accuracy}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content/60">Avg Error:</span>
              <span className="text-content font-bold" data-testid="avg-error">&plusmn;{avgError} decks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content/60">Best Streak:</span>
              <span className="text-content font-bold">{stats.bestStreak}</span>
            </div>
          </div>
          <Button onClick={() => setPhase('settings')} data-testid="back-to-settings" className="w-full">
            Back to Settings
          </Button>
        </div>
      </div>
    )
  }

  // ── Question Phase ──
  if (phase === 'question') {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col items-center gap-6 px-4 py-6">
        {/* Stats bar */}
        <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
          <span>Correct: {stats.correct}/{stats.total} ({accuracy}%)</span>
          <span>
            {quickFire
              ? `Round ${qfRound}/${QUICK_FIRE_ROUNDS}`
              : `Streak: ${stats.streak} (Best: ${stats.bestStreak})`}
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

        {/* Realistic discard tray on felt — estimate the decks played */}
        <DiscardScene remainingCards={remainingCards} totalCards={totalCards} size="large" />

        <p className="text-content font-medium text-center">How many decks remain?</p>

        {/* Deck option buttons */}
        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
          {deckOptions.map(d => (
            <button
              key={d}
              onClick={() => handleAnswer(d)}
              data-testid={`deck-${d}`}
              className="px-4 py-2.5 bg-contrast/10 hover:bg-contrast/20 text-content font-medium
                rounded-xl transition-colors cursor-pointer text-sm min-w-[56px]"
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Feedback Phase ──
  const errorDecks = selectedAnswer !== null ? Math.abs(selectedAnswer - correctDecks) : correctDecks
  const closeEnough = isCorrect && selectedAnswer !== null && Math.abs(selectedAnswer - correctDecks) > 0.01

  return (
    <div className="flex-1 overflow-y-auto flex flex-col items-center gap-6 px-4 py-6">
      {/* Stats bar */}
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
        <span>Correct: {stats.correct}/{stats.total} ({accuracy}%)</span>
        <span>Avg Error: &plusmn;{avgError} decks</span>
      </div>

      {/* Result card */}
      <div className="bg-casino-bg/95 border border-contrast/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className={`flex flex-col items-center text-center mb-4 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className={`grid place-items-center w-12 h-12 rounded-full border
            ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-error/10 border-error/30'}`}>
            {isCorrect ? <Check size={24} /> : <X size={24} />}
          </span>
          <h3 className="text-xl font-bold mt-2" data-testid="feedback-result">
            {isCorrect
              ? (closeEnough ? 'Close enough!' : 'Correct!')
              : (selectedAnswer === null ? 'Time\'s up!' : 'Wrong!')}
          </h3>
        </div>

        {/* Explanation */}
        <div className="bg-contrast/5 rounded-xl p-4 mb-4 space-y-2">
          <p className="text-content/70 text-sm" data-testid="feedback-explanation">
            ~{correctDecks.toFixed(1)} decks remaining
            {selectedAnswer !== null && ` (you said ${selectedAnswer})`}
          </p>
          {!isCorrect && selectedAnswer !== null && (
            <p className="text-content/50 text-xs">
              Off by {errorDecks.toFixed(1)} decks
            </p>
          )}
        </div>

        {/* Discard tray recap */}
        <div className="flex justify-center mb-4">
          <DiscardScene remainingCards={remainingCards} totalCards={totalCards} size="small" />
        </div>

        <Button onClick={handleNext} data-testid="next-question" className="w-full">
          {quickFire && qfRound >= QUICK_FIRE_ROUNDS ? 'See Results' : 'Next'}
        </Button>
      </div>
    </div>
  )
}
