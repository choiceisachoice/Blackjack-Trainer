import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth-store'
import { handleSignedIn } from './services/supabase/cloud-sync'
import { useEntitlementStore } from './store/entitlement-store'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { TrainerApp } from './pages/TrainerApp'
import { AccountPage } from './pages/AccountPage'
import { ProtectedRoute } from './routes/ProtectedRoute'

/**
 * Root router shell. Holds the app-wide session effects (auth init, cloud-sync
 * on sign-in, entitlement refresh after Stripe Checkout) and maps the routes:
 * `/` public landing · `/login` · `/app` (gated trainer) · `/account` (gated).
 */
function App() {
  const authStatus = useAuthStore(s => s.status)
  const initAuth = useAuthStore(s => s.init)

  // Load the auth session once. Harmless (resolves to signed-out) when Supabase
  // isn't configured yet.
  useEffect(() => { initAuth() }, [initAuth])

  // On sign-in: migrate local data to the cloud (once) and hydrate from it.
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

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<ProtectedRoute><TrainerApp /></ProtectedRoute>} />
      <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
