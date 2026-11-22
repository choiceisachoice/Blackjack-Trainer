import { Navigate, useLocation } from 'react-router-dom'
import { AuthPage } from '../components/auth/AuthPage'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { usePageMeta } from '../hooks/use-page-meta'

/**
 * The `/login` route. Redirects into the app once signed in (or when there's no
 * backend, where auth is moot); otherwise shows the login/register form.
 */
export function LoginPage() {
  usePageMeta('login', '/login')
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
  // Where the visitor was going. Since every screen has its own address, a
  // link from a video to `/app/casino` meets this page first when signed out;
  // after signing in it should arrive at the casino, not at the home screen.
  // Only ever a path inside the app — never a URL someone could hand us.
  const from = (state as { from?: unknown } | null)?.from
  const target = typeof from === 'string' && /^\/app(\/[a-z-]*)?$/.test(from) ? from : '/app'

  // A link that says "create an account" (the end of the trial round) opens
  // the form on that side.
  const signup = (state as { mode?: unknown } | null)?.mode === 'signup'

  if (!isSupabaseConfigured || status === 'signedIn') {
    return <Navigate to={target} replace />
  }

  return (
    <div className="app-canvas h-screen flex flex-col">
      <AuthPage notice={notice} initialMode={signup ? 'signup' : 'signin'} />
    </div>
  )
}
