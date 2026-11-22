import { useState, useCallback, useEffect, useRef } from 'react'
import { preloadCardImages } from '../cards/card-suits'
import { useAppStore } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { SessionRecorder } from '../../services/session-recorder'
import { casinoAmbient } from '../../services/casino-ambient'
import type { CasinoSessionConfig, CasinoSessionResult } from '../../engine/casino-session/types'
import {
  clearLiveSession,
  loadLiveSession,
  newLiveSessionId,
  type SavedLiveSession,
} from '../../services/casino-live-session'
import { DEFAULT_CONFIG } from './helpers'
import type { Phase } from './helpers'
import { CasinoSessionConfigView } from './CasinoSessionConfig'
import { CasinoSessionSummary } from './CasinoSessionSummary'
import { CasinoSessionGame } from './CasinoSessionGame'
import { ResumeSessionCard } from './ResumeSessionCard'
import { recordCasinoSession, settleSavedSession } from './record-session'
import { TrialIntro } from './TrialIntro'
import { isTrialTable, trialTableConfig } from './trial-table'
import { useIsPro } from '../../store/entitlement-store'
import { useCasinoTrialStore, useTrialLeft } from '../../store/casino-trial-store'

/** A recorder for the hands still to come, already told the table's rules. */
function startRecorder(config: CasinoSessionConfig): SessionRecorder {
  const recorder = new SessionRecorder()
  recorder.start(config)
  return recorder
}

interface CasinoSessionProps {
  /**
   * The session stays mounted while another mode is on screen, so the player
   * can come back to the same hand. See `TrainerApp` for why it is mounted
   * outside the mode switch.
   */
  backgrounded?: boolean
}

