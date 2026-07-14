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
import { AchievementToast } from '../components/achievements/AchievementToast'
import { LevelUpPopup } from '../components/navigation/LevelUpPopup'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { UpgradePanel } from '../components/pro/UpgradePanel'
import { UpgradeModalHost } from '../components/pro/UpgradeModalHost'
import { useIsPro } from '../store/entitlement-store'
import { isProMode } from '../services/pro-features'

// Modes whose page relies on the app shell for scrolling. Analytics, Achievements
// and the Casino Session Tracker are excluded: their pages scroll themselves
// (flex-1 overflow-y-auto), so also scrolling here would double up and can trap
// scrolling to part of the view.
const SCROLLABLE_MODES = new Set([
  'home', 'bankrollSim',
  'casinoSession', 'strategyChart', 'learn',
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

  return (
    <div className={`h-screen flex flex-col bg-casino-bg transition-colors duration-200 ${scrollable ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      <NavBar />
      {/* Reset key on the mode so switching screens clears a crashed one. A render
          error shows a recoverable fallback instead of blanking the whole app. */}
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
          </>
        )}
      </ErrorBoundary>
      <AchievementToast />
      <LevelUpPopup />
      <UpgradeModalHost />
    </div>
  )
}
