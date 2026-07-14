import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/**
 * Gate for authenticated routes (`/app`, `/account`). When Supabase isn't
 * configured (local dev without a backend, and the test env) there is no auth,
 * so it renders through. Otherwise: a spinner while the session resolves, a
 * redirect to `/login` when signed out, and the protected content when signed in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore(s => s.status)

  if (!isSupabaseConfigured) return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-casino-bg text-content/50">
        <Loader2 size={28} className="animate-spin" />
      </div>
    )
  }
  if (status === 'signedOut') return <Navigate to="/login" replace />

  return <>{children}</>
}
