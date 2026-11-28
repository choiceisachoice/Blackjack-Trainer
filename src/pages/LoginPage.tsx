import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { SignupContext } from '../components/auth/SignupContext'
import { peekPendingCheckout } from '../components/auth/pending-checkout'
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
  const { state, search } = useLocation()
  const notice = (state as { notice?: string } | null)?.notice
  // Where the visitor was going. Since every screen has its own address, a
  // link from a video to `/app/casino` meets this page first when signed out;
  // after signing in it should arrive at the casino, not at the home screen.
  // Only ever a path inside the app — never a URL someone could hand us.
  const from = (state as { from?: unknown } | null)?.from
  const target = typeof from === 'string' && /^\/app(\/[a-z-]*)?$/.test(from) ? from : '/app'

  // A link that says "create an account" — every "Start free", every "Go
  // Pro" for someone signed out, the end of the trial round — opens the form
  // on that side. Router state from a button; `?mode=signup` from a plain
  // link, which works in the prerendered HTML before any script has run.
  const signup = (state as { mode?: unknown } | null)?.mode === 'signup'
    || new URLSearchParams(search).get('mode') === 'signup'
  // Read once per arrival: the purchase this page is step 1 of, if any.
  const [pending] = useState(peekPendingCheckout)
  const aside = pending || signup ? <SignupContext plan={pending} /> : undefined

  if (!isSupabaseConfigured || status === 'signedIn') {
    return <Navigate to={target} replace />
  }

  return (
    // Padded by the cookie bar's height while it is open (`--cookie-bar`,
    // published by the bar): on a 720px screen or a phone the bar otherwise
    // covered "Create account" on a page too short to scroll it free.
    <div className="app-canvas min-h-[100dvh] flex flex-col" style={{ paddingBottom: 'var(--cookie-bar, 0px)' }}>
      <AuthPage notice={notice} initialMode={signup ? 'signup' : 'signin'} aside={aside} />
    </div>
  )
}
