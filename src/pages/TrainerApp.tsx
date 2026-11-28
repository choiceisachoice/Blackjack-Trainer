import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/app-store'
import { usePageMeta } from '../hooks/use-page-meta'
import { useLiveSessionStore } from '../store/live-session-store'
import { HomeScreen } from '../components/navigation/HomeScreen'
import { NavBar } from '../components/navigation/NavBar'
import { BackToMenu } from '../components/navigation/BackToMenu'
import { SpeedDrill } from '../components/training/SpeedDrill'
import { DeviationTraining } from '../components/training/DeviationTraining'
import { BetSpread } from '../components/training/BetSpread'
import { DeckEstimation } from '../components/training/DeckEstimation'
import { AnalyticsDashboard } from '../components/analytics/AnalyticsDashboard'
import { BankrollSimulator } from '../components/simulator/BankrollSimulator'
import { AchievementsPage } from '../components/achievements/AchievementsPage'
import { CasinoSession } from '../components/casino-session/CasinoSession'
import { StrategyChart } from '../components/strategy-chart/StrategyChart'
import { CasinoSessionTracker } from '../components/training/CasinoSessionTracker'
import { LearnChapters } from '../components/learn/LearnChapters'
import { TrainingPlan } from '../components/plan/TrainingPlan'
import { LeaveSessionDialog } from '../components/navigation/LeaveSessionDialog'
import { ToastLayer } from '../components/navigation/ToastLayer'
import { LevelUpPopup } from '../components/navigation/LevelUpPopup'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { UpgradePanel } from '../components/pro/UpgradePanel'
import { UpgradeModalHost } from '../components/pro/UpgradeModalHost'
import { useIsPro, useEntitlementStore } from '../store/entitlement-store'
import { useCasinoTrialStore, useTrialOpen } from '../store/casino-trial-store'
import { useLearnerSync } from '../hooks/use-learner-sync'
import { isModeLocked } from '../services/pro-features'
import { useModeUrl } from '../hooks/use-mode-url'
import { settleAbandonedSession, settleSavedSession } from '../components/casino-session/record-session'
import { LIVE_SESSION_KEY } from '../services/casino-live-session'

// Modes whose page relies on the app shell for scrolling. Analytics, Achievements
// and the Casino Session Tracker are excluded: their pages scroll themselves
// (flex-1 overflow-y-auto), so also scrolling here would double up and can trap
// scrolling to part of the view.
const SCROLLABLE_MODES = new Set([
  'home', 'bankrollSim',
  'casinoSession', 'strategyChart', 'learn', 'plan',
])

/**
 * The signed-in trainer shell — everything under the `/app` route. Routes to the
 * active training mode based on app-store.currentMode (unchanged mode-switching
 * behaviour); Pro-gated modes show the upgrade paywall when the user isn't Pro.
 */
