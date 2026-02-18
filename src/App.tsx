import './index.css'
import { useAppStore } from './store/app-store'
import { HomeScreen } from './components/navigation/HomeScreen'
import { TopBar } from './components/navigation/TopBar'
import { GameTable } from './components/table/GameTable'
import { SpeedDrill } from './components/training/SpeedDrill'
import { TableCounting } from './components/training/TableCounting'

/**
 * Placeholder screen for training modes not yet implemented.
 */
function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <span className="text-5xl">🚧</span>
      <h2 className="text-2xl font-bold text-white">{name}</h2>
      <p className="text-white/50">Coming soon</p>
    </div>
  )
}

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
      {currentMode === 'deviationTraining' && <ComingSoon name="Deviation Training" />}
      {currentMode === 'betSpread' && <ComingSoon name="Bet Spread" />}
      {currentMode === 'deckEstimation' && <ComingSoon name="Deck Estimation" />}
    </div>
  )
}

export default App
