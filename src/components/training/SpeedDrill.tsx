import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shoe } from '../../engine/shoe/shoe'
import { CountingEngine } from '../../engine/counting/counting-engine'
import { getSystemById } from '../../engine/counting/counting-systems'
import { useAppStore } from '../../store/app-store'
import type { Card } from '../../engine/shoe/types'
import { Suit } from '../../engine/shoe/types'

type Phase = 'settings' | 'drill' | 'input' | 'result'

const CARD_COUNTS = [10, 20, 30, 52] as const
const SPEED_OPTIONS = [
  { label: 'Slow', ms: 2000 },
  { label: 'Normal', ms: 1000 },
  { label: 'Fast', ms: 500 },
  { label: 'Blitz', ms: 250 },
] as const

const SUIT_SYMBOL: Record<string, string> = {
  [Suit.Hearts]: '\u2665',
  [Suit.Diamonds]: '\u2666',
  [Suit.Clubs]: '\u2663',
  [Suit.Spades]: '\u2660',
}

/**
 * Speed Drill training mode.
 *
 * Flashes cards one at a time, then asks the player for the running count.
 * Tracks streaks and accuracy across attempts.
 */
export function SpeedDrill() {
  const selectedSystem = useAppStore(s => s.selectedSystem)
  const selectedRules = useAppStore(s => s.selectedRules)

  const [phase, setPhase] = useState<Phase>('settings')
  const [cardCount, setCardCount] = useState(20)
  const [speedMs, setSpeedMs] = useState(1000)

  // Drill state
  const [cards, setCards] = useState<Card[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [correctRC, setCorrectRC] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Input state
  const [userAnswer, setUserAnswer] = useState(0)

  // Result state
  const [isCorrect, setIsCorrect] = useState(false)

  // Session stats (persist across attempts)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)

  // Whether the counting system uses fractional values (Wong Halves)
  const systemConfig = getSystemById(selectedSystem)
  const isFractional = selectedSystem === 'WongHalves'

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startDrill = useCallback(() => {
    const shoe = new Shoe({ numDecks: selectedRules.numDecks, penetration: selectedRules.penetration })
    const engine = new CountingEngine(systemConfig, selectedRules.numDecks)

    const dealt: Card[] = []
    for (let i = 0; i < cardCount; i++) {
      const card = shoe.deal()
      dealt.push(card)
      engine.processCard(card)
    }

    setCards(dealt)
    setCorrectRC(engine.getRunningCount())
    setCurrentIndex(0)
    setUserAnswer(0)
    setPhase('drill')
  }, [cardCount, selectedRules, systemConfig])

  // Drill timer: advance cards
  useEffect(() => {
    if (phase !== 'drill') return

    timerRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= cards.length - 1) {
          stopTimer()
          setPhase('input')
          return prev
        }
        return prev + 1
      })
    }, speedMs)

    return stopTimer
  }, [phase, cards.length, speedMs, stopTimer])

  const handleSubmit = useCallback(() => {
    const tolerance = isFractional ? 0.5 : 0
    const correct = Math.abs(userAnswer - correctRC) <= tolerance
    setIsCorrect(correct)
    setTotalAttempts(prev => prev + 1)

    if (correct) {
      setTotalCorrect(prev => prev + 1)
      setStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      setStreak(0)
    }

    setPhase('result')
  }, [userAnswer, correctRC, isFractional])

  const handleAbort = useCallback(() => {
    stopTimer()
    setPhase('settings')
  }, [stopTimer])

  // Keyboard: Enter submits in input phase, Escape aborts drill
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'drill') handleAbort()
        return
      }
      if (phase === 'input' && e.key === 'Enter') {
        handleSubmit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleSubmit, handleAbort])

  // ── Settings Phase ──
  if (phase === 'settings') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        <h2 className="text-2xl font-bold text-white">Speed Drill</h2>

        {/* Card count */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Number of Cards</span>
          <div className="flex gap-2">
            {CARD_COUNTS.map(n => (
              <button
                key={n}
                onClick={() => setCardCount(n)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${cardCount === n
                    ? 'bg-gold text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Speed */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-sm text-white/50">Speed</span>
          <div className="flex gap-2">
            {SPEED_OPTIONS.map(s => (
              <button
                key={s.label}
                onClick={() => setSpeedMs(s.ms)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer
                  ${speedMs === s.ms
                    ? 'bg-gold text-black'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={startDrill}
          data-testid="start-drill"
          className="mt-4 px-8 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors text-lg cursor-pointer"
        >
          Start Drill
        </button>
      </div>
    )
  }

  // ── Drill Phase ──
  if (phase === 'drill') {
    const card = cards[currentIndex]
    const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds
    const progress = ((currentIndex + 1) / cards.length) * 100

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 bg-felt-dark">
        {/* Progress */}
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-xs text-white/50 mb-1">
            <span>Card {currentIndex + 1} / {cards.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Card Display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className={`w-[250px] h-[350px] rounded-2xl bg-white border-2 border-gray-300
              shadow-2xl flex flex-col justify-between p-4 ${isRed ? 'text-red-600' : 'text-gray-900'}`}
          >
            <div className="flex flex-col leading-none">
              <span className="text-4xl font-bold">{card.rank}</span>
              <span className="text-3xl">{SUIT_SYMBOL[card.suit]}</span>
            </div>
            <div className="flex items-center justify-center">
              <span className="text-7xl opacity-20">{SUIT_SYMBOL[card.suit]}</span>
            </div>
            <div className="flex flex-col items-end leading-none rotate-180">
              <span className="text-4xl font-bold">{card.rank}</span>
              <span className="text-3xl">{SUIT_SYMBOL[card.suit]}</span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Countdown bar */}
        <div className="w-[250px] h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            key={currentIndex}
            className="h-full bg-gold/70 rounded-full"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: speedMs / 1000, ease: 'linear' }}
          />
        </div>

        <button
          onClick={handleAbort}
          className="text-sm text-white/40 hover:text-white/70 transition-colors cursor-pointer"
        >
          Stop (ESC)
        </button>
      </div>
    )
  }

  // ── Input Phase ──
  if (phase === 'input') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <h2 className="text-xl font-bold text-white">What is the Running Count?</h2>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setUserAnswer(prev => prev - 1)}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-2xl
              text-white font-bold transition-colors cursor-pointer"
          >
            &minus;
          </button>
          <input
            type="number"
            value={userAnswer}
            onChange={(e) => setUserAnswer(Number(e.target.value) || 0)}
            data-testid="count-input"
            className="w-24 h-16 text-center text-3xl font-bold bg-white/10 border border-white/20
              rounded-xl text-white focus:outline-none focus:border-gold/60
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => setUserAnswer(prev => prev + 1)}
            className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-2xl
              text-white font-bold transition-colors cursor-pointer"
          >
            +
          </button>
        </div>

        {isFractional && (
          <p className="text-xs text-white/40">Wong Halves: answer accepted within &plusmn;0.5</p>
        )}

        <button
          onClick={handleSubmit}
          data-testid="submit-answer"
          className="px-8 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors cursor-pointer"
        >
          Submit
        </button>
      </div>
    )
  }

  // ── Result Phase ──
  const formatCount = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
      {/* Result banner */}
      <div className={`text-center ${isCorrect ? 'text-success' : 'text-error'}`}>
        <span className="text-5xl">{isCorrect ? '\u2705' : '\u274C'}</span>
        <h2 className="text-2xl font-bold mt-2">
          {isCorrect
            ? `Correct! RC = ${formatCount(correctRC)}`
            : `Wrong! RC = ${formatCount(correctRC)} (you said ${formatCount(userAnswer)})`}
        </h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="bg-white/5 rounded-lg px-4 py-3">
          <div className="text-xs text-white/50">Streak</div>
          <div className="text-xl font-bold text-white">{streak}</div>
        </div>
        <div className="bg-white/5 rounded-lg px-4 py-3">
          <div className="text-xs text-white/50">Best Streak</div>
          <div className="text-xl font-bold text-gold">{bestStreak}</div>
        </div>
        <div className="bg-white/5 rounded-lg px-4 py-3 col-span-2">
          <div className="text-xs text-white/50">Accuracy</div>
          <div className="text-xl font-bold text-white">
            {totalCorrect}/{totalAttempts} ({accuracy}%)
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={startDrill}
          data-testid="try-again"
          className="px-6 py-3 bg-gold text-black font-bold rounded-xl
            hover:bg-gold/90 transition-colors cursor-pointer"
        >
          Try Again
        </button>
        <button
          onClick={() => setPhase('settings')}
          className="px-6 py-3 bg-white/10 text-white font-medium rounded-xl
            hover:bg-white/20 transition-colors cursor-pointer"
        >
          Back to Menu
        </button>
      </div>
    </div>
  )
}
