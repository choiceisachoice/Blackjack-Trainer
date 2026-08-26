import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Zap, Play, Check, X, RotateCcw, Minus, Plus } from 'lucide-react'
import { Shoe } from '../../engine/shoe/shoe'
import { CountingEngine } from '../../engine/counting/counting-engine'
import { getSystemById } from '../../engine/counting/counting-systems'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useIsPro } from '../../store/entitlement-store'
import { CURRICULUM, stageIndex, deriveStageProgress, getReadStages } from '../../services/curriculum'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { Card } from '../../engine/shoe/types'
import { Suit } from '../../engine/shoe/types'
import type { SpeedDrillDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'

type Phase = 'settings' | 'drill' | 'input' | 'result'

const CARD_COUNTS = [10, 20, 30, 52] as const
const SPEED_OPTIONS = [
  { labelKey: 'training.speed.slow', ms: 2000 },
  { labelKey: 'training.speed.normal', ms: 1000 },
  { labelKey: 'training.speed.fast', ms: 500 },
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
/**
 * The three Hi-Lo values, on the screen that asks you to use them.
 *
 * Nothing in this drill named them. Grep for the tags across the whole file
 * returned zero hits: cards flashed, a number was demanded, and the rule
 * producing that number appeared nowhere in the pre-drill path. A beginner
 * routed here could only guess, score 0%, and conclude the app was not for
 * them.
 *
 * Collapses to a one-line reminder once the counting stage is done — by then it
 * is clutter, not teaching. The expanded default is for the person who needs
 * it; the collapsed state is for everyone who does not.
 */
function HiLoPrimer() {
  const { t } = useTranslation()
  const sessions = useStatsStore(s => s.sessions)
  const isPro = useIsPro()
  const learned = useMemo(() => {
    const stage = CURRICULUM[stageIndex('hi-lo')]
    return deriveStageProgress(stage, sessions, getReadStages(), isPro).done
  }, [sessions, isPro])

  const [open, setOpen] = useState(!learned)

  const GROUPS = [
    { cards: '2 3 4 5 6', value: '+1', tone: 'text-success', note: t('training.primer.lowCards') },
    { cards: '7 8 9', value: '0', tone: 'text-content/50', note: t('training.primer.neutral') },
    { cards: '10 J Q K A', value: '−1', tone: 'text-error', note: t('training.primer.tensAces') },
  ]

  return (
    <div className="mb-6 rounded-xl border border-gold/25 bg-gold/[.04] overflow-hidden" data-testid="hilo-primer">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer text-left"
      >
        <span className="text-sm font-semibold text-gold">{t('training.primer.title')}</span>
        <span className="text-xs text-content/45">{open ? t('training.common.hide') : t('training.common.show')}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            {GROUPS.map(g => (
              <div key={g.value} className="flex items-center justify-between gap-4 text-sm">
                <span className="font-mono tracking-wider text-content/80">{g.cards}</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-xs text-content/40">{g.note}</span>
                  <b className={`tabular-nums font-bold ${g.tone}`}>{g.value}</b>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-content/50 leading-relaxed">
            {t('training.primer.body')}
          </p>
        </div>
      )}
    </div>
  )
}

export function SpeedDrill() {
  const { t } = useTranslation()
  const selectedSystem = useAppStore(s => s.selectedSystem)
  const selectedRules = useAppStore(s => s.selectedRules)

  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('settings')
  const [cardCount, setCardCount] = useState(20)
  const [speedMs, setSpeedMs] = useState(1000)

  // Drill state
  const [cards, setCards] = useState<Card[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [correctRC, setCorrectRC] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Mirrors currentIndex so the drill interval can read it without doing side
  // effects inside a setState updater (which React runs twice under StrictMode).
  const currentIndexRef = useRef(0)
  /**
   * When the drill's interval was created, on the same clock the countdown reads.
   *
   * The interval fires on a fixed schedule from this instant, so the moment any
   * given card runs out is *knowable* — `start + (index + 1) * speedMs` — rather
   * than something a second, independent animation has to approximate.
   */
  const drillStartedAt = useRef(0)
  const countdownRef = useRef<HTMLDivElement | null>(null)

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

  // ── Session stats persistence ──
  const rcErrorsRef = useRef<number[]>([])
  const { statsRef, finish, begin } = useSessionSave('speedDrill', (): SpeedDrillDetails => ({
    type: 'speedDrill',
    cardsPerRound: cardCount,
    speedMs,
    rcErrors: [...rcErrorsRef.current],
  }))

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startDrill = useCallback(() => {
    begin()
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
  }, [cardCount, selectedRules, systemConfig, begin])

  // Drill timer: advance cards
  // Only play card sounds at slow (2s) and normal (1s) speeds — fast/blitz is too rapid
  const playCardSound = speedMs >= 1000
  useEffect(() => {
    if (phase !== 'drill') return

    if (playCardSound) soundEngine.cardDeal()
    currentIndexRef.current = 0
    drillStartedAt.current = performance.now()
    timerRef.current = setInterval(() => {
      // Side effects live here, not inside the setState updater.
      const prev = currentIndexRef.current
      if (prev >= cards.length - 1) {
        stopTimer()
        setPhase('input')
        return
      }
      currentIndexRef.current = prev + 1
      setCurrentIndex(prev + 1)
      if (playCardSound) soundEngine.cardDeal()
    }, speedMs)

    return stopTimer
  }, [phase, cards.length, speedMs, stopTimer, playCardSound])

  /**
   * The countdown, driven off the interval's own schedule.
   *
   * It used to be a separate animation with a matching duration — two clocks for
   * one fact, throttled by different rules, so the bar could not be relied on to
   * empty when the card actually changed. And when frames stall an animation
   * simply stops reporting: the bar sat at "a full second left" over a card that
   * had already gone, which is worse than showing nothing.
   *
   * Reading `dueAt - now` means the bar cannot disagree with the interval by
   * more than a frame, and a stall leaves it stale for exactly as long as the
   * frames are stalled instead of lying indefinitely.
   *
   * Written straight to the node rather than through state: this runs every
   * frame for the whole drill, and re-rendering the card that many times a
   * second to move one bar would be the wrong trade — the same reason the
   * loading screen writes its own transforms.
   *
   * Declared after the interval effect on purpose, so `drillStartedAt` is set
   * before the first frame reads it.
   */
  useEffect(() => {
    if (phase !== 'drill') return
    let raf = 0
    const frame = (now: number) => {
      const dueAt = drillStartedAt.current + (currentIndexRef.current + 1) * speedMs
      const left = (dueAt - now) / speedMs
      if (countdownRef.current) {
        countdownRef.current.style.transform = `scaleX(${left < 0 ? 0 : left > 1 ? 1 : left})`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phase, speedMs])

  const handleSubmit = useCallback(() => {
    const tolerance = isFractional ? 0.5 : 0
    const error = Math.abs(userAnswer - correctRC)
    const correct = error <= tolerance
    setIsCorrect(correct)
    setTotalAttempts(prev => prev + 1)

    // Track RC error for session save
    rcErrorsRef.current.push(error)

    if (correct) {
      soundEngine.correct()
      setTotalCorrect(prev => prev + 1)
      setStreak(prev => {
        const next = prev + 1
        setBestStreak(best => Math.max(best, next))
        return next
      })
    } else {
      soundEngine.wrong()
      setStreak(0)
    }

    // Sync stats ref for session save
    statsRef.current = {
      totalQuestions: totalAttempts + 1,
      correctAnswers: totalCorrect + (correct ? 1 : 0),
      bestStreak: correct ? Math.max(bestStreak, streak + 1) : bestStreak,
    }

    setPhase('result')
  }, [userAnswer, correctRC, isFractional, totalAttempts, totalCorrect, bestStreak, streak, statsRef])

  /**
   * Leaving the drill ends the session.
   *
   * Speed Drill has no summary screen — `'result'` is the score of ONE shoe and
   * the player may run another, so the attempts accumulate until they step out.
   * That step is the session boundary, and it is where the payout belongs.
   */
  const handleAbort = useCallback(() => {
    stopTimer()
    finish()
    setPhase('settings')
  }, [stopTimer, finish])

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
      <div className="relative isolate overflow-hidden flex-1 flex flex-col items-center justify-center px-4">
        <TrainingBackdrop mode="speedDrill" showRails />
        <div className="surface w-full max-w-xl p-7 md:p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-7">
            <span className="grid place-items-center w-11 h-11 rounded-xl text-gold bg-gold/10 border border-gold/20">
              <Zap size={22} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-content">{t('training.speed.title')}</h2>
              <p className="text-sm text-content/50">{t('training.speed.sub')}</p>
            </div>
          </div>

          <HiLoPrimer />

          {/* Card count */}
          <div className="mb-5">
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.speed.numberOfCards')}</span>
            <div className="inline-flex w-full p-0.5 rounded-lg bg-contrast/5 border border-contrast/10">
              {CARD_COUNTS.map(n => (
                <button
                  key={n}
                  onClick={() => setCardCount(n)}
                  aria-pressed={cardCount === n}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all cursor-pointer
                    ${cardCount === n ? 'bg-gold text-black shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Speed */}
          <div className="mb-7">
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.speed.speed')}</span>
            <div className="inline-flex w-full p-0.5 rounded-lg bg-contrast/5 border border-contrast/10">
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s.labelKey}
                  onClick={() => setSpeedMs(s.ms)}
                  aria-pressed={speedMs === s.ms}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all cursor-pointer
                    ${speedMs === s.ms ? 'bg-gold text-black shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
                >
                  {t(s.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startDrill}
            data-testid="start-drill"
            className="lift-glow w-full py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2
              bg-gradient-to-b from-gold-bright to-gold border border-gold/50 cursor-pointer
              shadow-[0_10px_30px_-12px_var(--color-gold)]"
          >
            <Play size={18} className="fill-current" />
            {t('training.speed.start')}
          </button>
        </div>
      </div>
    )
  }

  // ── Drill Phase ──
  if (phase === 'drill') {
    const card = cards[currentIndex]
    const isRed = card.suit === Suit.Hearts || card.suit === Suit.Diamonds
    const progress = ((currentIndex + 1) / cards.length) * 100

    return (
      // Neutral ground, not felt green: this is a counting drill, not a table.
      // The felt belongs to the Casino Session, where it means something.
      <div className="app-canvas flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {/* Progress */}
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-xs text-content/50 mb-1">
            <span>{t('training.speed.cardProgress', { n: currentIndex + 1, total: cards.length })}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-contrast/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/*
          Card Display

          The card is the drill: the whole task is to read a rank before it goes
          away. So its arrival may decorate that, never gate it.

          Two things were wrong here and both had the same consequence. It
          entered from `opacity: 0`, so a frozen animation — a backgrounded tab
          restored, a stalled frame loop, a device under load — left it
          invisible while the timer kept counting down. And `AnimatePresence
          mode="wait"` made the next card's *arrival* conditional on the
          previous card's exit reporting completion, which is the same
          dependency inversion that once left a black panel over the whole app.

          Now: no exit, no presence wrapper, and the entrance moves on transform
          alone. Scale degrades to "slightly small and perfectly readable"; the
          old opacity degraded to "gone".
        */}
        <motion.div
          key={currentIndex}
          initial={reduced ? false : { scale: 0.94 }}
          animate={{ scale: 1 }}
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

        {/* Countdown bar. Position is written by the frame loop above. */}
        <div className="w-[250px] h-1 bg-contrast/10 rounded-full overflow-hidden">
          <div
            ref={countdownRef}
            data-testid="drill-countdown"
            className="h-full w-full bg-gold/70 rounded-full origin-left"
            // `scaleX`, not `width`: width forces layout on every frame, and this
            // one runs continuously for the length of the drill.
            style={{ transform: 'scaleX(1)', willChange: 'transform' }}
          />
        </div>

        <button
          onClick={handleAbort}
          className="text-sm text-content/40 hover:text-content/70 transition-colors cursor-pointer"
        >
          {t('training.speed.stopEsc')}
        </button>
      </div>
    )
  }

  // ── Input Phase ──
  if (phase === 'input') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <h2 className="text-xl font-bold text-content">{t('training.speed.question')}</h2>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setUserAnswer(prev => prev - 1)}
            aria-label={t('training.speed.decrease')}
            className="grid place-items-center w-14 h-14 rounded-full bg-contrast/10 hover:bg-contrast/20
              text-content transition-colors cursor-pointer"
          >
            <Minus size={22} />
          </button>
          <input
            type="number"
            value={userAnswer}
            onChange={(e) => setUserAnswer(Number(e.target.value) || 0)}
            data-testid="count-input"
            className="w-24 h-16 text-center text-3xl font-bold bg-contrast/10 border border-contrast/20
              rounded-xl text-content focus:outline-none focus:border-gold/60
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => setUserAnswer(prev => prev + 1)}
            aria-label={t('training.speed.increase')}
            className="grid place-items-center w-14 h-14 rounded-full bg-contrast/10 hover:bg-contrast/20
              text-content transition-colors cursor-pointer"
          >
            <Plus size={22} />
          </button>
        </div>

        {isFractional && (
          <p className="text-xs text-content/40">{t('training.speed.wongHalves')}</p>
        )}

        <button
          onClick={handleSubmit}
          data-testid="submit-answer"
          className="lift-glow px-8 py-3 rounded-xl font-semibold text-black
            bg-gradient-to-b from-gold-bright to-gold border border-gold/50 cursor-pointer
            shadow-[0_10px_30px_-12px_var(--color-gold)]"
        >
          {t('training.speed.submit')}
        </button>
      </div>
    )
  }

  // ── Result Phase ──
  const formatCount = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="surface w-full max-w-xl p-7 md:p-8 flex flex-col items-center gap-6">
        {/* Result banner */}
        <div className="flex flex-col items-center text-center gap-3">
          <span className={`grid place-items-center w-16 h-16 rounded-full border
            ${isCorrect ? 'text-success bg-success/10 border-success/30' : 'text-error bg-error/10 border-error/30'}`}>
            {isCorrect ? <Check size={32} /> : <X size={32} />}
          </span>
          <h2 className={`text-xl font-bold ${isCorrect ? 'text-success' : 'text-error'}`}>
            {isCorrect
              ? t('training.speed.correctRc', { rc: formatCount(correctRC) })
              : t('training.speed.wrongRc', { rc: formatCount(correctRC) })}
          </h2>
          {!isCorrect && (
            <p className="text-sm text-content/50">{t('training.speed.youSaid', { value: formatCount(userAnswer) })}</p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 w-full text-center">
          <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
            <div className="text-xs text-content/50">{t('training.common.streak')}</div>
            <div className="text-xl font-bold text-content">{streak}</div>
          </div>
          <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
            <div className="text-xs text-content/50">{t('training.common.bestStreak')}</div>
            <div className="text-xl font-bold text-gold">{bestStreak}</div>
          </div>
          <div className="rounded-xl px-4 py-3 col-span-2 bg-contrast/5 border border-contrast/10">
            <div className="text-xs text-content/50">{t('training.common.accuracy')}</div>
            <div className="text-xl font-bold text-content">
              {totalCorrect}/{totalAttempts} ({accuracy}%)
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 w-full">
          <button
            onClick={startDrill}
            data-testid="try-again"
            className="lift-glow flex-1 py-3 rounded-xl font-semibold text-black flex items-center justify-center gap-2
              bg-gradient-to-b from-gold-bright to-gold border border-gold/50 cursor-pointer
              shadow-[0_10px_30px_-12px_var(--color-gold)]"
          >
            <RotateCcw size={17} />
            {t('training.common.tryAgain')}
          </button>
          <button
            onClick={() => { finish(); setPhase('settings') }}
            className="flex-1 py-3 rounded-xl bg-contrast/10 text-content font-medium
              hover:bg-contrast/15 transition-colors cursor-pointer"
          >
            {t('training.common.backToMenu')}
          </button>
        </div>
      </div>
    </div>
  )
}
