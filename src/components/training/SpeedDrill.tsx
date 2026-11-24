import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap, Play } from 'lucide-react'
import { Shoe } from '../../engine/shoe/shoe'
import { CountingEngine } from '../../engine/counting/counting-engine'
import { getSystemById } from '../../engine/counting/counting-systems'
import { CountingSystemId } from '../../types'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useIsPro } from '../../store/entitlement-store'
import { CURRICULUM, stageIndex, deriveStageProgress, getReadStages, claimedStageIds } from '../../services/curriculum'
import { useSessionSave } from '../../hooks/useSessionSave'
import { soundEngine } from '../../services/sound-engine'
import type { Card } from '../../engine/shoe/types'
import { preloadCardImages } from '../cards/card-suits'
import type { SpeedDrillDetails } from '../../services/stats-types'
import { TrainingBackdrop } from './TrainingBackdrop'
import { Panel, Segmented, Button } from '../common/ui'
import { CARD_COUNTS, SPEED_OPTIONS, cardTags, missHint, nextStep, parseCount, quickPicks, secondsPerCard, speedBest } from './speed-drill-model'
import { SpeedFelt, SpeedRunStage } from './SpeedFelt'
import { SpeedCountEntry } from './SpeedCountEntry'
import { SpeedReview } from './SpeedReview'
import { HiLoLegend, SpeedBestBlock, SpeedBestLine, SpeedHint, SpeedNext, SpeedProgress, SpeedRoundInfo, SpeedSitting, SpeedVerdict } from './SpeedPanel'

