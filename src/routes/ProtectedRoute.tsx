import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { AppLoader } from '../components/common/AppLoader'

/**
 * Gate for authenticated routes (`/app`, `/account`). When Supabase isn't
 * configured (local dev without a backend, and the test env) there is no auth,
 * so it renders through. Otherwise: a spinner while the session resolves, a
 * redirect to `/login` when signed out, and the protected content when signed in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore(s => s.status)

  if (!isSupabaseConfigured) return <>{children}</>

  // The signed-in wait: a returning subscriber resolving their session. This is
  // the single most common load in the product, so it gets the real screen.
  if (status === 'loading') return <AppLoader label="Signing you in" />
  if (status === 'signedOut') return <Navigate to="/login" replace />

  return <>{children}</>
}
