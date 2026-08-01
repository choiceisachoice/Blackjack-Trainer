import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Crown, LogOut, ExternalLink, Loader2 } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { useEntitlementStore, useIsPro } from '../store/entitlement-store'
import { openBillingPortal, startCheckout } from '../services/supabase/billing'
import { signOutAndClearLocal } from '../services/supabase/cloud-sync'

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
  const isPro = useIsPro()
  const status = useEntitlementStore(s => s.status)
  const loaded = useEntitlementStore(s => s.loaded)
  const currentPeriodEnd = useEntitlementStore(s => s.currentPeriodEnd)
  const loadEntitlement = useEntitlementStore(s => s.loadEntitlement)
  const [busy, setBusy] = useState<null | 'portal' | 'checkout'>(null)
  /**
   * Why a failure here needs saying out loud.
   *
   * Both actions call an Edge Function and only then redirect, so a failure
   * leaves the page looking exactly as it did before: the button spun, stopped,
   * and nothing else happened. That is bad on the upgrade path and worse on the
   * *cancel* path — someone trying to stop paying, told nothing, reasonably
   * concludes the product will not let them, and the next step is their bank
   * rather than support.
   */
  const [billingError, setBillingError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (isSupabaseConfigured && !loaded) void loadEntitlement()
  }, [loaded, loadEntitlement])

  const plan = planLabel(status, isPro)
  const periodEnd = formatDate(currentPeriodEnd)
  const renewLabel = status === 'trialing' ? 'Trial ends' : status === 'past_due' ? 'Payment due by' : 'Renews on'

  // Both leave `busy` set on the success path on purpose: the browser is on its
  // way to Stripe, and re-enabling would offer a second session mid-redirect.
  async function manage() {
    setBillingError(null)
    setBusy('portal')
    try {
      await openBillingPortal()
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : 'Could not open the billing portal.')
      setBusy(null)
    }
  }
  async function upgrade() {
    setBillingError(null)
    setBusy('checkout')
    try {
      await startCheckout('yearly')
    } catch (e) {
      setBillingError(e instanceof Error ? e.message : 'Could not start checkout.')
      setBusy(null)
    }
  }
  /**
   * The same sign-out the nav bar performs, and it was not before.
   *
   * This page called the auth store's bare `signOut`, which revokes the session
   * and leaves every local cache in place — training history, achievements,
   * level and the real-money bankroll log. `handleSignedIn` then treats all of
   * it as belonging to whoever signs in next on this machine. Two ways out of
   * the app, two different behaviours, and this was the wrong one.
   */
  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOutAndClearLocal()
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
              {/* `role="alert"` so it is announced rather than merely drawn —
                  the person who most needs this is not necessarily looking at
                  the button they just pressed. */}
              {billingError && (
                <p className="mt-4 text-sm text-error" role="alert">{billingError}</p>
              )}
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
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            data-testid="account-sign-out"
            className="mt-4 inline-flex items-center gap-2 text-sm text-content/60 hover:text-error transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
