import { useState, useCallback, useEffect, useRef } from 'react'
import { calculateTrueCount } from '../../engine/counting/counting-engine'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { BetSpreadDetails } from '../../services/stats-types'

type QuestionType = 'A' | 'B' | 'C'
type QuestionMode = 'A' | 'B' | 'C' | 'random'
type Phase = 'settings' | 'question' | 'feedback'

/** Bet spread table: TC → multiplier. */
const BET_SPREAD: { minTC: number; maxTC: number; multiplier: number; label: string }[] = [
  { minTC: -Infinity, maxTC: 0, multiplier: 1, label: 'TC \u2264 0' },
  { minTC: 1, maxTC: 1, multiplier: 2, label: 'TC +1' },
  { minTC: 2, maxTC: 2, multiplier: 4, label: 'TC +2' },
  { minTC: 3, maxTC: 3, multiplier: 8, label: 'TC +3' },
  { minTC: 4, maxTC: 4, multiplier: 12, label: 'TC +4' },
  { minTC: 5, maxTC: Infinity, multiplier: 16, label: 'TC \u2265 +5' },
]

const MIN_BET = 10
const BET_OPTIONS = [10, 20, 40, 80, 120, 160]

const REMAINING_DECKS_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

/** Returns the correct multiplier for a given TC (floors to integer for bracket lookup). */
function getMultiplier(tc: number): number {
  const intTC = Math.floor(tc)
  for (const row of BET_SPREAD) {
    if (intTC >= row.minTC && intTC <= row.maxTC) return row.multiplier
  }
  return 1
}

/** Returns the correct bet for a given TC. */
function getCorrectBet(tc: number): number {
  return getMultiplier(tc) * MIN_BET
}

