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

/**
 * Root application component.
 * Routes to the active training mode based on app-store.currentMode.
 */
function App() {
  const currentMode = useAppStore(s => s.currentMode)

  if (currentMode === 'home') {
    return <HomeScreen />
  }

  return (
    <div className="h-screen flex flex-col bg-casino-bg overflow-hidden">
      <TopBar />
      {currentMode === 'speedDrill' && <SpeedDrill />}
      {currentMode === 'tableCounting' && <TableCounting />}
      {currentMode === 'deviationTraining' && <DeviationTraining />}
      {currentMode === 'betSpread' && <BetSpread />}
      {currentMode === 'deckEstimation' && <DeckEstimation />}
    </div>
  )
}

export default App
