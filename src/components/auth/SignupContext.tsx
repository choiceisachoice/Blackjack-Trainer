import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ShieldCheck } from 'lucide-react'
import type { BillingPlan } from '../../services/supabase/billing'
import { usePlanPriceStore, selectPlan } from '../../store/plan-price-store'
import { formatMoney, yearlySaving } from '../../services/pro-features'

/** The three Pro rows shown beside the form — the ones a buyer came for. */
const PRO_ROWS = ['paywall.r4', 'paywall.r6', 'paywall.addDrillsTitle'] as const
const FREE_ROWS = ['signupPanel.free1', 'signupPanel.free2', 'signupPanel.free3'] as const

/**
 * What the sign-up form is for, beside it.
 *
 * After "Go Pro" the visitor met a card that said only "Create an account to
 * get started" — nothing about the plan they had just picked, the price, or
 * that a payment page comes next. With a checkout pending this says all
 * three: the plan and its Stripe price, step 1 of 2, and that it can be
 * cancelled. Without one it says what a free account keeps.
 *
 * Two renderings of the same facts: a panel to the left of the form from
 * `lg` up, a two-line strip above it on narrower screens, where a panel
 * would push the form below the fold.
 *
 * @param plan - The pending plan, or null for the free-account version
 */
export function SignupContext({ plan }: { plan: BillingPlan | null }) {
  const { t, i18n } = useTranslation()
  const load = usePlanPriceStore(s => s.load)
  const price = usePlanPriceStore(s => (plan ? selectPlan(s, plan) : undefined))
  const monthly = usePlanPriceStore(s => selectPlan(s, 'monthly'))
  const yearly = usePlanPriceStore(s => selectPlan(s, 'yearly'))
  useEffect(() => { if (plan) void load() }, [plan, load])

  if (!plan) {
    return (
      <>
        <aside className="hidden lg:flex flex-col w-96 shrink-0" data-testid="signup-free-panel">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('signupPanel.freeEyebrow')}</div>
          <h2 className="mt-3 text-2xl font-extrabold leading-tight text-balance">{t('signupPanel.freeTitle')}</h2>
          <ul className="mt-5 flex flex-col gap-3 text-sm text-content/70">
            {FREE_ROWS.map(k => (
              <li key={k} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{t(k)}</li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-content/45">{t('pricing.noCard')}</p>
        </aside>
        <p className="lg:hidden w-full max-w-sm text-sm text-content/60 text-center" data-testid="signup-free-strip">
          {t('signupPanel.freeStrip')}
        </p>
      </>
    )
  }

  const money = (minor: number, currency: string) => formatMoney(minor, currency, i18n.language)
  const planName = t(plan === 'yearly' ? 'pricing.yearly' : 'pricing.monthly')
  const amount = price
    ? `${money(price.amount, price.currency)}${t(price.interval === 'year' ? 'pricing.perYear' : 'pricing.perMonth')}`
    : null
  const compare = plan === 'yearly' && yearly && monthly
    ? t('pricing.perMonthEquiv', {
      amount: money(Math.round(yearly.amount / 12), yearly.currency),
      percent: yearlySaving(monthly.amount, yearly.amount).percent,
    })
    : null

  return (
    <>
      <aside className="hidden lg:flex flex-col w-96 shrink-0" data-testid="signup-pro-panel">
        <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('signupPanel.proEyebrow', { plan: planName })}</div>
        <div className="mt-3 text-3xl font-extrabold tabular-nums" data-testid="signup-price">
          {amount ?? <span className="text-base font-semibold text-content/60">{t('pricing.atCheckout')}</span>}
        </div>
        {compare && <div className="mt-1 text-xs text-gold">{compare}</div>}

        <ol className="mt-6 flex flex-col gap-3 text-sm" aria-label={t('signupPanel.step')}>
          <li className="flex items-center gap-3">
            <span className="grid place-items-center w-6 h-6 rounded-full text-xs font-extrabold bg-gradient-to-b from-gold-bright to-gold text-on-gold">1</span>
            <span className="font-semibold text-content">{t('signupPanel.stepAccount')}</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="grid place-items-center w-6 h-6 rounded-full text-xs font-bold border border-contrast/20 text-content/60">2</span>
            <span className="text-content/60">{t('signupPanel.stepCheckout')}</span>
          </li>
        </ol>

        <ul className="mt-6 pt-5 border-t border-contrast/10 flex flex-col gap-2.5 text-sm text-content/70">
          {PRO_ROWS.map(k => (
            <li key={k} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{t(k)}</li>
          ))}
        </ul>
        <p className="mt-5 flex items-center gap-2 text-xs text-content/50">
          <ShieldCheck size={14} className="shrink-0" />{t('pricing.cancelInAccount')}
        </p>
      </aside>

      <div className="lg:hidden w-full max-w-sm rounded-xl border border-gold/35 bg-gold/5 px-4 py-3" data-testid="signup-pro-strip">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold text-content whitespace-nowrap">{t('signupPanel.proEyebrow', { plan: planName })}</span>
          {/* No price, no placeholder sentence: the line below already says
              the amount comes at the Stripe step. */}
          {amount && <span className="text-sm font-bold text-gold tabular-nums whitespace-nowrap">{amount}</span>}
        </div>
        <p className="mt-1 text-xs text-content/60">{t('signupPanel.stripLine')}</p>
      </div>
    </>
  )
}
