import './index.css'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from './store/app-store'
import { useAuthStore, isSupabaseConfigured } from './store/auth-store'
import { handleSignedIn } from './services/supabase/cloud-sync'
import { AuthPage } from './components/auth/AuthPage'
import { HomeScreen } from './components/navigation/HomeScreen'
import { NavBar } from './components/navigation/NavBar'
import { SpeedDrill } from './components/training/SpeedDrill'
import { DeviationTraining } from './components/training/DeviationTraining'
import { BetSpread } from './components/training/BetSpread'
import { DeckEstimation } from './components/training/DeckEstimation'
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard'
import { BankrollSimulator } from './components/simulator/BankrollSimulator'
import { AchievementsPage } from './components/achievements/AchievementsPage'
import { CasinoSession } from './components/casino-session/CasinoSession'
import { StrategyChart } from './components/strategy-chart/StrategyChart'
import { CasinoSessionTracker } from './components/training/CasinoSessionTracker'
import { LearnPage } from './components/learn/LearnPage'
import { AchievementToast } from './components/achievements/AchievementToast'
import { LevelUpPopup } from './components/navigation/LevelUpPopup'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { UpgradePanel } from './components/pro/UpgradePanel'
import { UpgradeModalHost } from './components/pro/UpgradeModalHost'
import { useIsPro, useEntitlementStore } from './store/entitlement-store'
import { isProMode } from './services/pro-features'

/**
 * Root application component.
 * Routes to the active training mode based on app-store.currentMode.
 */
// Modes whose page relies on the app shell for scrolling. Analytics, Achievements
// and the Casino Session Tracker are excluded: their pages scroll themselves
// (flex-1 overflow-y-auto), so also scrolling here would double up and can trap
// scrolling to part of the view.
const SCROLLABLE_MODES = new Set([
  'home', 'bankrollSim',
  'casinoSession', 'strategyChart', 'learn',
])

function App() {
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const isPro = useIsPro()
  const locked = isProMode(currentMode) && !isPro
  const scrollable = SCROLLABLE_MODES.has(currentMode) || locked

  // Load the auth session once. Harmless (resolves to signed-out) when Supabase
  // isn't configured yet, in which case the gate below stays inactive.
  const authStatus = useAuthStore(s => s.status)
  const initAuth = useAuthStore(s => s.init)
  useEffect(() => { initAuth() }, [initAuth])

  // On sign-in: migrate local sessions to the cloud (once) and hydrate from it.
  useEffect(() => {
    if (authStatus === 'signedIn') handleSignedIn()
  }, [authStatus])

  // Returning from Stripe Checkout (?checkout=success): the entitlement webhook
  // lands a beat after the redirect, so poll until Pro flips on. Strip the param
  // first so a manual refresh doesn't re-trigger the poll.
  useEffect(() => {
    if (authStatus !== 'signedIn') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') !== 'success') return
    params.delete('checkout')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    useEntitlementStore.getState().refreshUntilPro()
  }, [authStatus])

  // Login gate — only active once Supabase is configured.
  if (isSupabaseConfigured) {
    if (authStatus === 'loading') {
      return (
        <div className="h-screen flex items-center justify-center bg-casino-bg text-content/50">
          <Loader2 size={28} className="animate-spin" />
        </div>
      )
    }
    if (authStatus === 'signedOut') {
      return (
        <div className="h-screen flex flex-col bg-casino-bg">
          <AuthPage />
        </div>
      )
    }
  }

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

export default App
