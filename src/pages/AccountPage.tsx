import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Crown, LogOut, ExternalLink, Loader2 } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { useEntitlementStore, useIsPro } from '../store/entitlement-store'
import { openBillingPortal, startCheckout } from '../services/supabase/billing'

/** Human-readable label + tone for a subscription status. */
function planLabel(status: string, isPro: boolean): { title: string; tone: 'gold' | 'muted' | 'warn' } {
  if (!isPro) return { title: 'Free plan', tone: 'muted' }
  switch (status) {
    case 'trialing': return { title: 'Pro — trial', tone: 'gold' }
    case 'past_due': return { title: 'Pro — payment due', tone: 'warn' }
    default: return { title: 'Pro — active', tone: 'gold' }
  }
}

function formatDate(ms: number | null): string | null {
  if (!ms) return null
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * `/account` — subscription & billing. Shows the current plan and routes to the
 * Stripe customer portal (Manage / Cancel) for Pro users, or to checkout for
 * free users. Also surfaces the signed-in email and sign-out.
 */
export function AccountPage() {
  const navigate = useNavigate()
  const email = useAuthStore(s => s.user?.email ?? null)
  const signOut = useAuthStore(s => s.signOut)
  const isPro = useIsPro()
  const status = useEntitlementStore(s => s.status)
  const loaded = useEntitlementStore(s => s.loaded)
  const currentPeriodEnd = useEntitlementStore(s => s.currentPeriodEnd)
  const loadEntitlement = useEntitlementStore(s => s.loadEntitlement)
  const [busy, setBusy] = useState<null | 'portal' | 'checkout'>(null)

  useEffect(() => {
    if (isSupabaseConfigured && !loaded) void loadEntitlement()
  }, [loaded, loadEntitlement])

  const plan = planLabel(status, isPro)
  const periodEnd = formatDate(currentPeriodEnd)
  const renewLabel = status === 'trialing' ? 'Trial ends' : status === 'past_due' ? 'Payment due by' : 'Renews on'

  async function manage() {
    setBusy('portal')
    try { await openBillingPortal() } catch (e) { console.error('portal failed', e); setBusy(null) }
  }
  async function upgrade() {
    setBusy('checkout')
    try { await startCheckout('yearly') } catch (e) { console.error('checkout failed', e); setBusy(null) }
  }
  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> Back to app
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Account</h1>

        {/* Plan card */}
        <div className="surface rounded-2xl p-6 mt-6">
          {!loaded && isSupabaseConfigured ? (
            <div className="flex items-center gap-2 text-content/50 py-4"><Loader2 size={18} className="animate-spin" /> Loading your plan…</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl grid place-items-center ${plan.tone === 'gold' ? 'bg-gold/12 border border-gold/25 text-gold' : plan.tone === 'warn' ? 'bg-warning/12 border border-warning/25 text-warning' : 'bg-white/5 border border-white/10 text-content/60'}`}>
                    <Crown size={20} />
                  </span>
                  <div>
                    <div className="font-bold text-lg">{plan.title}</div>
                    {isPro && periodEnd && <div className="text-sm text-content/50">{renewLabel} {periodEnd}</div>}
                    {!isPro && <div className="text-sm text-content/50">Upgrade to unlock the casino table, deviations and full analytics.</div>}
                  </div>
                </div>
                {isPro ? (
                  <button onClick={manage} disabled={busy !== null} className="rounded-xl px-5 py-3 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-60">
                    {busy === 'portal' ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />} Manage subscription
                  </button>
                ) : (
                  <button onClick={upgrade} disabled={busy !== null} className="rounded-xl px-5 py-3 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer inline-flex items-center gap-2 disabled:opacity-60">
                    {busy === 'checkout' ? <Loader2 size={16} className="animate-spin" /> : null} Go Pro →
                  </button>
                )}
              </div>
              {!isPro && (
                <Link to="/#pricing" className="inline-block mt-4 text-sm text-gold hover:text-gold-bright">Compare plans →</Link>
              )}
            </>
          )}
        </div>

        {/* Account info */}
        <div className="surface rounded-2xl p-6 mt-4">
          <div className="text-sm uppercase tracking-wide text-content/50 font-semibold">Account</div>
          {email && <div className="mt-2 text-content">{email}</div>}
          <button onClick={handleSignOut} className="mt-4 inline-flex items-center gap-2 text-sm text-content/60 hover:text-error transition-colors cursor-pointer">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
