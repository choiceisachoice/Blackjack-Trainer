import { Navigate } from 'react-router-dom'
import { AuthPage } from '../components/auth/AuthPage'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/**
 * The `/login` route. Redirects into the app once signed in (or when there's no
 * backend, where auth is moot); otherwise shows the login/register form.
 */
export function LoginPage() {
  const status = useAuthStore(s => s.status)

  if (!isSupabaseConfigured || status === 'signedIn') {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="h-screen flex flex-col bg-casino-bg">
      <AuthPage />
    </div>
  )
}
