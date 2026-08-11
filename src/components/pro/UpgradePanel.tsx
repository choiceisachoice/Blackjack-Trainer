import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Crown, Loader2, X } from 'lucide-react'
import {
  PLAN_OPTIONS,
  FEATURE_GROUPS,
  formatCHF,
  yearlySaving,
  CH_VAT_PERCENT,
} from '../../services/pro-features'
import type { ComparisonRow } from '../../services/pro-features'
import { startCheckout } from '../../services/supabase/billing'
import type { BillingPlan } from '../../services/supabase/billing'
import { useEntitlementStore } from '../../store/entitlement-store'

interface UpgradePanelProps {
  /** Optional context line, e.g. the locked feature the user tried to open. */
  headline?: string
}

/**
 * The Pro paywall: a side-by-side comparison of what you have and what Pro adds,
 * plus the plan choice that starts Stripe Checkout.
 *
 * Deliberately a *comparison* rather than a feature advert: showing the free
 * tier's entries with a tick and the paid ones with a cross makes the gap
 * concrete, which a one-sided list of benefits never does. The yearly discount
 * is derived from the amounts (see `yearlySaving`) instead of written into copy.
 */
export function UpgradePanel({ headline }: UpgradePanelProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [plan, setPlan] = useState<BillingPlan>('yearly')
  const loadEntitlement = useEntitlementStore(s => s.loadEntitlement)

  const saving = yearlySaving()
  const selected = PLAN_OPTIONS.find(p => p.id === plan)!
  const monthly = PLAN_OPTIONS.find(p => p.id === 'monthly')!
  const isYearly = plan === 'yearly'

  const choose = async () => {
    setError(null)
    setNotice(null)
    setBusy(plan)
    try {
      const outcome = await startCheckout(plan) // redirects on success
      if (outcome === 'already-subscribed') {
        // Stripe already bills this account, so this paywall is on screen only
        // because the local entitlement is out of date. Re-reading it normally
        // unmounts the panel outright. If it does not — the profile row and
        // Stripe genuinely disagree — the message below is the only thing
        // standing between the user and a button that appears to do nothing.
        await loadEntitlement()
        setNotice('You already have Pro on this account. If it still looks locked, reload the page.')
        setBusy(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
      setBusy(null)
    }
  }

  return (
    <div className="surface max-w-3xl w-full p-6 md:p-8 flex flex-col items-center gap-6">
      {/* Heading */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gold/10 text-gold">
          <Crown size={26} />
        </span>
        <h2 className="text-2xl font-semibold text-gold-gradient">Go Pro</h2>
        <p className="text-sm text-content/60 max-w-sm">
          {headline ?? 'Unlock the advanced modes and the full picture of your card-counting edge.'}
        </p>
      </div>

      {/* Billing period */}
      <div className="inline-flex bg-surface-2 border border-white/8 rounded-xl p-1 gap-1">
        {PLAN_OPTIONS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlan(p.id)}
            aria-pressed={plan === p.id}
            data-testid={`billing-${p.id}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
              plan === p.id
                ? 'bg-gradient-to-br from-gold-bright to-gold text-casino-bg'
                : 'text-content/60 hover:text-content'
            }`}
          >
            {p.label}
            {p.id === 'yearly' && (
              <span className={plan === p.id ? 'text-casino-bg/70' : 'text-gold'}>
                {' '}−{saving.percent}%
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Comparison */}
      <div className="w-full grid gap-4 sm:grid-cols-2 items-stretch">
        {/* Free — what you already have */}
        <div className="rounded-2xl border border-white/8 bg-white/[.015] p-5 flex flex-col">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold tracking-[0.16em] uppercase text-content/50">Free</span>
            <span className="text-xs text-content/40">Your plan</span>
          </div>
          <div className="mt-3 text-2xl font-extrabold text-content/70">{formatCHF(0)}</div>

          <div className="mt-4 flex flex-col gap-4">
            {FEATURE_GROUPS.map(group => (
              <div key={group.title}>
                <GroupTitle>{group.title}</GroupTitle>
                <div className="flex flex-col gap-2 text-sm">
                  {group.rows.map(row => <FreeRow key={row.label} row={row} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pro */}
        <div className="relative rounded-2xl border border-gold/45 p-5 flex flex-col
          bg-[linear-gradient(180deg,rgba(24,20,10,.6),var(--color-surface))]
          shadow-[0_0_0_1px_rgba(212,168,71,.14),0_30px_70px_-50px_rgba(212,168,71,.5)]">
          {isYearly && (
            <span className="absolute -top-2.5 right-5 text-[0.6875rem] font-extrabold tracking-wider
              text-casino-bg bg-gradient-to-br from-gold-bright to-gold px-2.5 py-0.5 rounded-full">
              BEST VALUE
            </span>
          )}

          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold tracking-[0.16em] uppercase text-gold">Pro</span>
          </div>

          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            {isYearly && (
              <span className="text-base text-content/35 line-through tabular-nums">
                {formatCHF(saving.monthlyTotal)}
              </span>
            )}
            <span className="text-3xl font-extrabold tabular-nums">{formatCHF(selected.amount)}</span>
            <span className="text-sm text-content/50">{selected.cadence}</span>
          </div>
          <div className="mt-1 text-xs text-gold min-h-4">
            {isYearly
              ? `Save ${formatCHF(saving.saved)} against ${formatCHF(monthly.amount)}/month`
              : 'Flexible — switch to yearly anytime'}
          </div>
          <div className="mt-1 text-xs text-content/45" data-testid="paywall-vat-note">{t('pricing.vatNote', { rate: CH_VAT_PERCENT })}</div>

          {/* Above the feature list on purpose: the groups make this column tall
              enough to push a bottom-anchored button off-screen, and someone who
              is already convinced shouldn't have to scroll past the argument to
              find the buy button. */}
          <button
            onClick={choose}
            disabled={busy !== null}
            data-testid={`upgrade-${plan}`}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3
              font-semibold cursor-pointer transition-colors disabled:opacity-60
              bg-gradient-to-br from-gold-bright to-gold text-casino-bg"
          >
            {busy !== null && <Loader2 size={16} className="animate-spin" />}
            Go Pro — {formatCHF(selected.amount)}{selected.cadence}
          </button>

          <div className="mt-5 flex flex-col gap-4">
            {FEATURE_GROUPS.map(group => (
              <div key={group.title}>
                <GroupTitle gold>{group.title}</GroupTitle>
                <div className="flex flex-col gap-2 text-sm">
                  {group.rows.map(row => (
                    <div key={row.label} className="flex gap-2.5 items-start text-content/85">
                      <Check size={15} className="text-gold shrink-0 mt-0.5" />
                      {row.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      {notice && <p className="text-sm text-gold" role="status" data-testid="upgrade-notice">{notice}</p>}

      <p className="text-xs text-content/40 text-center">
        Secure checkout by Stripe. Cancel anytime from your account.
      </p>
    </div>
  )
}

/** Section label above a group of compared capabilities. */
function GroupTitle({ children, gold = false }: { children: string; gold?: boolean }) {
  return (
    <div className={`text-[0.6875rem] font-bold tracking-[0.16em] uppercase mb-2 ${
      gold ? 'text-gold/70' : 'text-content/35'
    }`}>
      {children}
    </div>
  )
}

/**
 * One capability as the free tier gets it.
 *
 * Three states, not two: `partial` is the honest one — the Strategy Chart and
 * the analytics *are* in the free tier, just not completely. Marking those with
 * a cross would be a lie, marking them with a plain tick would hide the reason
 * to upgrade.
 */
function FreeRow({ row }: { row: ComparisonRow }) {
  if (row.free === 'none') {
    return (
      <div className="flex gap-2.5 items-start text-content/25">
        <X size={15} className="shrink-0 mt-0.5" />
        <span className="line-through decoration-content/20">{row.label}</span>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5 items-start text-content/70">
      <Check size={15} className="text-content/40 shrink-0 mt-0.5" />
      <span>
        {row.label}
        {row.free === 'partial' && row.freeNote && (
          <span className="text-content/35"> — {row.freeNote} only</span>
        )}
      </span>
    </div>
  )
}
