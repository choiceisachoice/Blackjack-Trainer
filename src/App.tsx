import './index.css'
import { useAppStore } from './store/app-store'
import { HomeScreen } from './components/navigation/HomeScreen'
import { TopBar } from './components/navigation/TopBar'
import { GameTable } from './components/table/GameTable'
import { SpeedDrill } from './components/training/SpeedDrill'
import { TableCounting } from './components/training/TableCounting'
import { DeviationTraining } from './components/training/DeviationTraining'
import { BetSpread } from './components/training/BetSpread'
import { DeckEstimation } from './components/training/DeckEstimation'
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard'
import { BankrollSimulator } from './components/simulator/BankrollSimulator'
import { AchievementsPage } from './components/achievements/AchievementsPage'
import { CasinoSession } from './components/casino-session/CasinoSession'
import { StrategyChart } from './components/strategy-chart/StrategyChart'
import { CasinoSessionTracker } from './components/training/CasinoSessionTracker'
import { AchievementToast } from './components/achievements/AchievementToast'
import { LevelUpPopup } from './components/navigation/LevelUpPopup'

/**
 * Root application component.
 * Routes to the active training mode based on app-store.currentMode.
 */
function App() {
  const currentMode = useAppStore(s => s.currentMode)
  if (currentMode === 'home') {
    return (
      <>
        <HomeScreen />
        <AchievementToast />
        <LevelUpPopup />
      </>
    )
  }

  return (
    <div className={`h-screen flex flex-col bg-casino-bg transition-colors duration-200 ${currentMode === 'analytics' || currentMode === 'bankrollSim' || currentMode === 'achievements' || currentMode === 'casinoSession' || currentMode === 'strategyChart' || currentMode === 'casinoSessionTracker' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      <TopBar />
      {currentMode === 'speedDrill' && <SpeedDrill />}
      {currentMode === 'tableCounting' && <TableCounting />}
      {currentMode === 'deviationTraining' && <DeviationTraining />}
      {currentMode === 'betSpread' && <BetSpread />}
      {currentMode === 'deckEstimation' && <DeckEstimation />}
      {currentMode === 'analytics' && <AnalyticsDashboard />}
      {currentMode === 'bankrollSim' && <BankrollSimulator />}
      {currentMode === 'achievements' && <AchievementsPage />}
      {currentMode === 'casinoSession' && <CasinoSession />}
      {currentMode === 'strategyChart' && <StrategyChart />}
      {currentMode === 'casinoSessionTracker' && <CasinoSessionTracker />}
      <AchievementToast />
      <LevelUpPopup />
    </div>
  )
}

export default App
