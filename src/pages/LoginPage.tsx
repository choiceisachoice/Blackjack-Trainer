import { Navigate, useLocation } from 'react-router-dom'
import { AuthPage } from '../components/auth/AuthPage'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/**
 * The `/login` route. Redirects into the app once signed in (or when there's no
 * backend, where auth is moot); otherwise shows the login/register form.
 */
export function LoginPage() {
  const status = useAuthStore(s => s.status)
  /**
   * A message carried here from somewhere else — right now, the password-reset
   * page saying the change went through.
   *
   * Read here rather than in `AuthPage` on purpose. The page knows about
   * routing; the form does not, and should not have to be mounted inside a
   * router to be rendered or tested.
   */
  const { state } = useLocation()
  const notice = (state as { notice?: string } | null)?.notice

  if (!isSupabaseConfigured || status === 'signedIn') {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="app-canvas h-screen flex flex-col">
      <AuthPage notice={notice} />
    </div>
  )
}
