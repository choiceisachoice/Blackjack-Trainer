import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { getHandValue, isBust, isPair } from '../../engine/rules/hand-utils'
import { Action } from '../../engine/rules/types'
import { casinoAmbient } from '../../services/casino-ambient'
import type { CasinoSessionConfig, CasinoSessionResult } from '../../engine/casino-session/types'
import type { SessionRecorder } from '../../services/session-recorder'
import { useAppStore, DEALING_SPEED_LABEL, type DealingSpeed } from '../../store/app-store'
import { useGameLoop } from './useGameLoop'
import { CasinoTable } from './CasinoTable'
import { ActionButtons } from './ActionButtons'
import { BettingControls } from './BettingControls'
import { formatDollar, formatTime } from './helpers'

interface CasinoSessionGameProps {
  config: CasinoSessionConfig
  recorder: SessionRecorder | null
  soundEnabled: boolean
  onSessionEnd: (result: CasinoSessionResult) => void
  /**
   * The session is still mounted but not on screen — the player navigated to
   * another mode.
   *
   * Staying mounted is what lets them come back to the same hand. It also means
   * the clock would keep running behind their back, and a time-limited session
   * could expire while they read the Learn page. So being backgrounded pauses.
   *
   * Coming back deliberately does NOT auto-resume: the pause overlay is already
   * on screen and unpausing is one click. Resuming for them would restart
   * animations mid-flight for someone who is not looking yet.
   */
  backgrounded?: boolean
  /**
   * Throw this session away and go back to the configuration screen.
   *
   * Offered only on return from another mode, next to continuing. Someone who
   * has been away may well want a clean shoe, and the alternative — "Quit
   * Session" — is not the same thing: that ends the session and books it into
   * the statistics as a completed one.
   */
  onRestart?: () => void
}

