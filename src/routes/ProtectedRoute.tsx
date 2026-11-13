import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { AppSkeleton } from '../components/common/AppSkeleton'

/**
 * Gate for authenticated routes (`/app`, `/account`). When Supabase isn't
 * configured (local dev without a backend, and the test env) there is no auth,
 * so it renders through. Otherwise: a spinner while the session resolves, a
 * redirect to `/login` when signed out, and the protected content when signed in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const status = useAuthStore(s => s.status)

  if (!isSupabaseConfigured) return <>{children}</>

  // The signed-in wait: a returning subscriber resolving their session. This is
  // the single most common load in the product, so it gets the outline of the
  // screen they are about to see rather than a spinner in front of it.
  if (status === 'loading') return <AppSkeleton label={t('common.signingIn')} />
  if (status === 'signedOut') return <Navigate to="/login" replace />

  return <>{children}</>
}