export function CasinoSession({ backgrounded = false }: CasinoSessionProps = {}) {
  // The card faces are fetched while the setup is being read: the first deal
  // must not put down white rectangles that fill in a moment later.
  useEffect(() => { preloadCardImages() }, [])
  const setMode = useAppStore(s => s.setMode)
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const selectedSystem = useAppStore(s => s.selectedSystem)
  /*
    Without Pro this component is the free trial (`casino-trial.ts`): the
    intro instead of the setup screen, the one fixed table, and a count of
    hands that ends it. `TrainerApp` only mounts it for such an account while
    trial hands remain or a trial table is still on screen.
  */
  const isPro = useIsPro()
  const trialLeft = useTrialLeft()
  /** The account's own trial table is saved on this device, waiting to be continued. */
  const savedTrialTable = useLiveSessionStore(s => s.saved?.trial === true)

  /**
   * "Continue" on the home screen's resume card brings the player here with a
   * request to open the saved table. It is read once, while mounting, and only
   * read: the effect below withdraws it. (An initializer runs twice in
   * development; one that took the request away would find none the second
   * time.)
   */
  const [boot] = useState<SavedLiveSession | null>(() => {
    const saved = useLiveSessionStore.getState().resumeRequested ? loadLiveSession() : null
    // A Pro table left behind by an account that has no Pro any more is not
    // continued as a trial: its result can be cashed out, nothing else.
    return saved && (isPro || saved.config.trial === true) ? saved : null
  })
  useEffect(() => { useLiveSessionStore.getState().clearResumeRequest() }, [])

  const [phase, setPhase] = useState<Phase>(boot ? 'playing' : 'config')
  const [lastConfig, setLastConfig] = useState<CasinoSessionConfig>(boot ? boot.config : {
    ...DEFAULT_CONFIG,
    countingSystem: selectedSystem,
  })
  const [result, setResult] = useState<CasinoSessionResult | null>(null)
  // State, not a ref: the recorder is handed to child components, so it is
  // render-relevant data. As a ref it worked only because every write happened
  // to be paired with a state update that forced the re-render.
  const [recorder, setRecorder] = useState<SessionRecorder | null>(() => (boot ? startRecorder(boot.config) : null))
  /**
   * The table being played: its id, and — when it was picked up again rather
   * than started — the saved copy it continues from.
   *
   * The id is made when the session starts and is what the session is saved
   * and recorded under. The ref mirrors it for `handleSessionEnd`, which is
   * also called from the game's unmount, after the last render.
   */
  const [live, setLive] = useState<{ id: string; resume: SavedLiveSession | null } | null>(() =>
    (boot ? { id: boot.id, resume: boot } : null))
  const liveIdRef = useRef<string | null>(boot ? boot.id : null)

  /**
   * Tell the navigation guard when there is something to protect.
   *
   * Only from `playing` onward. The configuration screen holds no progress, and
   * asking "discard your session?" there would teach people to click the dialog
   * away — after which it protects nothing on the screen where it matters.
   */
  useEffect(() => {
    const live = useLiveSessionStore.getState()
    if (phase === 'playing') live.beginSession('casinoSession')
    else live.endSession()
  }, [phase])

  /**
   * A session that is unmounted is a session that is over.
   *
   * The engine, the shoe and the clock live in refs inside `CasinoSessionGame`.
   * `TrainerApp` now keeps this component mounted across mode changes, so this
   * runs on the ways out that really do destroy it: leaving the app, losing Pro,
   * or a crash the ErrorBoundary resets. Reporting the end keeps the guard from
   * protecting a session that no longer exists.
   */
  useEffect(() => () => { useLiveSessionStore.getState().endSession() }, [])

  /**
   * A trial table on screen — in play, or showing its summary — says so, so
   * that `TrainerApp` keeps it mounted through the last hand's settlement and
   * the summary. Both come after the tenth hand has been counted; see
   * `seated` in the trial store.
   */
  const trialSeated = !isPro && phase !== 'config' && lastConfig.trial === true
  useEffect(() => {
    useCasinoTrialStore.getState().setSeated(trialSeated)
  }, [trialSeated])
  useEffect(() => () => { useCasinoTrialStore.getState().setSeated(false) }, [])

  /*
    Pro ended while a Pro table was on the felt, and the account still has
    trial hands (so `TrainerApp` keeps this mounted). The table is not the
    trial's: it is left. Unmounting the game records what was played at it —
    and shows that summary — exactly as leaving it any other way does. Set
    while rendering, the documented alternative to an effect a frame late.
  */
  if (phase === 'playing' && !isPro && lastConfig.trial !== true) setPhase('config')

  const handleStart = useCallback((config: CasinoSessionConfig) => {
    const begin = () => {
      const id = newLiveSessionId()
      liveIdRef.current = id
      setLive({ id, resume: null })
      setRecorder(startRecorder(config))
      setLastConfig(config)
      setPhase('playing')
    }
    /*
      A table still saved on this device is cashed out before a new one takes
      its place. There is one saved table; the new session writes over it the
      moment it starts, and the hands of the old one would be gone without a
      record — the very loss saving the table exists to prevent. Starting
      fresh is a way of saying "I am done with that one", so it is settled
      the way "Cash out now" settles it.
    */
    if (loadLiveSession()) void settleSavedSession().finally(begin)
    else begin()
  }, [])

  /** "Continue" on the setup screen's resume card: the saved table, at its next bet. */
  const handleResume = useCallback(() => {
    const saved = loadLiveSession()
    if (!saved || !(isPro || saved.config.trial === true)) {
      // Gone meanwhile — cashed out in another tab, or unreadable. The card
      // goes with it. (Or not a table this account may sit at: see `boot`.)
      useLiveSessionStore.getState().refreshSaved()
      return
    }
    liveIdRef.current = saved.id
    setLive({ id: saved.id, resume: saved })
    setRecorder(startRecorder(saved.config))
    setLastConfig(saved.config)
    setPhase('playing')
  }, [isPro])

  const handleSessionEnd = useCallback((sessionResult: CasinoSessionResult) => {
    casinoAmbient.stop()
    // A trial table that closed before a hand was played has no result to
    // show: back to where it was opened from. (Recording it only puts the
    // saved copy away.)
    if (sessionResult.config.trial === true && sessionResult.hands.length === 0) {
      recordCasinoSession(sessionResult, { liveId: liveIdRef.current })
      setPhase('config')
      setRecorder(null)
      return
    }
    setResult(sessionResult)
    setPhase('summary')
    // Statistics, XP and the tracker — and the saved table goes with it. The
    // summary shows either way; a session with no hands, or one another tab
    // has already cashed out, is simply not written (again).
    recordCasinoSession(sessionResult, { liveId: liveIdRef.current })
  }, [])

  /**
   * "Start a new session" from the table: the session is dropped, unrecorded,
   * and so is its saved copy — otherwise the setup screen it leads to would
   * offer to resume the table that was just thrown away.
   */
  const handleRestart = useCallback(() => {
    if (liveIdRef.current) clearLiveSession(liveIdRef.current)
    useLiveSessionStore.getState().refreshSaved()
    setPhase('config')
    setResult(null)
    setRecorder(null)
  }, [])

  if (phase === 'config' && !isPro) {
    // Nothing once the hands are gone: `TrainerApp` puts the paywall here.
    if (trialLeft === 0) return null
    return (
      <TrialIntro
        handsLeft={trialLeft}
        onStart={() => handleStart(trialTableConfig(selectedSystem))}
        // The trial's own table: continue it, nothing beside it. Any other
        // saved table (a Pro table from before) can only be cashed out, and
        // sits above the offer as it does above the setup screen.
        savedTable={savedTrialTable ? <ResumeSessionCard onContinue={handleResume} /> : undefined}
        notice={<ResumeSessionCard onContinue={handleResume} />}
      />
    )
  }

  if (phase === 'config') {
    return (
      <CasinoSessionConfigView
        initialConfig={lastConfig}
        onStart={handleStart}
        // The same choice the home screen offers, for whoever comes straight
        // to the table: continue the saved session or cash it out. (Starting
        // a new one from the form below cashes it out first — `handleStart`.)
        notice={<ResumeSessionCard onContinue={handleResume} />}
      />
    )
  }

  if (phase === 'summary' && result) {
    return (
      <CasinoSessionSummary
        result={result}
        trial={isTrialTable(result.config, isPro) ? { handsLeft: trialLeft } : undefined}
        onPlayAgain={() => {
          // In the same breath as the phase: with no hands left the paywall
          // takes this place, and must not wait for an effect to say so.
          if (!isPro) useCasinoTrialStore.getState().setSeated(false)
          setPhase('config')
          setResult(null)
        }}
        onHome={() => setMode('home')}
        recorder={recorder}
      />
    )
  }

  return (
    <CasinoSessionGame
      config={lastConfig}
      recorder={recorder}
      soundEnabled={soundEnabled}
      onSessionEnd={handleSessionEnd}
      backgrounded={backgrounded}
      /*
        Back to the configuration screen, discarding the hand in progress.
        Deliberately not `handleSessionEnd`: that books the session into the
        statistics and the tracker as a completed one, and half a shoe played
        before wandering off is not a result worth recording.
      */
      onRestart={handleRestart}
      live={live ?? undefined}
    />
  )
}