type Phase = 'settings' | 'drill' | 'input' | 'result'

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
    return deriveStageProgress(stage, sessions, getReadStages(), isPro, claimedStageIds()).done
  }, [sessions, isPro])

  const [open, setOpen] = useState(!learned)

  const GROUPS = [
    { cards: '2 3 4 5 6', value: '+1', tone: 'text-success', note: t('training.primer.lowCards') },
    { cards: '7 8 9', value: '0', tone: 'text-content/50', note: t('training.primer.neutral') },
    { cards: '10 J Q K A', value: '−1', tone: 'text-error', note: t('training.primer.tensAces') },
  ]

  return (
    <div className="rounded-xl border border-gold/25 bg-gold/[.04] overflow-hidden" data-testid="hilo-primer">
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

/**
 * Speed Drill training mode.
 *
 * Deals cards one at a time onto the felt at a set speed, then asks for the
 * running count. Each round ends on the cards laid out again with the true
 * count under every one, so a wrong answer can be traced; the personal best
 * per speed is read from the recorded sessions.
 *
 * ## One session, one setting
 *
 * The attempts of a sitting accumulate until the player steps out — back to
 * the setup, or one notch harder with "Faster". Both end the session, because
 * a session records one speed and one round size (`SpeedDrillDetails`), and
 * the awards read that speed: rounds at two speeds in one record would credit
 * the slow ones at the fast speed.
 */
export function SpeedDrill() {
  // The faces are fetched while the setup is on screen, so the first card of
  // a run is already there when it is shown.
  useEffect(() => { preloadCardImages() }, [])
  const { t, i18n } = useTranslation()
  const selectedSystem = useAppStore(s => s.selectedSystem)
  const selectedRules = useAppStore(s => s.selectedRules)
  const sessions = useStatsStore(s => s.sessions)

  const [phase, setPhase] = useState<Phase>('settings')
  const [cardCount, setCardCount] = useState(20)
  const [speedMs, setSpeedMs] = useState(1000)

  // Drill state
  const [cards, setCards] = useState<Card[]>([])
  /** The running count after each card, from the engine that dealt them. */
  const [runningAfter, setRunningAfter] = useState<number[]>([])
  /** The running count before the first card (0 for a balanced system). */
  const [startCount, setStartCount] = useState(0)
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

  // Input state: the text as typed (see `SpeedCountEntry` for why not a number).
  const [draft, setDraft] = useState('')

  // Result state
  const [isCorrect, setIsCorrect] = useState(false)
  const [answer, setAnswer] = useState(0)

  // Session stats (persist across attempts)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalAttempts, setTotalAttempts] = useState(0)
  /** Every round of the session: right or wrong, and the count error. */
  const [sittingResults, setSittingResults] = useState<boolean[]>([])
  const [sittingErrors, setSittingErrors] = useState<number[]>([])

  // Whether the counting system uses fractional values (Wong Halves)
  const systemConfig = getSystemById(selectedSystem)
  const isFractional = selectedSystem === CountingSystemId.WongHalves
  const tolerance = isFractional ? 0.5 : 0

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

  /** Deals a round of `count` cards (the current setting unless a step up changes it in the same click). */
  const startDrill = useCallback((count: number = cardCount) => {
    begin()
    const shoe = new Shoe({ numDecks: selectedRules.numDecks, penetration: selectedRules.penetration })
    const engine = new CountingEngine(systemConfig, selectedRules.numDecks)
    const start = engine.getRunningCount()

    const dealt: Card[] = []
    const after: number[] = []
    for (let i = 0; i < count; i++) {
      const card = shoe.deal()
      dealt.push(card)
      engine.processCard(card)
      after.push(engine.getRunningCount())
    }

    setCards(dealt)
    setRunningAfter(after)
    setStartCount(start)
    setCorrectRC(engine.getRunningCount())
    setCurrentIndex(0)
    setDraft('')
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
    const given = parseCount(draft)
    const error = Math.abs(given - correctRC)
    const correct = error <= tolerance
    setAnswer(given)
    setIsCorrect(correct)
    setTotalAttempts(prev => prev + 1)
    setSittingResults(prev => [...prev, correct])
    setSittingErrors(prev => [...prev, error])

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
  }, [draft, correctRC, tolerance, totalAttempts, totalCorrect, bestStreak, streak, statsRef])

  /**
   * The session boundary: record what was played and clear the totals.
   *
   * The totals belong to the session that just ended. They used to carry
   * over: three shoes, back, one shoe, back, one shoe, back recorded 3/3,
   * then 4/4, then 5/5 — three "sessions" from five shoes, a curriculum
   * stage closed and its XP paid on work that was counted three times.
   *
   * The stats ref is cleared too: a session below the three-round minimum is
   * not recorded, and its figures must not be the start of the next one.
   */
  const closeSession = useCallback(() => {
    stopTimer()
    finish()
    statsRef.current = { totalQuestions: 0, correctAnswers: 0, bestStreak: 0 }
    setTotalAttempts(0)
    setTotalCorrect(0)
    setStreak(0)
    setBestStreak(0)
    setSittingResults([])
    setSittingErrors([])
    rcErrorsRef.current = []
  }, [stopTimer, finish, statsRef])

  /**
   * Leaving the drill ends the session.
   *
   * Speed Drill has no summary screen — `'result'` is the score of ONE shoe and
   * the player may run another, so the attempts accumulate until they step out.
   * That step is the session boundary, and it is where the payout belongs.
   */
  const endSession = useCallback(() => {
    closeSession()
    setPhase('settings')
  }, [closeSession])
  const handleAbort = endSession

  const step = nextStep(speedMs, cardCount, isCorrect)
  /** The step after a round: a new session at the next speed (either way), or with more cards at the fastest. */
  const stepUp = useCallback(() => {
    if (!step) return
    closeSession()
    if (step.kind === 'faster' || step.kind === 'slower') {
      setSpeedMs(step.speedMs)
      startDrill()
    } else {
      setCardCount(step.cards)
      startDrill(step.cards)
    }
  }, [step, closeSession, startDrill])

  // Keyboard: Escape stops a running round; Enter answers, and on the result
  // starts the next round.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'drill') handleAbort()
        return
      }
      if (e.key !== 'Enter' || e.repeat) return
      if (phase === 'input') {
        // From the field, a chip or a step button alike: the press answers
        // with what is in the field, and does not also press the button.
        e.preventDefault()
        handleSubmit()
      } else if (phase === 'result') {
        // A focused button presses itself on Enter; a second action from
        // here would start a round on top of it.
        if (e.target instanceof Element && e.target.closest('button')) return
        e.preventDefault()
        startDrill()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, handleSubmit, handleAbort, startDrill])

  // ── The personal best at this speed ──
  // Recorded sessions plus this session's rounds, which are recorded only when
  // it ends. `before` leaves out the round just answered, to tell a new best.
  const best = useMemo(
    () => speedBest(sessions, speedMs, { cards: cardCount, errors: sittingErrors }, tolerance),
    [sessions, speedMs, cardCount, sittingErrors, tolerance],
  )
  const bestBefore = useMemo(
    () => speedBest(sessions, speedMs, { cards: cardCount, errors: sittingErrors.slice(0, -1) }, tolerance),
    [sessions, speedMs, cardCount, sittingErrors, tolerance],
  )

  // ── Settings Phase ──
  if (phase === 'settings') {
    const setupBest = best
    return (
      // Centred while it fits, scrolled from the top when it does not (a phone
      // held sideways): `safe` centring never pushes the title off the top.
      <div className="relative isolate overflow-x-hidden overflow-y-auto flex-1 min-h-0 flex flex-col items-center justify-center-safe px-4 py-4">
        <TrainingBackdrop mode="speedDrill" showRails />
        <Panel icon={Zap} title={t('training.speed.title')} subtitle={t('training.speed.sub')} className="w-full max-w-xl">
          <HiLoPrimer />

          {/* Card count */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.speed.numberOfCards')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.speed.numberOfCards')}
              value={cardCount}
              onChange={setCardCount}
              options={CARD_COUNTS.map(n => ({ label: String(n), value: n }))}
            />
          </div>

          {/* Speed */}
          <div>
            <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('training.speed.speed')}</span>
            <Segmented
              fluid
              ariaLabel={t('training.speed.speed')}
              value={speedMs}
              onChange={setSpeedMs}
              options={SPEED_OPTIONS.map(s => ({ label: t(s.labelKey), value: s.ms }))}
            />
            <p className="text-xs text-content/45 mt-2" data-testid="speed-help">
              {t('training.speed.speedHelp', { s: secondsPerCard(speedMs, i18n.language) })}
              <span className="block">
                {setupBest.bestCards === null
                  ? t('training.speed.bestNone')
                  : t('training.speed.bestOnSetup', { n: setupBest.bestCards })}
              </span>
            </p>
          </div>

          <Button size="lg" className="w-full mt-1" onClick={() => startDrill()} data-testid="start-drill">
            <Play size={18} className="fill-current" aria-hidden />
            {t('training.speed.start')}
          </Button>
        </Panel>
      </div>
    )
  }

  const answered = phase === 'result'
  const hint = answered
    ? missHint({ runningAfter, startCount, answer, tolerance, hiLo: selectedSystem === CountingSystemId.HiLo })
    : null
  const tags = answered ? cardTags(runningAfter, startCount) : []
  const isNewBest = answered && isCorrect && (bestBefore.bestCards ?? 0) < cardCount

  // One grid, three shapes, as in Flashcards. Wide (lg): the felt left, the
  // panel right. A phone: a strip above the felt (and, answered, the verdict
  // above and the pointer and the way on below). A phone held sideways
  // (`short`): the felt left, the rest beside it. The panel is `display:
  // contents` below lg, so its parts are placed by area name and each is
  // drawn once at every size.
  const areas = answered
    ? `grid-rows-[auto_minmax(0,1fr)_auto_auto_auto] [grid-template-areas:'verdict'_'felt'_'hint'_'best'_'next']
       max-lg:short:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] max-lg:short:grid-rows-[auto_auto_auto_minmax(0,1fr)]
       max-lg:short:[grid-template-areas:'felt_verdict'_'felt_hint'_'felt_best'_'felt_next']`
    : `grid-rows-[auto_minmax(0,1fr)] [grid-template-areas:'prog'_'felt']
       max-lg:short:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] max-lg:short:grid-rows-[auto_auto_minmax(0,1fr)]
       max-lg:short:[grid-template-areas:'felt_prog'_'felt_info'_'felt_best']`

  return (
    // `data-drill-run`: on a phone held sideways the back bar gives its row to
    // the round (see `BackToMenu`).
    <div
      data-drill-run
      className="flex-1 min-h-0 flex flex-col px-3 sm:px-5 lg:px-8 pt-3 lg:pt-4 short:pt-2
        pb-[calc(0.75rem+var(--cookie-bar,0px))] lg:pb-[calc(1.5rem+var(--cookie-bar,0px))] short:pb-[calc(0.5rem+var(--cookie-bar,0px))]"
    >
      <div
        className={`mx-auto w-full max-w-[96rem] flex-1 min-h-0 grid gap-3 sm:gap-4 ${areas}
          max-lg:short:gap-x-4 max-lg:short:gap-y-3
          lg:grid-cols-[minmax(0,1fr)_clamp(20rem,26vw,26rem)] lg:grid-rows-[minmax(0,1fr)]
          lg:[grid-template-areas:'felt_panel'] lg:gap-x-6`}
      >
        <section className="[grid-area:felt] min-h-0 min-w-0">
          <SpeedFelt verdict={answered ? isCorrect : null}>
            {phase === 'drill' && cards[currentIndex] && (
              <SpeedRunStage card={cards[currentIndex]} index={currentIndex} countdownRef={countdownRef} />
            )}
            {phase === 'input' && (
              <div className="relative flex-1 min-h-0">
                <SpeedCountEntry
                  draft={draft}
                  onDraft={setDraft}
                  onSubmit={handleSubmit}
                  picks={quickPicks(cards.length, startCount)}
                  fractional={isFractional}
                />
              </div>
            )}
            {answered && <SpeedReview cards={cards} runningAfter={runningAfter} marked={hint?.marked} />}
          </SpeedFelt>
        </section>

        <aside className="contents lg:[grid-area:panel] lg:flex lg:flex-col lg:min-h-0 lg:gap-5 [@media(max-height:820px)]:lg:gap-3 lg:overflow-hidden surface lg:p-5 xl:p-6 [@media(max-height:820px)]:lg:py-4">
          {!answered ? (
            <>
              <SpeedProgress
                index={currentIndex}
                total={cards.length}
                done={phase === 'input'}
                onStop={phase === 'drill' ? handleAbort : undefined}
                className="[grid-area:prog] shrink-0 max-lg:px-1"
              />
              <SpeedRoundInfo speedMs={speedMs} cards={cards.length} className="[grid-area:info] shrink-0 hidden lg:block max-lg:short:block" />
              <SpeedBestBlock best={best} speedMs={speedMs} className="[grid-area:best] shrink-0 hidden lg:block max-lg:short:block" />
              {/* The session so far — empty before its first round says
                  where it will show — in the room the round does not need. */}
              <SpeedSitting results={sittingResults} streak={streak} bestStreak={bestStreak} className="shrink-0 hidden lg:block" />
              {/* The rule at the foot of the panel in both phases, so the
                  panel stays put when the cards end; only Stop leaves. */}
              <div className="hidden lg:flex flex-col gap-4 mt-auto">
                <HiLoLegend />
                {phase === 'drill' && (
                  <button
                    type="button"
                    onClick={handleAbort}
                    data-testid="stop-drill"
                    className="w-full min-h-10 rounded-xl text-sm text-content/55 hover:text-content border border-contrast/12 hover:border-contrast/25 transition-colors duration-150 cursor-pointer"
                  >
                    {t('training.speed.stopEsc')}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <SpeedVerdict correct={isCorrect} count={correctRC} answer={answer} results={sittingResults} isNewBest={isNewBest} className="[grid-area:verdict] shrink-0 max-lg:px-1" />
              {hint && (
                <SpeedHint
                  hint={hint}
                  lastCard={cards[cards.length - 1] ?? null}
                  lastTag={tags[tags.length - 1] ?? 0}
                  className="[grid-area:hint] shrink-0 max-lg:px-1 max-lg:short:text-xs max-lg:short:leading-snug"
                />
              )}
              <SpeedBestBlock best={best} speedMs={speedMs} isNew={isNewBest} className="shrink-0 hidden lg:block" />
              <SpeedBestLine best={best} speedMs={speedMs} className="[grid-area:best] shrink-0 px-1 -mt-1 lg:hidden" />
              <SpeedSitting results={sittingResults} streak={streak} bestStreak={bestStreak} className="shrink-0 hidden lg:block" />
              <SpeedNext
                onAgain={() => startDrill()}
                step={step}
                onStep={stepUp}
                onSettings={endSession}
                className="[grid-area:next] shrink-0 lg:mt-auto max-lg:short:self-end"
              />
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