export function CasinoSessionGame({ config, recorder, soundEnabled, onSessionEnd, backgrounded = false, onRestart }: CasinoSessionGameProps) {
  const { t } = useTranslation()
  const {
    state,
    actions,
    seatLayout,
    shoeProgress,
    cardsRemaining,
    cardsDealt,
    discardCount,
    totalCards,
    bankroll,
    handNum,
    initSession,
  } = useGameLoop(config, recorder, onSessionEnd)

  const targetHands = config.sessionMode === 'hands' ? config.targetHands : undefined

  // Init session on mount
  useEffect(() => {
    initSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Freeze the session while it is off screen.
   *
   * One direction only. Backgrounding pauses; returning does not resume,
   * because the player may have paused deliberately before leaving and
   * un-pausing for them would discard that decision. The overlay is already up
   * and resuming is one click.
   */
  useEffect(() => {
    if (backgrounded) actions.setPaused(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgrounded])

  /**
   * Whether the player has just come back from another mode.
   *
   * Drives a different pause panel: returning is not the same situation as
   * pausing on purpose. Someone who paused deliberately wants Resume and Quit.
   * Someone returning after ten minutes elsewhere first needs to be told the
   * session is still here — and given the choice they would otherwise take by
   * quitting and re-entering: start fresh.
   */
  const [justReturned, setJustReturned] = useState(false)
  const wasBackgrounded = useRef(false)
  useEffect(() => {
    if (backgrounded) wasBackgrounded.current = true
    else if (wasBackgrounded.current) {
      wasBackgrounded.current = false
      setJustReturned(true)
    }
  }, [backgrounded])

  const continueSession = () => { setJustReturned(false); actions.setPaused(false) }
  const restartSession = () => { setJustReturned(false); onRestart?.() }

  // Dealing speed (live, persisted)
  const dealingSpeed = useAppStore(s => s.dealingSpeed)
  const setDealingSpeed = useAppStore(s => s.setDealingSpeed)

  // Volume slider state (synced from singleton)
  const [ambientVolume, setAmbientVolume] = useState(() => casinoAmbient.volume)

  // Ambient sound — respects config.casinoAmbience + soundEnabled + pause
  useEffect(() => {
    const shouldPlay = soundEnabled && config.casinoAmbience
    if (shouldPlay) {
      casinoAmbient.start()
      // Reduce volume to 30% when paused
      if (state.isPaused) {
        casinoAmbient.volume = ambientVolume * 0.3
      } else {
        casinoAmbient.volume = ambientVolume
      }
    } else {
      casinoAmbient.stop()
    }
    return () => { casinoAmbient.stop() }
  }, [soundEnabled, config.casinoAmbience, state.isPaused, ambientVolume])

  // Time limit check
  useEffect(() => {
    if (config.sessionMode === 'time' && state.elapsedSeconds >= config.targetMinutes * 60) {
      actions.quitSession()
    }
  }, [state.elapsedSeconds, config.sessionMode, config.targetMinutes, actions])

  // Auto-stand at 21
  useEffect(() => {
    if (state.gameStep !== 'human_playing') return
    const cards = state.humanHands[state.activeHandIndex] ?? []
    if (cards.length < 2) return
    if (isBust(cards)) return
    if (getHandValue(cards).best === 21) {
      const t = setTimeout(() => actions.handleAction(Action.Stand), 500)
      return () => clearTimeout(t)
    }
  }, [state.gameStep, state.humanHands, state.activeHandIndex, actions])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state.isPaused) {
        if (e.key === 'Escape') actions.setPaused(false)
        return
      }

      if (e.key === 'Escape') {
        actions.setPaused(true)
        return
      }

      if (state.gameStep === 'human_playing') {
        if (e.key === 'h' || e.key === 'H') actions.handleAction(Action.Hit)
        else if (e.key === 's' || e.key === 'S') actions.handleAction(Action.Stand)
        else if (e.key === 'd' || e.key === 'D') actions.handleAction(Action.Double)
        else if (e.key === 'p' || e.key === 'P') actions.handleAction(Action.Split)
        else if (e.key === 'r' || e.key === 'R') actions.handleAction(Action.Surrender)
      }

      if (state.gameStep === 'insurance') {
        if (e.key === 'y' || e.key === 'Y') actions.handleInsurance(true)
        else if (e.key === 'n' || e.key === 'N') actions.handleInsurance(false)
      }

      if (state.gameStep === 'betting' && e.key === 'Enter') {
        actions.confirmBet()
      }

      if (state.gameStep === 'count_check' && e.key === 'Enter') {
        actions.submitCount()
      }

      if ((state.gameStep === 'hand_review' || state.gameStep === 'settlement') && (e.key === 'Enter' || e.key === ' ')) {
        actions.nextHand()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.gameStep, state.isPaused, actions])

  // Derived play state
  const humanCards = state.humanHands[state.activeHandIndex] ?? []
  const isFirstAction = humanCards.length === 2
  const canSplitNow = isFirstAction && isPair(humanCards) && state.humanHands.length < config.maxSplitHands && bankroll >= state.currentBet
  const canDoubleNow = isFirstAction && bankroll >= state.currentBet && (state.humanHands.length === 1 || config.doubleAfterSplit)
  const canSurrenderNow = isFirstAction && config.surrenderAllowed && state.humanHands.length === 1 && !state.isSurrendered
  const humanBusted = humanCards.length > 0 && isBust(humanCards)
  const isDealPhase = state.gameStep === 'dealing'

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: '#0c0c0c' }}>
      {/*
        Pause Overlay.

        No entrance, and that is the point: this panel holds Resume and Quit, so
        a stalled fade-in left the session paused behind invisible controls. The
        rule that falls out of it, and out of every other case like it in this
        change — an arrival is instant or moves on transform; only a *departure*
        may fade, because a stalled departure leaves something on screen and a
        stalled arrival leaves nothing.
      */}
      <AnimatePresence>
        {state.isPaused && (
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center gap-6"
          >
            {justReturned ? (
              /*
                Coming back from another mode. Three things this has to do that
                the plain pause panel does not: say the session survived (the
                old behaviour destroyed it, and people will expect that for a
                while), say where it stands, and offer the fresh start that
                would otherwise mean quitting — which is worse, because quitting
                books an unfinished session into the statistics as a real one.
              */
              <div className="flex flex-col items-center gap-5 px-6 text-center" data-testid="resume-session-panel">
                <h2 className="text-3xl font-bold text-gold">{t('session.resume.title')}</h2>
                <p className="text-white/60 max-w-sm">
                  {t('session.resume.body', { hand: handNum })}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={continueSession} data-testid="resume-continue"
                    className="px-8 py-3 bg-gold text-black rounded-xl font-bold text-lg hover:bg-gold/90 cursor-pointer">
                    {t('session.resume.continue')}
                  </button>
                  <button onClick={restartSession} data-testid="resume-restart"
                    className="px-8 py-3 rounded-xl font-bold border border-white/20 text-white/80 hover:border-gold/55 hover:text-white cursor-pointer">
                    {t('session.resume.restart')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-3xl font-bold text-gold">{t('session.paused')}</h2>
                <button onClick={() => actions.setPaused(false)}
                  className="px-8 py-3 bg-gold text-black rounded-xl font-bold text-lg hover:bg-gold/90 cursor-pointer">
                  {t('session.resumeButton')}
                </button>
                <button onClick={actions.quitSession} data-testid="quit-session"
                  className="px-8 py-3 bg-error text-white rounded-xl font-bold hover:bg-error/80 cursor-pointer">
                  {t('session.quit')}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reshuffle Notification Overlay. Same rule as the pause panel above:
          it exists to be read, so it arrives rather than fades in. */}
      <AnimatePresence>
        {state.showReshuffle && (
          <motion.div
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
          >
            <div className="px-10 py-5 rounded-2xl shadow-2xl text-center"
              style={{ background: 'rgba(0,0,0,0.85)', border: '2px solid rgba(212, 168, 67, 0.5)' }}
              data-testid="reshuffle-notification"
            >
              <div className="text-gold text-xl md:text-2xl font-bold mb-1">{t('session.shuffling')}</div>
              <div className="text-white/50 text-sm">{t('session.newShoe')}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-contrast/5 border-b border-contrast/10 text-xs shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-content/60">
            {t('casino.hud.hand')} <span className="text-content font-semibold">{handNum}{targetHands ? `/${targetHands}` : ''}</span>
          </span>
          <span className="text-content/60">
            {t('casino.hud.bankroll')} <span className={`font-semibold ${bankroll >= config.startingBankroll ? 'text-success' : 'text-error'}`}>
              {formatDollar(bankroll)}
            </span>
          </span>
          <span className="text-content/60">
            {t('casino.hud.session')} <span className={`font-semibold ${bankroll - config.startingBankroll >= 0 ? 'text-success' : 'text-error'}`}>
              {formatDollar(bankroll - config.startingBankroll)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5" data-testid="shoe-progress">
            <span className="text-content/40 text-[0.6875rem]">{t('casino.hud.shoe')}</span>
            <div className="w-16 h-1.5 bg-contrast/10 rounded-full overflow-hidden">
              <div className="h-full bg-gold/60 rounded-full transition-all" style={{ width: `${Math.min(100, shoeProgress * 100)}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1" data-testid="speed-control">
            <span className="text-content/40 text-[0.6875rem]">{t('casino.hud.speed')}</span>
            <div className="inline-flex p-0.5 rounded-md bg-contrast/10 border border-contrast/10">
              {(['slow', 'normal'] as DealingSpeed[]).map(s => (
                <button
                  key={s}
                  onClick={() => setDealingSpeed(s)}
                  aria-pressed={dealingSpeed === s}
                  className={`px-2 py-0.5 rounded text-[0.6875rem] transition-colors cursor-pointer
                    ${dealingSpeed === s ? 'bg-gold text-black font-semibold' : 'text-content/50 hover:text-content'}`}
                >
                  {t(DEALING_SPEED_LABEL[s])}
                </button>
              ))}
            </div>
          </div>
          {soundEnabled && config.casinoAmbience && (
            <div className="flex items-center gap-1" data-testid="volume-slider">
              <span className="text-content/40 text-[0.6875rem]">{Math.round(ambientVolume * 100)}%</span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={ambientVolume}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  setAmbientVolume(v)
                  casinoAmbient.volume = v
                }}
                className="w-20 h-1 accent-gold cursor-pointer"
                title={t('casino.hud.ambientVolume')}
              />
            </div>
          )}
          <span className="text-content/60">{formatTime(state.elapsedSeconds)}</span>
          <button onClick={() => actions.setPaused(true)} data-testid="pause-button"
            className="text-content/50 hover:text-content cursor-pointer">
            Pause
          </button>
        </div>
      </div>

      {/* Casino Table */}
      <CasinoTable
        dealerCards={state.dealerCards}
        dealerHoleRevealed={state.dealerHoleRevealed}
        gameStep={state.gameStep}
        isDealPhase={isDealPhase}
        seatLayout={seatLayout}
        humanHands={state.humanHands}
        humanVisibleCards={state.humanVisibleCards}
        activeHandIndex={state.activeHandIndex}
        currentBet={state.currentBet}
        handDoubled={state.handDoubled}
        isSurrendered={state.isSurrendered}
        humanSettlement={state.humanSettlement}
        activeBotId={state.activeBotId}
        botStatuses={state.botStatuses}
        botResults={state.botResults}
        botVisibleCards={state.botVisibleCards}
        botActiveSplitHands={state.botActiveSplitHands}
        botSplitVisibleCards={state.botSplitVisibleCards}
        bankroll={bankroll}
        cardsRemaining={cardsRemaining}
        cardsDealt={cardsDealt}
        discardCount={discardCount}
        totalCards={totalCards}
        penetration={config.penetration}
        blackjackPays={config.blackjackPays}
        dealerHitsSoft17={config.dealerHitsSoft17}
      />

      {/* Controls Area */}
      <div className="shrink-0 bg-contrast/5 border-t border-contrast/10 px-4 py-3">
        {/* Betting */}
        {state.gameStep === 'betting' && (
          <BettingControls
            currentBet={state.currentBet}
            minBet={config.minBet}
            maxBet={config.maxBet}
            bankroll={bankroll}
            onBetChange={actions.setBet}
            onConfirm={actions.confirmBet}
          />
        )}

        {/* Insurance */}
        {state.gameStep === 'insurance' && (
          <div className="flex flex-col items-center gap-3" data-testid="insurance-controls">
            <span className="text-sm text-content">{t('casino.hud.insuranceAsk')}</span>
            <div className="flex gap-3">
              <button onClick={() => actions.handleInsurance(true)} data-testid="insurance-yes"
                className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
                {t('casino.hud.yes')}
              </button>
              <button onClick={() => actions.handleInsurance(false)} data-testid="insurance-no"
                className="px-6 py-2 bg-contrast/10 text-content rounded-xl font-bold hover:bg-contrast/20 cursor-pointer">
                {t('casino.hud.no')}
              </button>
            </div>
          </div>
        )}

        {/* Human Playing */}
        {state.gameStep === 'human_playing' && (
          <ActionButtons
            onAction={actions.handleAction}
            canDouble={canDoubleNow}
            canSplit={canSplitNow}
            canSurrender={canSurrenderNow}
            humanBusted={humanBusted}
          />
        )}

        {/* Count Check */}
        {state.gameStep === 'count_check' && (
          <div className="flex flex-col items-center gap-3" data-testid="count-check">
            <span className="text-sm text-content">{t('casino.hud.countAsk')}</span>
            {!state.countFeedback ? (
              <>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-content/60">RC:</span>
                    <input type="number" value={state.rcInput} onChange={e => actions.setRcInput(e.target.value)}
                      data-testid="rc-input" autoFocus
                      className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-20 text-center" />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-content/60">TC:</span>
                    <input type="number" step="0.5" value={state.tcInput} onChange={e => actions.setTcInput(e.target.value)}
                      data-testid="tc-input"
                      className="bg-input-bg border border-contrast/20 rounded px-3 py-1.5 text-sm text-content w-20 text-center" />
                  </label>
                </div>
                <button onClick={actions.submitCount} data-testid="submit-count"
                  className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
                  {t('casino.hud.submitEnter')}
                </button>
              </>
            ) : (
              <div className="text-center space-y-1">
                <p className={`text-sm font-semibold ${state.countFeedback.rcCorrect ? 'text-success' : 'text-error'}`}>
                  RC: {state.countFeedback.rcCorrect ? t('casino.review.correct') : t('casino.review.wrongActual', { value: state.countFeedback.actualRC })}
                </p>
                <p className={`text-sm font-semibold ${state.countFeedback.tcCorrect ? 'text-success' : 'text-error'}`}>
                  TC: {state.countFeedback.tcCorrect ? t('casino.review.correct') : t('casino.review.wrongActual', { value: state.countFeedback.actualTC })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Hand Review */}
        {state.gameStep === 'hand_review' && state.handReview && (
          <div className="flex flex-col items-center gap-2" data-testid="hand-review">
            <div className="flex flex-wrap gap-4 justify-center text-xs">
              <span className={state.handReview.betCorrect ? 'text-success' : 'text-error'}>
                {t('casino.review.betLabel')} {state.handReview.betCorrect ? t('casino.review.correct') : t('casino.review.wrongShould', { value: formatDollar(state.handReview.correctBet) })}
              </span>
              {state.handReview.wasDeviationSituation && (
                <span className={state.handReview.playerFollowedDeviation ? 'text-success' : 'text-error'}>
                  {t('casino.review.devLabel')} {state.handReview.playerFollowedDeviation ? t('casino.review.followed') : t('casino.review.missed', { name: state.handReview.deviationName })}
                </span>
              )}
            </div>
            {(() => {
              const decisions = state.handReview.decisions ?? []
              const handIndices = [...new Set(decisions.map(d => (d as { handIndex?: number }).handIndex ?? 0))]
              const isSplitReview = handIndices.length > 1

              if (isSplitReview) {
                return (
                  <div className="flex flex-col gap-1 text-xs text-center">
                    {handIndices.map(hi => {
                      const hDecisions = decisions.filter(d => ((d as { handIndex?: number }).handIndex ?? 0) === hi)
                      const actionsStr = hDecisions.map(d => d.action).join(', ')
                      const allCorrect = hDecisions.every(d => d.isCorrect)
                      const lastVal = hDecisions[hDecisions.length - 1]?.handValueAfter ?? 0
                      return (
                        <span key={hi} className={allCorrect ? 'text-success' : 'text-error'}>
                          {t('casino.review.handNo', { n: hi + 1 })} {actionsStr} ({lastVal}) {allCorrect ? '\u2713' : `\u2717 ${t('casino.review.wrongShould', { value: hDecisions.find(d => !d.isCorrect)?.correctAction })}`}
                        </span>
                      )
                    })}
                  </div>
                )
              }

              return (
                <span className={`text-xs ${state.handReview.firstActionCorrect ? 'text-success' : 'text-error'}`}>
                  {t('casino.review.playLabel')} {state.handReview.firstActionCorrect ? t('casino.review.correct') : t('casino.review.wrongShould', { value: state.handReview.correctFirstAction })}
                </span>
              )
            })()}
            <button onClick={actions.nextHand} data-testid="next-hand"
              className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
              {t('casino.hud.nextHand')}
            </button>
          </div>
        )}

        {/* Settlement */}
        {state.gameStep === 'settlement' && (
          <div className="flex flex-col items-center gap-2">
            <button onClick={actions.nextHand} data-testid="next-hand"
              className="px-6 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
              {t('casino.hud.nextHand')}
            </button>
          </div>
        )}

        {/* Dealing / Bot / Dealer animation (no controls needed) */}
        {(state.gameStep === 'dealing' || state.gameStep === 'bot_playing' || state.gameStep === 'dealer_playing') && (
          <div className="h-10" />
        )}
      </div>
    </div>
  )
}
