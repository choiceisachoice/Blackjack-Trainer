import { useState, useEffect, useCallback, useRef } from 'react'
import { useGameStore } from '../../store/game-store'
import { useAppStore } from '../../store/app-store'
import { getSystemById, getCountValue } from '../../engine/counting/counting-systems'
import { GameTable } from '../table/GameTable'
import type { Card } from '../../engine/shoe/types'
import { Suit } from '../../engine/shoe/types'
import { CountingSystemId } from '../../engine/counting/types'

type Difficulty = 'easy' | 'normal' | 'hard'
type QueryType = 'rc' | 'tc' | 'both'
type TCPhase = 'settings' | 'playing'

const SUIT_SYMBOL: Record<string, string> = {
  [Suit.Hearts]: '\u2665',
  [Suit.Diamonds]: '\u2666',
  [Suit.Clubs]: '\u2663',
  [Suit.Spades]: '\u2660',
}

/**
 * Table Counting training mode.
 *
 * Wraps the existing GameTable and overlays a count prompt after each round.
 * Players play normal blackjack while mentally tracking the count.
 */
export function TableCounting() {
  const selectedSystem = useAppStore(s => s.selectedSystem)

  const [tcPhase, setTcPhase] = useState<TCPhase>('settings')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [queryType, setQueryType] = useState<QueryType>('rc')

  // Playing state
  const [showPrompt, setShowPrompt] = useState(false)
  const [rcAnswer, setRcAnswer] = useState(0)
  const [tcAnswer, setTcAnswer] = useState(0)
  const [feedback, setFeedback] = useState<{
    correct: boolean
    correctRC: number
    correctTC: number
    handCards: { card: Card; value: number }[]
  } | null>(null)

  // Session stats
  const [handsPlayed, setHandsPlayed] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)

  // Hard mode: ask every N hands (random 2-5)
  const [handsUntilPrompt, setHandsUntilPrompt] = useState(1)
  const handsSinceLastPrompt = useRef(0)

  // Track cards dealt in the current hand
  const prevCardsRef = useRef<Card[]>([])

  const isRoundOver = useGameStore(s => s.gameState?.isRoundOver ?? false)
  const gameState = useGameStore(s => s.gameState)
  const runningCount = useGameStore(s => s.runningCount)
  const trueCount = useGameStore(s => s.trueCount)
  const shoe = useGameStore(s => s.shoe)

  const systemConfig = getSystemById(selectedSystem)

  // Ensure count display is hidden when playing
  useEffect(() => {
    if (tcPhase === 'playing') {
      const store = useGameStore.getState()
      if (store.showCount) store.toggleCountDisplay()
    }
  }, [tcPhase])

  // Sync the counting system from app store into game store
  useEffect(() => {
    if (tcPhase === 'playing') {
      useGameStore.getState().setCountingSystem(selectedSystem)
    }
  }, [tcPhase, selectedSystem])

  // Collect all visible cards before round ends for error explanation
  useEffect(() => {
    if (gameState && !gameState.isRoundOver) {
      const allCards: Card[] = []
      for (const hand of gameState.playerHands) {
        allCards.push(...hand.cards)
      }
      allCards.push(...gameState.dealerHand.cards)
      prevCardsRef.current = allCards
    }
  }, [gameState])

  // Detect round settlement
  useEffect(() => {
    if (!isRoundOver || !gameState || tcPhase !== 'playing') return

    handsSinceLastPrompt.current++
    setHandsPlayed(prev => prev + 1)

    const shouldAsk = difficulty === 'hard'
      ? handsSinceLastPrompt.current >= handsUntilPrompt
      : true

    if (shouldAsk) {
      // Collect all cards from this settled round
      const allCards: Card[] = []
      for (const hand of gameState.playerHands) {
        allCards.push(...hand.cards)
      }
      allCards.push(...gameState.dealerHand.cards)

      prevCardsRef.current = allCards
      setRcAnswer(0)
      setTcAnswer(0)
      setFeedback(null)
      setShowPrompt(true)
      handsSinceLastPrompt.current = 0

      if (difficulty === 'hard') {
        setHandsUntilPrompt(Math.floor(Math.random() * 4) + 2) // 2-5
      }
    }
  }, [isRoundOver, gameState, tcPhase, difficulty, handsUntilPrompt])

  const handleSubmit = useCallback(() => {
    const isFractional = selectedSystem === CountingSystemId.WongHalves

    let isCorrectAnswer = true

    if (queryType === 'rc' || queryType === 'both') {
      const tolerance = isFractional ? 0.5 : 0
      if (Math.abs(rcAnswer - runningCount) > tolerance) {
        isCorrectAnswer = false
      }
    }

    if (queryType === 'tc' || queryType === 'both') {
      if (Math.abs(tcAnswer - trueCount) > 0.5) {
        isCorrectAnswer = false
      }
    }

    // Build hand cards with count values for explanation
    const handCards = prevCardsRef.current.map(card => ({
      card,
      value: getCountValue(card, systemConfig),
    }))

    setFeedback({
      correct: isCorrectAnswer,
      correctRC: runningCount,
      correctTC: trueCount,
      handCards,
    })

    if (isCorrectAnswer) {
      setCorrectCount(prev => prev + 1)
      setCurrentStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      setCurrentStreak(0)
    }
  }, [rcAnswer, tcAnswer, runningCount, trueCount, queryType, selectedSystem, systemConfig])

  const handleContinue = useCallback(() => {
    setShowPrompt(false)
    setFeedback(null)
  }, [])

  // Keyboard: Enter submits prompt
  useEffect(() => {
    if (!showPrompt) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (feedback) {
          handleContinue()
        } else {
          handleSubmit()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPrompt, feedback, handleSubmit, handleContinue])

  const formatCount = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
  const formatValue = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

  // ── Settings Phase ──
  if (tcPhase === 'settings') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <h2 className="text-2xl font-bold text-white">Table Counting</h2>

        {/* Difficulty */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Difficulty</span>
          <div className="flex gap-2">
            {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors cursor-pointer
                  ${difficulty === d
                    ? 'bg-gold text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40 max-w-sm text-center">
            {difficulty === 'easy' && 'Count asked every hand.'}
            {difficulty === 'normal' && 'Count asked every hand, no help.'}
            {difficulty === 'hard' && 'Count asked randomly every 2-5 hands.'}
          </p>
        </div>

        {/* Query type */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Ask for</span>
          <div className="flex gap-2">
            {([
              { value: 'rc' as QueryType, label: 'Running Count' },
              { value: 'tc' as QueryType, label: 'True Count' },
              { value: 'both' as QueryType, label: 'Both' },
            ]).map(q => (
              <button
                key={q.value}
                onClick={() => setQueryType(q.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${queryType === q.value
                    ? 'bg-gold text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setTcPhase('playing')}
          data-testid="start-playing"
          className="mt-4 px-8 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors text-lg cursor-pointer"
        >
          Start Playing
        </button>
      </div>
    )
  }

  // ── Playing Phase ──
  const accuracy = handsPlayed > 0 ? Math.round((correctCount / handsPlayed) * 100) : 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-black/40 text-xs text-white/50 shrink-0">
        <span>Hands: {handsPlayed}</span>
        <span>Correct: {correctCount}/{handsPlayed} ({accuracy}%)</span>
        <span>Streak: {currentStreak} (Best: {bestStreak})</span>
      </div>

      {/* GameTable fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <GameTable />
      </div>

      {/* Count Prompt Overlay */}
      {showPrompt && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-white/20 rounded-2xl p-6 max-w-md w-full mx-4">
            {!feedback ? (
              <>
                {/* Question */}
                {(queryType === 'rc' || queryType === 'both') && (
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-white text-center mb-3">
                      What is the Running Count?
                    </h3>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        onClick={() => setRcAnswer(prev => prev - 1)}
                        className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-xl
                          text-white font-bold transition-colors cursor-pointer"
                      >
                        &minus;
                      </button>
                      <input
                        type="number"
                        value={rcAnswer}
                        onChange={(e) => setRcAnswer(Number(e.target.value) || 0)}
                        data-testid="rc-input"
                        className="w-20 h-14 text-center text-2xl font-bold bg-white/10 border border-white/20
                          rounded-xl text-white focus:outline-none focus:border-gold/60
                          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => setRcAnswer(prev => prev + 1)}
                        className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-xl
                          text-white font-bold transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {(queryType === 'tc' || queryType === 'both') && (
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-white text-center mb-3">
                      What is the True Count?
                    </h3>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        onClick={() => setTcAnswer(prev => prev - 1)}
                        className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-xl
                          text-white font-bold transition-colors cursor-pointer"
                      >
                        &minus;
                      </button>
                      <input
                        type="number"
                        value={tcAnswer}
                        onChange={(e) => setTcAnswer(Number(e.target.value) || 0)}
                        data-testid="tc-input"
                        className="w-20 h-14 text-center text-2xl font-bold bg-white/10 border border-white/20
                          rounded-xl text-white focus:outline-none focus:border-gold/60
                          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        onClick={() => setTcAnswer(prev => prev + 1)}
                        className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-xl
                          text-white font-bold transition-colors cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  data-testid="submit-count"
                  className="w-full mt-2 px-6 py-3 bg-gold text-black font-bold rounded-xl
                    hover:bg-gold/90 transition-colors cursor-pointer"
                >
                  Submit
                </button>
              </>
            ) : (
              <>
                {/* Feedback */}
                <div className={`text-center mb-4 ${feedback.correct ? 'text-success' : 'text-error'}`}>
                  <span className="text-4xl">{feedback.correct ? '\u2705' : '\u274C'}</span>
                  <h3 className="text-xl font-bold mt-2">
                    {feedback.correct ? 'Correct!' : 'Wrong!'}
                  </h3>
                  <p className="text-sm mt-1 text-white/70">
                    RC: {formatCount(feedback.correctRC)}
                    {(queryType === 'tc' || queryType === 'both') && ` | TC: ${formatCount(feedback.correctTC)}`}
                  </p>
                </div>

                {/* Card breakdown on wrong answer */}
                {!feedback.correct && feedback.handCards.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-white/50 mb-2 text-center">Cards this hand:</p>
                    <div className="flex flex-wrap justify-center gap-1">
                      {feedback.handCards.map((item, i) => {
                        const isRed = item.card.suit === Suit.Hearts || item.card.suit === Suit.Diamonds
                        return (
                          <span
                            key={i}
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              isRed ? 'text-red-400' : 'text-white/80'
                            } bg-white/10`}
                          >
                            {item.card.rank}{SUIT_SYMBOL[item.card.suit]}
                            <span className="text-white/40">({formatValue(item.value)})</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleContinue}
                  data-testid="continue-playing"
                  className="w-full px-6 py-3 bg-gold text-black font-bold rounded-xl
                    hover:bg-gold/90 transition-colors cursor-pointer"
                >
                  Continue
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
