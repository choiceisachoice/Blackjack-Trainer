import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Club, Coins, Crown, Grid3x3, Loader2, Minus, ReceiptText, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  PLAN_IDS,
  FEATURE_GROUPS,
  formatMoney,
  formatDecimal,
  yearlySaving,
  CH_VAT_PERCENT,
} from '../../services/pro-features'
import type { ComparisonRow } from '../../services/pro-features'
import { startCheckout, setPendingCheckout } from '../../services/supabase/billing'
import type { BillingPlan } from '../../services/supabase/billing'
import { useEntitlementStore } from '../../store/entitlement-store'
import { usePlanPriceStore, selectPlan } from '../../store/plan-price-store'
import { useAuthStore, isSupabaseConfigured } from '../../store/auth-store'
import { useAppStore } from '../../store/app-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { logFailure } from '../../services/failure-log'
import { LEGAL_META } from '../../pages/legal/legal-meta'
import { trackEvent } from '../../services/analytics/events'
import { useStatsStore } from '../../store/stats-store'
import { usePlanState } from '../../hooks/use-plan-state'
import { claimedStageIds } from '../../services/curriculum'
import { paywallLine, trialPaywallLine, type PaywallSentence } from './paywall-line'
import { PAYWALL_SUBJECTS, paywallSubject, type PaywallSubject } from './paywall-subject'

/*
  The pictures pull in the whole casino table. Inside the app it is already
  loaded; on the public strategy chart, which hosts this panel as a modal, it
  is not, and should not be until somebody opens the paywall.
*/
const PaywallPicture = lazy(() => import('./PaywallPicture').then(m => ({ default: m.PaywallPicture })))

interface UpgradePanelProps {
  /** Optional context line, e.g. the locked feature the user tried to open. */
  headline?: string
  /**
   * The panel stands where the casino table would be. Somebody who has played
   * the free trial then reads what their own hands came to instead of where
   * their plan stands — the table is what they just tried and what they are
   * being asked to pay for.
   */
  atTable?: boolean
  /**
   * What the visitor reached for, when the caller knows it better than the
   * screen behind the panel does (the public strategy chart, which is not a
   * mode of the app). Otherwise derived; see `paywallSubject`.
   */
  subject?: PaywallSubject
}

/**
 * The Pro paywall: a landscape card with the case on the left and the price
 * on the right; on a phone, one sheet in the order case, price, detail.
 *
 * ## Why it is shaped like this
 *
 * The comparison it replaced was two long columns, the free one a wall of
 * struck-through capabilities, with the price and the button below the fold
 * of a 720px window. It argued well and sold badly: the one thing a convinced
 * visitor needs — what it costs and where to click — came after everything
 * else. Now the price, the plan toggle, the saving and "Go Pro" sit together
 * in the first screen at 2000×720 and 1440×900, and above the button on a
 * 360×740 phone.
 *
 * The case is three things, not nine: the table, the deviations and the two
 * drills that turn a count into a bet (`PAYWALL_SUBJECTS`), each one line,
 * with a picture of the real thing for the one this visitor reached for. The
 * full comparison is still there, behind a quiet disclosure, as a table with
 * ticks — someone deciding whether to pay must be able to read what they
 * would not be getting, and now can, without the crossed-out wall.
 *
 * The yearly discount is derived from the two amounts (`yearlySaving`) and
 * every amount comes from Stripe via the plan-price store; nothing here is a
 * figure written into copy.
 */
export function UpgradePanel(props: UpgradePanelProps) {
  // Outside a router (unit tests render the panel bare) there is no client-side
  // navigation to use; a full page load to the login page does the same job.
  return useInRouterContext()
    ? <RoutedUpgradePanel {...props} />
    : <UpgradePanelBody {...props} toLogin={() => window.location.assign('/login')} />
}

/** The panel inside the app's router: sign-up is a client-side navigation. */
function RoutedUpgradePanel(props: UpgradePanelProps) {
  const navigate = useNavigate()
  return <UpgradePanelBody {...props} toLogin={() => void navigate('/login', { state: { mode: 'signup' } })} />
}

