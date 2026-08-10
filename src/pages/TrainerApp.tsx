import { useAppStore } from '../store/app-store'
import { HomeScreen } from '../components/navigation/HomeScreen'
import { NavBar } from '../components/navigation/NavBar'
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
import { LearnPage } from '../components/learn/LearnPage'
import { TrainingPlan } from '../components/plan/TrainingPlan'
import { AchievementToast } from '../components/achievements/AchievementToast'
import { LeaveSessionDialog } from '../components/navigation/LeaveSessionDialog'
import { LevelUpPopup } from '../components/navigation/LevelUpPopup'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { UpgradePanel } from '../components/pro/UpgradePanel'
import { UpgradeModalHost } from '../components/pro/UpgradeModalHost'
import { useIsPro } from '../store/entitlement-store'
import { useLearnerSync } from '../hooks/use-learner-sync'
import { isProMode } from '../services/pro-features'

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
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const isPro = useIsPro()
  const locked = isProMode(currentMode) && !isPro
  const scrollable = SCROLLABLE_MODES.has(currentMode) || locked

  // Feed the training plan's stage to the challenge engines, so all of them
  // agree on where this learner is.
  useLearnerSync()

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
  return (
    <div className="app-canvas h-screen flex flex-col overflow-hidden transition-colors duration-200">
      <NavBar />
      {/* Reset key on the mode so switching screens clears a crashed one. A render
          error shows a recoverable fallback instead of blanking the whole app. */}
      <div className={`flex-1 min-h-0 flex flex-col ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        <ErrorBoundary key={currentMode} onReset={() => setMode('home')}>
        {locked ? (
          <div className="flex-1 flex items-start justify-center p-4 md:p-8">
            <UpgradePanel />
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
            {currentMode === 'casinoSession' && <CasinoSession />}
            {currentMode === 'strategyChart' && <StrategyChart />}
            {currentMode === 'casinoSessionTracker' && <CasinoSessionTracker />}
            {currentMode === 'learn' && <LearnPage />}
            {currentMode === 'plan' && <TrainingPlan />}
          </>
        )}
        </ErrorBoundary>
      </div>
      {/* Outside the keyed ErrorBoundary on purpose: the dialog asks about the
          mode you are leaving, and a boundary keyed on `currentMode` would tear
          it down at the exact moment it is needed. */}
      <LeaveSessionDialog />
      <AchievementToast />
      <LevelUpPopup />
      <UpgradeModalHost />
    </div>
  )
}
