import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth-store'
import { isAppAdmin } from '../services/supabase/app-admin'
import { AppLoader } from '../components/common/AppLoader'

/**
 * Gate for the operator's pages. Sits inside `ProtectedRoute`, so the user
 * is already signed in; this asks whether they are listed in `app_admins`
 * and sends everyone else to the app.
 *
 * It is a courtesy, not the security: the report function refuses a
 * non-admin on its own, and the analytics tables show them no rows. What
 * this guard prevents is a person landing on a page that can only show an
 * error.
 *
 * The answer is remembered together with the user it was given for, so a
 * sign-out on the page does not leave the previous admin's view standing:
 * a different user means no answer yet, and the loader, until the new one
 * arrives.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const userId = useAuthStore(s => s.user?.id ?? null)
  const [answer, setAnswer] = useState<{ userId: string | null; admin: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    void isAppAdmin().then(admin => { if (alive) setAnswer({ userId, admin }) })
    return () => { alive = false }
  }, [userId])

  const admin = answer && answer.userId === userId ? answer.admin : null
  if (admin === null) return <AppLoader label={t('common.loading')} />
  if (!admin) return <Navigate to="/app" replace />
  return <>{children}</>
}