function UpgradePanelBody({ headline, atTable = false, subject, toLogin }: UpgradePanelProps & { toLogin: () => void }) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const [busy, setBusy] = useState<BillingPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [plan, setPlan] = useState<BillingPlan>('yearly')
  const loadEntitlement = useEntitlementStore(s => s.loadEntitlement)
  const authStatus = useAuthStore(s => s.status)
  const mode = useAppStore(s => s.currentMode)

  const priceStatus = usePlanPriceStore(s => s.status)
  const loadPrices = usePlanPriceStore(s => s.load)
  const selected = usePlanPriceStore(s => selectPlan(s, plan))
  const monthly = usePlanPriceStore(s => selectPlan(s, 'monthly'))
  const yearly = usePlanPriceStore(s => selectPlan(s, 'yearly'))
  useEffect(() => { void loadPrices() }, [loadPrices])

  // The path to purchase: this panel was shown. Once per mount; the server
  // stores it once per visitor and half hour, and nothing is sent without the
  // visitor's consent.
  useEffect(() => { void trackEvent('paywall_view') }, [])

  /*
    The line about this learner (see `paywall-line.ts`).

    It is derived from the session history, so the history has to be there
    first: a paywall opened by a deep link can mount before anything loaded
    it. Until it has, the panel says the generic thing rather than something
    about a learner it has not read yet — "your plan is at basic strategy" to
    someone three stages past it would be worse than saying nothing.
  */
  const sessions = useStatsStore(s => s.sessions)
  const loadStats = useStatsStore(s => s.loadStats)
  const planState = usePlanState()
  const [historyReady, setHistoryReady] = useState(() => {
    const stats = useStatsStore.getState()
    return stats.lifetimeStats !== null || stats.sessions.length > 0
  })
  useEffect(() => {
    if (historyReady) return
    let alive = true
    // `loadStats` never rejects; the second handler is for a store that does.
    const done = () => { if (alive) setHistoryReady(true) }
    void loadStats().then(done, done)
    return () => { alive = false }
  }, [historyReady, loadStats])
  const line = useMemo(
    () => (historyReady
      ? (atTable ? trialPaywallLine(sessions) : null) ?? paywallLine({
        sessions,
        placement: planState.placement,
        readStages: planState.readStages,
        claimed: claimedStageIds(),
        goal: planState.profile?.goal,
      })
      : null),
    [atTable, historyReady, sessions, planState],
  )
  // A caller that names what was locked (`show(headline)`) wins over the line.
  const personal = headline === undefined ? line : null
  const sentence = (part: PaywallSentence) =>
    t(part.key, { ...part.values, ...(part.stageTitleKey ? { stage: t(part.stageTitleKey) } : {}) })

  // The picture: what this visitor reached for. The line still points the way
  // when a headline replaced it on screen — the plan's locked stage is the
  // stage the plan's button named.
  const derived = paywallSubject({ explicit: subject, atTable, mode, line })
  const [picked, setPicked] = useState<PaywallSubject | null>(null)
  const shown = picked ?? derived

  const isYearly = plan === 'yearly'
  // Only derivable once both amounts are in. Everything downstream treats a
  // missing saving the way it treats a missing price: it says nothing, rather
  // than something it cannot stand behind.
  const saving = monthly && yearly ? yearlySaving(monthly.amount, yearly.amount) : null
  const money = (minor: number, currency: string) => formatMoney(minor, currency, i18n.language)
  const period = (interval: string) => t(`pricing.${interval === 'year' ? 'perYear' : 'perMonth'}`)

  const choose = async () => {
    setError(null)
    setNotice(null)
    // Signed out — the public strategy chart opens this panel for visitors
    // without an account, and checkout needs one. The intent is kept and
    // resumed after sign-up (`App.tsx` consumes it), as on the landing page
    // and after the guest trial.
    if (isSupabaseConfigured && authStatus === 'signedOut') {
      setPendingCheckout(plan)
      useUpgradePrompt.getState().hide()
      toLogin()
      return
    }
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
    /*
      One grid, three arrangements, so nothing is rendered twice:
      - phone: the case, the price, then what Pro adds — the button is in the
        first screen even at 360×740;
      - tablet: the case and what Pro adds on the left, the price beside them;
      - desktop: the case with the picture beside it, the price on the right,
        and the three rows as one strip under the case. The adds block is
        `display: contents` there, so its parts take grid areas of their own.
    */
    <section
      aria-labelledby={headingId}
      data-testid="upgrade-panel"
      className="surface w-full max-w-[68rem] p-5 sm:p-6 lg:p-8 grid gap-6 md:gap-x-8 lg:gap-x-8 lg:gap-y-0
        [grid-template-areas:'intro'_'price'_'adds']
        md:grid-cols-[minmax(0,1fr)_19rem] md:grid-rows-[auto_1fr] md:[grid-template-areas:'intro_price'_'adds_price']
        lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_21.5rem] lg:grid-rows-[auto_auto_auto_1fr]
        lg:[grid-template-areas:'intro_pic_price'_'head_head_price'_'rows_rows_price'_'more_more_price']"
    >
      {/* The case: who this is for, in one or two sentences. */}
      <header className="[grid-area:intro] min-w-0">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-gold/10 text-gold shrink-0">
            <Crown size={20} />
          </span>
          <h2 id={headingId} className="text-2xl lg:text-[1.75rem] leading-tight font-semibold text-gold-gradient">
            {t('paywall.goProHeading')}
          </h2>
        </div>
        {/* One line about the learner and one about Pro, where the app knows
            enough to say them; otherwise the line that is true for everyone.
            A caller that names what was locked (`show(headline)`) wins. */}
        {personal ? (
          <div className="mt-3 max-w-xl" data-testid="paywall-personal">
            <p className="text-[0.9375rem] font-medium text-content/90" data-testid="paywall-personal-lead">{sentence(personal.lead)}</p>
            <p className="text-sm text-content/60 mt-1" data-testid="paywall-personal-support">{sentence(personal.support)}</p>
          </div>
        ) : (
          <p className="mt-3 max-w-xl text-[0.9375rem] text-content/70" data-testid="paywall-sub">
            {headline ?? t('paywall.goProSub')}
          </p>
        )}
      </header>

      {/* The price. Toggle, figure, saving, button and the three facts a
          buyer checks before paying — together, and first on a phone. */}
      <div
        className="[grid-area:price] md:self-start md:sticky md:top-4 relative rounded-2xl border border-gold/45 p-5 flex flex-col
          bg-[linear-gradient(180deg,var(--color-warm-wash),var(--color-surface))]
          shadow-[0_0_0_1px_rgba(212,168,71,.14),0_30px_70px_-50px_rgba(212,168,71,.5)]"
        data-testid="paywall-price-card"
      >
        <div className="grid grid-cols-2 bg-surface-2 border border-contrast/8 rounded-xl p-1 gap-1">
          {PLAN_IDS.map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setPlan(id)}
              aria-pressed={plan === id}
              data-testid={`billing-${id}`}
              className={`px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                plan === id
                  ? 'bg-gradient-to-b from-gold-bright to-gold text-on-gold'
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

        {/* The price, or nothing.

            No placeholder amount and no last-known figure: a price the page
            cannot confirm is the exact failure this replaced. While the fetch
            is out the row holds its height, so the card does not jump when
            the number lands. */}
        <div className="mt-5 flex items-baseline gap-2 flex-wrap min-h-12" data-testid="paywall-price" aria-live="polite">
          {selected ? (
            <>
              <span className="text-[2.5rem] leading-none font-extrabold tabular-nums">
                {money(selected.amount, selected.currency)}
              </span>
              <span className="text-sm text-content/55">{period(selected.interval)}</span>
            </>
          ) : priceStatus === 'error' ? (
            /* A skeleton that goes on animating after the fetch has failed
               promises an arrival that will never happen, and a bare reserved
               height reads as a hole in the card. One neutral sentence, the
               landing's own: Stripe still states the amount before anything
               is charged. (Locally, with no Supabase, this is what to expect.) */
            <span className="self-center text-sm text-content/65" data-testid="paywall-price-unavailable">
              {t('pricing.atCheckout')}
            </span>
          ) : (
            <span
              aria-hidden
              data-testid="paywall-price-pending"
              className="h-10 w-36 self-center rounded-lg bg-contrast/10 animate-pulse"
            />
          )}
        </div>
        <div className="mt-1.5 text-[0.8125rem] text-gold min-h-5" data-testid="paywall-saving">
          {isYearly
            ? saving && monthly && t('paywall.saveAgainst', {
              saved: money(saving.saved, monthly.currency),
              monthly: money(monthly.amount, monthly.currency),
            })
            : t('pricing.flexibleSwitch')}
        </div>

        <button
          type="button"
          onClick={choose}
          disabled={busy !== null}
          data-testid={`upgrade-${plan}`}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5
            font-semibold cursor-pointer transition-[filter,opacity] hover:brightness-105 disabled:opacity-60
            bg-gradient-to-b from-gold-bright to-gold text-on-gold"
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
            ? t('pricing.goProPrice', { price: `${money(selected.amount, selected.currency)}${period(selected.interval)}` })
            : t('pricing.goPro')}
        </button>

        {error && <p className="mt-3 text-sm text-error" role="alert">{error}</p>}
        {notice && <p className="mt-3 text-sm text-gold" role="status" data-testid="upgrade-notice">{notice}</p>}

        {/* What a careful buyer looks for under the button: who takes the
            money, that it can be undone, and that the figure is final. */}
        <ul className="mt-4 flex flex-col gap-2 text-xs leading-snug text-content/55">
          <li className="flex gap-2 items-start">
            <ShieldCheck size={14} className="shrink-0 mt-px text-content/45" />
            <span>{t('pricing.secureCheckout')}</span>
          </li>
          <li className="flex gap-2 items-start" data-testid="paywall-vat-note">
            <ReceiptText size={14} className="shrink-0 mt-px text-content/45" />
            <span>{t('pricing.vatNote', { rate: formatDecimal(CH_VAT_PERCENT, i18n.language) })}</span>
          </li>
        </ul>
      </div>

      {/* What Pro adds: three rows and a picture of the one in question. */}
      <div className="[grid-area:adds] min-w-0 flex flex-col lg:contents">
        <h3 className="lg:[grid-area:head] lg:mt-7 text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/45">
          {t('paywall.addsHeading')}
        </h3>
        {/* Sized by the grid on a desktop (the height of the case beside it)
            and fixed below that; `container-type: size` lets the picture fit
            itself to whichever box it gets (see `PaywallPicture`). */}
        <div
          className={`lg:[grid-area:pic] mt-3 lg:mt-0 h-[188px] lg:h-auto lg:min-h-[200px] rounded-xl border border-contrast/8
            overflow-hidden [container-type:size] ${shown === 'table' ? '' : 'p-2'}
            bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-contrast)_5%,transparent),transparent)]`}
          data-testid="paywall-picture"
          data-subject={shown}
        >
          <Suspense fallback={<div aria-hidden className="h-full w-full rounded-lg bg-contrast/5 animate-pulse" />}>
            <PaywallPicture subject={shown} />
          </Suspense>
        </div>
        <ul className="lg:[grid-area:rows] mt-3 grid gap-1 lg:grid-cols-3 lg:gap-3">
          {PAYWALL_SUBJECTS.map(id => (
            <li key={id} className="min-w-0">
              <AddRow subject={id} active={id === shown} onShow={() => setPicked(id)} />
            </li>
          ))}
        </ul>
        <div className="lg:[grid-area:more] mt-3">
          <FullComparison />
        </div>
      </div>
    </section>
  )
}

/** Icon, title and one-line explanation for each of the three. */
const ADDS: Record<PaywallSubject, { icon: LucideIcon; titleKey: string; bodyKey: string }> = {
  table: { icon: Club, titleKey: 'paywall.addTableTitle', bodyKey: 'paywall.addTableBody' },
  deviations: { icon: Grid3x3, titleKey: 'paywall.addDeviationsTitle', bodyKey: 'paywall.addDeviationsBody' },
  drills: { icon: Coins, titleKey: 'paywall.addDrillsTitle', bodyKey: 'paywall.addDrillsBody' },
}

/**
 * One of the three. A button: choosing it shows its picture, so a visitor
 * can look at each without a carousel deciding for them.
 */
function AddRow({ subject, active, onShow }: { subject: PaywallSubject; active: boolean; onShow: () => void }) {
  const { t } = useTranslation()
  const { icon: Icon, titleKey, bodyKey } = ADDS[subject]
  return (
    <button
      type="button"
      onClick={onShow}
      aria-pressed={active}
      data-testid={`paywall-add-${subject}`}
      className={`w-full h-full text-left grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 lg:gap-y-2
        rounded-xl px-3 py-2.5 border cursor-pointer transition-colors ${
        active ? 'border-gold/40 bg-gold/[.06]' : 'border-contrast/8 hover:border-contrast/15 hover:bg-contrast/[.03]'
      }`}
    >
      {/* Icon beside title and line on a phone; on a desktop, where the rows
          stand side by side, icon and title share the first line and the
          line takes the full width of its column under them. */}
      <span className={`row-span-2 lg:row-span-1 self-start grid place-items-center w-8 h-8 rounded-lg transition-colors ${
        active ? 'bg-gold/15 text-gold' : 'bg-contrast/5 text-content/55'
      }`}>
        <Icon size={16} />
      </span>
      <span className="text-sm font-semibold leading-snug text-content/90 lg:min-h-[2.4rem] lg:flex lg:items-center">{t(titleKey)}</span>
      <span className="col-start-2 lg:col-start-1 lg:col-span-2 self-start text-[0.8125rem] leading-snug text-content/55">
        {t(bodyKey)}
      </span>
    </button>
  )
}

/**
 * Everything, Free against Pro — for whoever wants the whole list. Closed by
 * default; a table with marks rather than struck-through text, which at the
 * old contrast had turned de-emphasis into concealment.
 */
function FullComparison() {
  const { t } = useTranslation()
  return (
    <details className="group" data-testid="paywall-compare">
      <summary className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1.5 cursor-pointer
        text-sm text-content/55 hover:text-content/85 transition-colors rounded-md">
        {t('paywall.compareAll')}
        <ChevronDown size={15} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 rounded-xl border border-contrast/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-contrast/[.03] text-[0.6875rem] font-bold tracking-[0.14em] uppercase">
              <td />
              <th scope="col" className="w-24 py-2 px-2 text-center text-content/45">{t('pricing.free')}</th>
              <th scope="col" className="w-20 py-2 px-2 text-center text-gold">{t('pricing.pro')}</th>
            </tr>
          </thead>
          {FEATURE_GROUPS.map(group => (
            <tbody key={group.titleKey}>
              <tr>
                <th colSpan={3} scope="colgroup" className="text-left pt-3 pb-1 px-3 text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/35">
                  {t(`paywall.${group.titleKey}`)}
                </th>
              </tr>
              {group.rows.map(row => (
                <tr key={row.labelKey} className="border-t border-contrast/[.05]">
                  <th scope="row" className="text-left font-normal py-2 px-3 text-content/80">{t(`paywall.${row.labelKey}`)}</th>
                  <td className="py-2 px-2 text-center"><FreeCell row={row} /></td>
                  <td className="py-2 px-2 text-center">
                    <Check size={15} className="inline text-gold" aria-hidden />
                    <span className="sr-only">{t('paywall.included')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </details>
  )
}

/**
 * How much of a capability the free tier gets.
 *
 * Three states, not two: `partial` is the honest one — the Strategy Chart and
 * the analytics *are* in the free tier, just not completely. A dash for those
 * would be a lie, a plain tick would hide the reason to upgrade.
 */
function FreeCell({ row }: { row: ComparisonRow }) {
  const { t } = useTranslation()
  if (row.free === 'full') {
    return (
      <>
        <Check size={15} className="inline text-content/45" aria-hidden />
        <span className="sr-only">{t('paywall.included')}</span>
      </>
    )
  }
  if (row.free === 'partial' && row.freeNoteKey) {
    return <span className="text-xs text-content/55">{t(`paywall.${row.freeNoteKey}`)}</span>
  }
  return (
    <>
      <Minus size={15} className="inline text-content/30" aria-hidden />
      <span className="sr-only">{t('paywall.notIncluded')}</span>
    </>
  )
}