/** Format TC as "+N" or "N". */
function formatTC(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/** Generates a weighted random RC. Extreme values are rarer. */
function generateRC(): number {
  // Gaussian-ish distribution centered near 0, range -10 to +15
  const u1 = Math.random()
  const u2 = Math.random()
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const rc = Math.round(normal * 4 + 2) // slightly positive bias
  return Math.max(-10, Math.min(15, rc))
}

/** Picks a random question type. */
function pickQuestionType(mode: QuestionMode): QuestionType {
  if (mode === 'random') {
    const types: QuestionType[] = ['A', 'B', 'C']
    return types[Math.floor(Math.random() * types.length)]
  }
  return mode
}

interface QuestionState {
  type: QuestionType
  rc: number
  remainingDecks: number
  tc: number
  correctBet: number
}

/**
 * Bet Spread training mode.
 *
 * Teaches players to adjust bets based on the True Count.
 * Three question types: A (RC+decks), B (TC only), C (TC+bet).
 */
export function BetSpread() {
  const [questionMode, setQuestionMode] = useState<QuestionMode>('random')
  const [phase, setPhase] = useState<Phase>('settings')

  // Question state
  const [question, setQuestion] = useState<QuestionState | null>(null)
  const [tcAnswer, setTcAnswer] = useState(0)
  const [selectedBet, setSelectedBet] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState(false)
  const [tcCorrect, setTcCorrect] = useState(true)

  // Stats
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  // TC and bet accuracy tracking for session save
  const tcCorrectRef = useRef(0)
  const tcTotalRef = useRef(0)
  const betCorrectRef = useRef(0)
  const betTotalRef = useRef(0)

  // ── Session stats persistence ──
  const { statsRef } = useSessionSave('betSpread', (): BetSpreadDetails => ({
    type: 'betSpread',
    questionMode,
    tcCorrect: tcCorrectRef.current,
    tcTotal: tcTotalRef.current,
    betCorrect: betCorrectRef.current,
    betTotal: betTotalRef.current,
  }))

  const generateQuestion = useCallback(() => {
    const type = pickQuestionType(questionMode)
    const rc = generateRC()
    const remainingDecks = REMAINING_DECKS_OPTIONS[Math.floor(Math.random() * REMAINING_DECKS_OPTIONS.length)]
    const tc = calculateTrueCount(rc, remainingDecks)
    const correctBet = getCorrectBet(tc)

    setQuestion({ type, rc, remainingDecks, tc, correctBet })
    setTcAnswer(0)
    setSelectedBet(null)
    setIsCorrect(false)
    setTcCorrect(true)
    setPhase('question')
  }, [questionMode])

  const handleSubmitBet = useCallback((bet: number) => {
    if (!question) return

    const betOk = bet === question.correctBet
    let correct = betOk
    let tcOk = true

    // Track bet accuracy
    betTotalRef.current++
    if (betOk) betCorrectRef.current++

    // For type C, also check TC answer
    if (question.type === 'C') {
      tcOk = tcAnswer === question.tc
      tcTotalRef.current++
      if (tcOk) tcCorrectRef.current++
      correct = correct && tcOk
    }

    setSelectedBet(bet)
    setIsCorrect(correct)
    setTcCorrect(tcOk)
    setTotalAttempts(prev => prev + 1)

    if (correct) {
      soundEngine.correct()
      setTotalCorrect(prev => prev + 1)
      setCurrentStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      soundEngine.wrong()
      setCurrentStreak(0)
    }

    // Sync stats ref for session save
    const newAttempts = totalAttempts + 1
    const newCorrect = totalCorrect + (correct ? 1 : 0)
    const newBestStreak = correct
      ? Math.max(bestStreak, currentStreak + 1)
      : bestStreak
    statsRef.current = {
      totalQuestions: newAttempts,
      correctAnswers: newCorrect,
      bestStreak: newBestStreak,
    }

    setPhase('feedback')
  }, [question, tcAnswer, totalAttempts, totalCorrect, bestStreak, currentStreak, statsRef])

  // Keyboard: Enter → next in feedback
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
        <h2 className="text-2xl font-bold text-white">Bet Spread</h2>

        {/* Bet Spread Table */}
        <div className="bg-white/5 rounded-xl p-4 max-w-sm w-full">
          <p className="text-xs text-white/50 mb-3 text-center">Bet Spread Reference</p>
          <div className="space-y-1">
            {BET_SPREAD.map((row, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-white/70">{row.label}</span>
                <span className="text-gold font-medium">{row.multiplier}x (${row.multiplier * MIN_BET})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Type */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Question Type</span>
          <div className="flex gap-2 flex-wrap justify-center">
            {([
              { value: 'random' as QuestionMode, label: 'Random', desc: 'Mix of all types' },
              { value: 'A' as QuestionMode, label: 'Type A', desc: 'RC + Decks → Bet' },
              { value: 'B' as QuestionMode, label: 'Type B', desc: 'TC → Bet' },
              { value: 'C' as QuestionMode, label: 'Type C', desc: 'RC + Decks → TC + Bet' },
            ]).map(q => (
              <button
                key={q.value}
                onClick={() => setQuestionMode(q.value)}
                title={q.desc}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${questionMode === q.value
                    ? 'bg-gold text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40">
            {questionMode === 'random' && 'Mix of all question types'}
            {questionMode === 'A' && 'Given RC and remaining decks, choose the optimal bet'}
            {questionMode === 'B' && 'Given True Count, choose the optimal bet'}
            {questionMode === 'C' && 'Given RC and remaining decks, enter TC and choose bet'}
          </p>
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
            {/* Type A & C: show RC and remaining decks */}
            {(question.type === 'A' || question.type === 'C') && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-white/60 text-sm">Running Count:</span>
                  <span className="text-white font-bold text-lg" data-testid="running-count">
                    {formatTC(question.rc)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60 text-sm">Remaining Decks:</span>
                  <span className="text-white font-bold text-lg" data-testid="remaining-decks">
                    ~{question.remainingDecks}
                  </span>
                </div>
              </>
            )}

            {/* Type B: show TC directly */}
            {question.type === 'B' && (
              <div className="flex justify-between items-center">
                <span className="text-white/60 text-sm">True Count:</span>
                <span className="text-gold font-bold text-lg" data-testid="true-count">
                  {formatTC(question.tc)}
                </span>
              </div>
            )}
          </div>

          {/* Type C: TC input field */}
          {question.type === 'C' && (
            <div className="mb-6">
              <p className="text-white/70 text-sm mb-2 text-center">What is the True Count?</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setTcAnswer(prev => prev - 0.5)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-lg
                    text-white font-bold transition-colors cursor-pointer"
                >
                  &minus;
                </button>
                <input
                  type="number"
                  step="0.5"
                  value={tcAnswer}
                  onChange={(e) => setTcAnswer(Number(e.target.value) || 0)}
                  data-testid="tc-input"
                  className="w-20 h-12 text-center text-xl font-bold bg-white/10 border border-white/20
                    rounded-xl text-white focus:outline-none focus:border-gold/60
                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => setTcAnswer(prev => prev + 0.5)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-lg
                    text-white font-bold transition-colors cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <p className="text-white font-medium text-center mb-4">What is your optimal bet?</p>

          <div className="flex flex-wrap gap-2 justify-center">
            {BET_OPTIONS.map(bet => (
              <button
                key={bet}
                onClick={() => handleSubmitBet(bet)}
                data-testid={`bet-${bet}`}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium
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
          {question.type === 'C' && !tcCorrect && (
            <p className="text-white/70 text-sm">
              TC: You said {formatTC(tcAnswer)}, correct was{' '}
              <span className="text-gold font-medium">{formatTC(question.tc)}</span>
              {' '}(RC {formatTC(question.rc)} / {question.remainingDecks} decks)
            </p>
          )}
          <p className="text-white/70 text-sm" data-testid="feedback-explanation">
            TC {formatTC(question.tc)} → {multiplier}x bet (${question.correctBet})
            {selectedBet && selectedBet !== question.correctBet && (
              <span className="text-error"> — you chose ${selectedBet}</span>
            )}
          </p>
        </div>

        {/* Bet spread reference with highlight */}
        <div className="bg-white/5 rounded-xl p-3 mb-4">
          <p className="text-xs text-white/40 mb-2 text-center">Bet Spread</p>
          <div className="space-y-0.5">
            {BET_SPREAD.map((row, i) => {
              const isHighlighted = question.tc >= row.minTC && question.tc <= row.maxTC
              return (
                <div key={i} className={`flex justify-between text-xs px-2 py-0.5 rounded ${
                  isHighlighted ? 'bg-gold/20 text-gold font-medium' : 'text-white/50'
                }`}>
                  <span>{row.label}</span>
                  <span>{row.multiplier}x (${row.multiplier * MIN_BET})</span>
                </div>
              )
            })}
          </div>
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