export function TrainerApp() {
  usePageMeta('app', '/app')
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const isPro = useIsPro()
  /*
    The casino table's free trial (`services/casino-trial.ts`). The table is
    open to an account without Pro while trial hands remain — and while a
    trial table is still on screen: the last hand is counted when it is
    settled, and its review and the summary come after that.
  */
  const trialOpen = useTrialOpen()
  const trialSeated = useCasinoTrialStore(s => s.seated)
  const tableOpen = isPro || trialOpen || trialSeated
  const locked = isModeLocked(currentMode, isPro, trialOpen || trialSeated)
  const scrollable = SCROLLABLE_MODES.has(currentMode) || locked

  /**
   * The Casino Session outlives a mode change.
   *
   * Its engine, shoe, hands and clock live in refs inside `useGameLoop`, so
   * unmounting the component destroys the session outright — which is exactly
   * what used to happen on a click of the wordmark. Keeping it mounted and
   * merely hidden is what lets someone come back to the same hand; `display:
   * none` leaves React state and refs untouched.
   *
   * It therefore lives OUTSIDE the ErrorBoundary keyed on `currentMode`. That
   * key is what makes a crashed screen recoverable, and it would remount the
   * session on every mode change — undoing the whole point.
   */
  const casinoLive = useLiveSessionStore(s => s.activeMode === 'casinoSession')
  const casinoVisible = currentMode === 'casinoSession' && !locked
  // Losing Pro takes the session with it: a paused hand behind a paywall is
  // not something to keep alive, and the guard must stop protecting it. (An
  // account on its trial keeps the table: `tableOpen`. Not `!isPro` — the
  // trial table reports its session from a child effect, which runs before
  // this one, and would be ended the moment it began.)
  const casinoMounted = (casinoVisible || casinoLive) && tableOpen

  useEffect(() => {
    if (!tableOpen) useLiveSessionStore.getState().endSession()
  }, [tableOpen])

  /*
    A trial table saved on this device whose hands are used up — the page was
    closed between the last card and the summary. It cannot be sat at again,
    so it is not offered: it is cashed out here, the way a table nobody came
    back to is, and its result is in the statistics when the paywall asks for
    it. Only once the server has said the account has no Pro, and never the
    table that is on screen in this tab.
  */
  const savedTrialTable = useLiveSessionStore(s => (s.saved?.trial ? s.saved.id : null))
  const entitlementLoaded = useEntitlementStore(s => s.loaded)
  const trialUsedUp = useCasinoTrialStore(s => s.known) && !trialOpen
  useEffect(() => {
    if (savedTrialTable && entitlementLoaded && !isPro && trialUsedUp && !trialSeated && !casinoLive) {
      void settleSavedSession(savedTrialTable)
    }
  }, [savedTrialTable, entitlementLoaded, isPro, trialUsedUp, trialSeated, casinoLive])

  /**
   * A casino table saved on this device — left by a closed tab, a reload or a
   * dead phone.
   *
   * Looked at once when the app opens: a table nobody came back to for a day
   * is cashed out there and then, silently, so the hands played at it are not
   * lost; anything younger is published for the resume card on the home
   * screen. The `storage` listener keeps that card honest when another tab
   * continues the table or cashes it out.
   */
  useEffect(() => {
    void settleAbandonedSession()
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === LIVE_SESSION_KEY) useLiveSessionStore.getState().refreshSaved()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Feed the training plan's stage to the challenge engines, so all of them
  // agree on where this learner is.
  useLearnerSync()

  // Every screen has an address: Back, Forward, refresh and links work.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useModeUrl(scrollerRef)

  // No redirect here any more: `home` *is* the plan, so an unplaced learner
  // already lands on the questionnaire without navigation being hijacked.

  // The shell is exactly one viewport tall and never scrolls itself.
  //
  // It used to carry `overflow-y-auto` for some modes while the NavBar (62px,
  // in flow) sat inside it and the mode content asked for `min-h-full` — i.e.
  // another full viewport. Result: a scrollbar on every home visit whose
  // overflow was *exactly the header height*, independent of content. Measured
  // at 1280x800: shell 800px, content 862px, header 62px.
  //
  // Now the header takes its natural height and the mode content gets the
  // remainder via `flex-1 min-h-0`, scrolling inside itself. `min-h-0` is
  // load-bearing: a flex child defaults to `min-height:auto`, which refuses to
  // shrink below its content and would push the overflow back onto the shell.
  //
  // `h-dvh` after `h-screen`: on a phone 100vh is taller than the visible page
  // while the browser's address bar shows, and the bottom of every screen sits
  // behind it. Browsers without dvh keep `h-screen`.
  return (
    <div className="app-canvas h-screen h-dvh flex flex-col overflow-hidden transition-colors duration-200">
      {/* At the table, the table has the screen. The app's navigation took 62px
          of a 730px laptop window from a felt that is fitted to the height
          left over — every pixel of it is card size. The session's own bar
          carries the way back, the sound switch, pause and cash out. */}
      {!(casinoVisible && casinoLive) && <NavBar />}
      {/* Reset key on the mode so switching screens clears a crashed one. A render
          error shows a recoverable fallback instead of blanking the whole app. */}
      {/* The `:has` rule: while a casino table is running its own status bar
          carries the way back (see `CasinoSessionGame`), and the 44px row for it
          is given to the felt instead. */}
      <div ref={scrollerRef} className={`flex-1 min-h-0 flex flex-col [&:has([data-testid=session-hud])>[data-testid=back-to-menu-bar]]:hidden ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {/* Every screen but the menu gets the arrow back to it — the Casino
            Session included, above the felt. It was left out at first because
            its HUD has an exit of its own; the first person to use the app
            looked for the arrow there and did not find it. One convention on
            every screen beats a second one on the one screen that differs. */}
        {currentMode !== 'home' && <BackToMenu />}
        {/* Persistent, so a mode change does not destroy a running session.
            Hidden rather than unmounted; its own boundary, unkeyed. */}
        {casinoMounted && (
          <div
            className={casinoVisible ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}
            data-testid="casino-session-mount"
            aria-hidden={!casinoVisible}
          >
            <ErrorBoundary onReset={() => setMode('home')}>
              <CasinoSession backgrounded={!casinoVisible} />
            </ErrorBoundary>
          </div>
        )}
        <ErrorBoundary key={currentMode} onReset={() => setMode('home')}>
        {locked ? (
          <div className="flex-1 flex items-start justify-center p-4 md:p-8">
            {/* Where the table would be, the paywall speaks about the table:
                to someone who played the trial, about their own hands. */}
            <UpgradePanel atTable={currentMode === 'casinoSession'} />
          </div>
        ) : (
          <>
            {currentMode === 'home' && <HomeScreen />}
            {currentMode === 'speedDrill' && <SpeedDrill />}
            {currentMode === 'deviationTraining' && <DeviationTraining />}
            {currentMode === 'betSpread' && <BetSpread />}
            {currentMode === 'deckEstimation' && <DeckEstimation />}
            {currentMode === 'analytics' && <AnalyticsDashboard />}
            {currentMode === 'bankrollSim' && <BankrollSimulator />}
            {currentMode === 'achievements' && <AchievementsPage />}
            {/* The Casino Session is not listed here: it is mounted above so it
                survives a mode change. Putting it back would give it a second,
                keyed instance — two engines, two shoes, one visible. */}
            {currentMode === 'strategyChart' && <StrategyChart />}
            {currentMode === 'casinoSessionTracker' && <CasinoSessionTracker />}
            {currentMode === 'learn' && <LearnChapters />}
            {currentMode === 'plan' && <TrainingPlan />}
          </>
        )}
        </ErrorBoundary>
      </div>
      {/* Outside the keyed ErrorBoundary on purpose: the dialog asks about the
          mode you are leaving, and a boundary keyed on `currentMode` would tear
          it down at the exact moment it is needed. */}
      <LeaveSessionDialog />
      {/* One layer for both toasts, under the header and clear of every
          screen's main button (see `ToastLayer`). */}
      <ToastLayer />
      <LevelUpPopup />
      <UpgradeModalHost />
    </div>
  )
}
