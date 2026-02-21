import { useState, useCallback, useEffect, useRef } from 'react'
import { ShoeVisual } from '../table/ShoeVisual'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { DeckEstimationDetails } from '../../services/stats-types'

type DeckCount = 2 | 6 | 8
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

    timerRef.current = setInterval(() => {
      setQfTimer(prev => {
        if (prev <= 1) {
          // Time's up
          processAnswer(null)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return clearTimer
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
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <h2 className="text-2xl font-bold text-content">Deck Estimation</h2>

        {/* Deck Count */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-content/50">Decks in Shoe</span>
          <div className="flex gap-2">
            {([2, 6, 8] as DeckCount[]).map(d => (
              <button
                key={d}
                onClick={() => setDeckCount(d)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${deckCount === d
                    ? 'bg-gold text-black'
                    : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
              >
                {d} Decks
              </button>
            ))}
          </div>
        </div>

        {/* Accuracy Mode */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-content/50">Precision</span>
          <div className="flex gap-2">
            <button
              onClick={() => setAccuracyMode('half')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${accuracyMode === 'half'
                  ? 'bg-gold text-black'
                  : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
            >
              Half Decks
            </button>
            <button
              onClick={() => setAccuracyMode('whole')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${accuracyMode === 'whole'
                  ? 'bg-gold text-black'
                  : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
            >
              Whole Decks
            </button>
          </div>
        </div>

        {/* Quick Fire Toggle */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-content/50">Mode</span>
          <div className="flex gap-2">
            <button
              onClick={() => setQuickFire(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${!quickFire
                  ? 'bg-gold text-black'
                  : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
            >
              Normal
            </button>
            <button
              onClick={() => setQuickFire(true)}
              data-testid="quick-fire-toggle"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                ${quickFire
                  ? 'bg-gold text-black'
                  : 'bg-contrast/10 text-content/70 hover:bg-contrast/20'}`}
            >
              Quick Fire
            </button>
          </div>
          {quickFire && (
            <p className="text-xs text-warning mt-1">
              {QUICK_FIRE_ROUNDS} rounds, {QUICK_FIRE_SECONDS}s each
            </p>
          )}
        </div>

        <button
          onClick={startTraining}
          data-testid="start-training"
          className="mt-4 px-8 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors text-lg cursor-pointer"
        >
          Start Training
        </button>
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
          <button
            onClick={() => setPhase('settings')}
            data-testid="back-to-settings"
            className="w-full px-6 py-3 bg-gold text-black font-bold rounded-xl
              hover:bg-gold/90 transition-colors cursor-pointer"
          >
            Back to Settings
          </button>
        </div>
      </div>
    )
  }

  // ── Question Phase ──
  if (phase === 'question') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
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

        {/* Large Shoe Visual */}
        <ShoeVisual
          remainingCards={remainingCards}
          totalCards={totalCards}
          size="large"
        />

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
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between w-full max-w-md px-4 py-1.5 bg-contrast/10 text-xs text-content/50 rounded-lg">
        <span>Correct: {stats.correct}/{stats.total} ({accuracy}%)</span>
        <span>Avg Error: &plusmn;{avgError} decks</span>
      </div>

      {/* Result card */}
      <div className="bg-casino-bg/95 border border-contrast/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className={`text-center mb-4 ${isCorrect ? 'text-success' : 'text-error'}`}>
          <span className="text-4xl">{isCorrect ? '\u2705' : '\u274C'}</span>
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

        {/* Visual shoe with answer comparison */}
        <div className="flex justify-center mb-4">
          <ShoeVisual
            remainingCards={remainingCards}
            totalCards={totalCards}
            size="normal"
          />
        </div>

        <button
          onClick={handleNext}
          data-testid="next-question"
          className="w-full px-6 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors cursor-pointer"
        >
          {quickFire && qfRound >= QUICK_FIRE_ROUNDS ? 'See Results' : 'Next'}
        </button>
      </div>
    </div>
  )
}
