import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Crown, Loader2, X } from 'lucide-react'
import {
  PLAN_IDS,
  FEATURE_GROUPS,
  formatMoney,
  formatDecimal,
  yearlySaving,
  CH_VAT_PERCENT,
} from '../../services/pro-features'
import type { ComparisonRow } from '../../services/pro-features'
import { startCheckout } from '../../services/supabase/billing'
import type { BillingPlan } from '../../services/supabase/billing'
import { useEntitlementStore } from '../../store/entitlement-store'
import { usePlanPriceStore, selectPlan } from '../../store/plan-price-store'
import { logFailure } from '../../services/failure-log'
import { LEGAL_META } from '../../pages/legal/legal-meta'

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
  const { t, i18n } = useTranslation()
  const [busy, setBusy] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [plan, setPlan] = useState<BillingPlan>('yearly')
  const loadEntitlement = useEntitlementStore(s => s.loadEntitlement)

  const priceStatus = usePlanPriceStore(s => s.status)
  const loadPrices = usePlanPriceStore(s => s.load)
  const selected = usePlanPriceStore(s => selectPlan(s, plan))
  const monthly = usePlanPriceStore(s => selectPlan(s, 'monthly'))
  const yearly = usePlanPriceStore(s => selectPlan(s, 'yearly'))
  useEffect(() => { void loadPrices() }, [loadPrices])

  const isYearly = plan === 'yearly'
  // Only derivable once both amounts are in. Everything downstream treats a
  // missing saving the way it treats a missing price: it says nothing, rather
  // than something it cannot stand behind.
  const saving = monthly && yearly ? yearlySaving(monthly.amount, yearly.amount) : null
  const money = (minor: number, currency: string) => formatMoney(minor, currency, i18n.language)

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
        setNotice(t('paywall.alreadyPro'))
        setBusy(null)
      }
    } catch (e) {
      // The thrown message never reaches the screen. From supabase-js it reads
      // "Edge Function returned a non-2xx status code" — English, technical, and
      // no help to somebody who was about to pay. It goes to the console; the
      // customer gets a sentence in their language with a way to reach us,
      // because on this path *they* are the only alerting there is.
      logFailure('checkout', e)
      setError(t('errors.checkout', { email: LEGAL_META.contactEmail }))
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
        <h2 className="text-2xl font-semibold text-gold-gradient">{t('paywall.goProHeading')}</h2>
        <p className="text-sm text-content/60 max-w-sm">
          {headline ?? t('paywall.goProSub')}
        </p>
      </div>

      {/* Billing period */}
      <div className="inline-flex bg-surface-2 border border-white/8 rounded-xl p-1 gap-1">
        {PLAN_IDS.map(id => (
          <button
            key={id}
            onClick={() => setPlan(id)}
            aria-pressed={plan === id}
            data-testid={`billing-${id}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${
              plan === id
                ? 'bg-gradient-to-br from-gold-bright to-gold text-on-gold'
                : 'text-content/60 hover:text-content'
            }`}
          >
            {t(`pricing.${id}`)}
            {id === 'yearly' && saving && (
              <span className={plan === id ? 'text-on-gold/70' : 'text-gold'}>
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
            <span className="text-xs font-bold tracking-[0.16em] uppercase text-content/50">{t('pricing.free')}</span>
            <span className="text-xs text-content/40">{t('pricing.yourPlan')}</span>
          </div>
          <div className="mt-3 text-2xl font-extrabold text-content/70">
            {money(0, selected?.currency ?? 'chf')}
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {FEATURE_GROUPS.map(group => (
              <div key={group.titleKey}>
                <GroupTitle>{t(`paywall.${group.titleKey}`)}</GroupTitle>
                <div className="flex flex-col gap-2 text-sm">
                  {group.rows.map(row => <FreeRow key={row.labelKey} row={row} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pro */}
        {/* The warm lift at the top of this card was a fixed
            `rgba(24,20,10,.6)`. Over near-black that is a faint gold-tinted
            rise; over white it is 60% black, which turned the Pro plan — the
            card the whole screen is selling — into a muddy dark slab with the
            light theme's dark text on it. The tint is a token now. */}
        <div className="relative rounded-2xl border border-gold/45 p-5 flex flex-col
          bg-[linear-gradient(180deg,var(--color-pro-tint),var(--color-surface))]
          shadow-[0_0_0_1px_rgba(212,168,71,.14),0_30px_70px_-50px_rgba(212,168,71,.5)]">
          {isYearly && (
            <span className="absolute -top-2.5 right-5 text-[0.6875rem] font-extrabold tracking-wider
              text-on-gold bg-gradient-to-br from-gold-bright to-gold px-2.5 py-0.5 rounded-full">
              {t('pricing.bestValue')}
            </span>
          )}

          <div className="flex items-baseline justify-between">
            <span className="text-xs font-bold tracking-[0.16em] uppercase text-gold">{t('pricing.pro')}</span>
          </div>

          {/* The price, or nothing.

              No placeholder amount and no last-known figure: a price the page
              cannot confirm is the exact failure this replaced. While the fetch
              is out the row holds its height, so the card does not jump when
              the number lands. */}
          <div className="mt-3 flex items-baseline gap-2 flex-wrap min-h-10" data-testid="paywall-price">
            {selected ? (
              <>
                {isYearly && saving && (
                  <span className="text-base text-content/35 line-through tabular-nums">
                    {money(saving.monthlyTotal, selected.currency)}
                  </span>
                )}
                <span className="text-3xl font-extrabold tabular-nums">
                  {money(selected.amount, selected.currency)}
                </span>
                <span className="text-sm text-content/50">
                  {t(`pricing.${selected.interval === 'year' ? 'perYear' : 'perMonth'}`)}
                </span>
              </>
            ) : (
              /* Pulses only while something is still coming. A skeleton that
                  goes on animating after the fetch has failed promises an
                  arrival that will never happen; the reserved height alone is
                  the honest version of "no price". (Locally, with no Supabase
                  configured, this is the state you should expect to see.) */
              <span
                aria-hidden
                data-testid="paywall-price-pending"
                className={`h-8 w-32 self-center rounded-lg ${
                  priceStatus === 'error' ? 'bg-transparent' : 'bg-contrast/10 animate-pulse'
                }`}
              />
            )}
          </div>
          <div className="mt-1 text-xs text-gold min-h-4">
            {isYearly
              ? saving && monthly && t('paywall.saveAgainst', {
                saved: money(saving.saved, monthly.currency),
                monthly: money(monthly.amount, monthly.currency),
              })
              : t('pricing.flexibleSwitch')}
          </div>
          <div className="mt-1 text-xs text-content/45" data-testid="paywall-vat-note">{t('pricing.vatNote', { rate: formatDecimal(CH_VAT_PERCENT, i18n.language) })}</div>

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
              bg-gradient-to-br from-gold-bright to-gold text-on-gold"
          >
            {busy !== null && <Loader2 size={16} className="animate-spin" />}
            {/* Names the amount when it knows it. Unpriced the button still
                works — Stripe states the figure before anything is charged —
                but it must not name one this page has not confirmed.

                Two keys rather than one plus a separator: `goPro` ends in an
                arrow, so appending "— 69 CHF" produced "Pro holen → — 69 CHF",
                an arrow pointing at a dash. Where the separator goes is a
                typographic decision in each language, so it belongs in the
                translation rather than in this file. */}
            {selected
              ? t('pricing.goProPrice', {
                price: `${money(selected.amount, selected.currency)}${t(`pricing.${selected.interval === 'year' ? 'perYear' : 'perMonth'}`)}`,
              })
              : t('pricing.goPro')}
          </button>

          <div className="mt-5 flex flex-col gap-4">
            {FEATURE_GROUPS.map(group => (
              <div key={group.titleKey}>
                <GroupTitle gold>{t(`paywall.${group.titleKey}`)}</GroupTitle>
                <div className="flex flex-col gap-2 text-sm">
                  {group.rows.map(row => (
                    <div key={row.labelKey} className="flex gap-2.5 items-start text-content/85">
                      <Check size={15} className="text-gold shrink-0 mt-0.5" />
                      {t(`paywall.${row.labelKey}`)}
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
        {t('pricing.secureCheckout')}
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
  const { t } = useTranslation()
  if (row.free === 'none') {
    // Struck through, not hidden: someone deciding whether to pay has to be
    // able to read what they would not be getting. At `text-content/25` this
    // measured 2.68:1 on the light theme — de-emphasis had become concealment,
    // on the one screen where that costs a sale.
    return (
      <div className="flex gap-2.5 items-start text-content/50">
        <X size={15} className="shrink-0 mt-0.5" />
        <span className="line-through decoration-content/30">{t(`paywall.${row.labelKey}`)}</span>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5 items-start text-content/70">
      <Check size={15} className="text-content/40 shrink-0 mt-0.5" />
      <span>
        {t(`paywall.${row.labelKey}`)}
        {row.free === 'partial' && row.freeNoteKey && (
          <span className="text-content/35"> — {t(`paywall.${row.freeNoteKey}`)}</span>
        )}
      </span>
    </div>
  )
}
