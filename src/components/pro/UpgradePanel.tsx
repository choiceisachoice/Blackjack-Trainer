import { useState } from 'react'
import { Check, Crown, Loader2 } from 'lucide-react'
import { PLAN_OPTIONS, PRO_BENEFITS } from '../../services/pro-features'
import { startCheckout } from '../../services/supabase/billing'
import type { BillingPlan } from '../../services/supabase/billing'

interface UpgradePanelProps {
  /** Optional context line, e.g. the locked feature the user tried to open. */
  headline?: string
}

/**
 * The Pro paywall: what Pro unlocks + plan choices that start Stripe Checkout.
 * Shown in place of a locked mode and inside the upgrade modal.
 */
export function UpgradePanel({ headline }: UpgradePanelProps) {
  const [busy, setBusy] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (plan: BillingPlan) => {
    setError(null)
    setBusy(plan)
    try {
      await startCheckout(plan) // redirects on success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.')
      setBusy(null)
    }
  }

  return (
    <div className="surface max-w-lg w-full p-8 flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="grid place-items-center w-14 h-14 rounded-2xl bg-gold/10 text-gold">
          <Crown size={26} />
        </span>
        <h2 className="text-2xl font-semibold text-gold-gradient">Go Pro</h2>
        <p className="text-sm text-content/60 max-w-sm">
          {headline ?? 'Unlock the advanced modes and the full picture of your card-counting edge.'}
        </p>
      </div>

      <ul className="w-full flex flex-col gap-2.5 text-left">
        {PRO_BENEFITS.map(benefit => (
          <li key={benefit} className="flex items-start gap-2.5 text-sm text-content/80">
            <Check size={16} className="text-gold shrink-0 mt-0.5" />
            {benefit}
          </li>
        ))}
      </ul>

      <div className="w-full flex flex-col gap-3">
        {PLAN_OPTIONS.map((plan, i) => (
          <button
            key={plan.id}
            onClick={() => choose(plan.id)}
            disabled={busy !== null}
            data-testid={`upgrade-${plan.id}`}
            className={`w-full flex items-center justify-between px-5 py-3.5 rounded-xl font-medium cursor-pointer transition-colors disabled:opacity-60 ${
              i === 0
                ? 'bg-gold text-black hover:bg-gold/90'
                : 'surface glow-hover text-content'
            }`}
          >
            <span className="flex items-center gap-2">
              {busy === plan.id && <Loader2 size={16} className="animate-spin" />}
              {plan.label}
              {plan.note && (
                <span className={`text-xs ${i === 0 ? 'text-black/70' : 'text-gold'}`}>
                  · {plan.note}
                </span>
              )}
            </span>
            <span className="text-sm">
              <span className="font-semibold">{plan.price}</span>
              <span className={i === 0 ? 'text-black/60' : 'text-content/50'}>{plan.cadence}</span>
            </span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-error" role="alert">{error}</p>}

      <p className="text-xs text-content/40">
        Secure checkout by Stripe. Cancel anytime from your account.
      </p>
    </div>
  )
}
