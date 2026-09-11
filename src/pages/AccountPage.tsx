import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Crown, LogOut, ExternalLink, Loader2 } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { useEntitlementStore, useIsPro } from '../store/entitlement-store'
import { useAppStore, DEALING_SPEED_LABEL } from '../store/app-store'
import type { DealingSpeed } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { openBillingPortal } from '../services/supabase/billing'
import { signOutAndClearLocal } from '../services/supabase/cloud-sync'
import { casinoAmbient } from '../services/casino-ambient'
import { useUpgradePrompt } from '../store/upgrade-prompt-store'
import { UpgradeModalHost } from '../components/pro/UpgradeModalHost'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { Field, Segmented, Slider, Toggle } from '../components/common/ui'
import { logFailure } from '../services/failure-log'
import { LEGAL_META } from './legal/legal-meta'

/**
 * Human-readable label + tone for a subscription status.
 *
 * `cancelAtPeriodEnd` is checked before `trialing`/`active` because it is the
 * thing the person most recently did and most needs to see confirmed. Stripe
 * leaves a cancelled subscription `active` until the period runs out, so
 * without this the page would answer a cancellation with "Pro — active".
 */
function planLabel(
  status: string,
  isPro: boolean,
  cancelAtPeriodEnd: boolean,
): { titleKey: string; tone: 'gold' | 'muted' | 'warn' } {
  if (!isPro) return { titleKey: 'account.freePlan', tone: 'muted' }
  // A failed payment outranks a scheduled ending: one needs action now, the
  // other is already settled.
  if (status === 'past_due') return { titleKey: 'account.proPaymentDue', tone: 'warn' }
  if (cancelAtPeriodEnd) return { titleKey: 'account.proCancelled', tone: 'muted' }
  if (status === 'trialing') return { titleKey: 'account.proTrial', tone: 'gold' }
  return { titleKey: 'account.proActive', tone: 'gold' }
}

function formatDate(ms: number | null): string | null {
  if (!ms) return null
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** One card on the page, with the small uppercase label the account card set. */
function Section({ label, testId, children }: { label: string; testId?: string; children: ReactNode }) {
  return (
    <section className="surface rounded-2xl p-6 mt-4" data-testid={testId}>
      <h2 className="text-sm uppercase tracking-wide text-content/50 font-semibold">{label}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/**
 * `/account` — the one place a person's account, preferences and data are
 * looked after.
 *
 * It used to hold two cards: the plan, and an email address with a sign-out
 * button under it. Everything else that belongs on a page like this was
 * scattered — the language in the nav bar, the sound in the nav bar and again
 * in the top bar, the dealing speed and the ambience volume inside the casino
 * HUD where they can only be reached mid-session.
 *
 * Deliberately not here: changing the password. The reset flow already covers
 * it, and a security control does not belong between a volume slider and a
 * delete button.
 *
 * The preferences here are the device's, not the account's: they live in
 * `localStorage` and survive a sign-out on purpose (see `local-reset.ts`).
 * The page says so, because a person who sets the volume here and then finds
 * it different on their phone deserves to know why.
 */
export function AccountPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const email = useAuthStore(s => s.user?.email ?? null)
  const createdAt = useAuthStore(s => s.user?.created_at ?? null)
  const isPro = useIsPro()
  const status = useEntitlementStore(s => s.status)
  const loaded = useEntitlementStore(s => s.loaded)
  const currentPeriodEnd = useEntitlementStore(s => s.currentPeriodEnd)
  const cancelAtPeriodEnd = useEntitlementStore(s => s.cancelAtPeriodEnd)
  const loadEntitlement = useEntitlementStore(s => s.loadEntitlement)
  const [busy, setBusy] = useState<null | 'portal'>(null)
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
  const showUpgrade = useUpgradePrompt(s => s.show)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (isSupabaseConfigured && !loaded) void loadEntitlement()
  }, [loaded, loadEntitlement])

  const plan = planLabel(status, isPro, cancelAtPeriodEnd)
  const periodEnd = formatDate(currentPeriodEnd)
  const memberSince = formatDate(createdAt ? Date.parse(createdAt) : null)
  const renewLabel =
    status === 'past_due' ? t('account.paymentDueBy')
    // "Access ends on", not "Renews on". Same date, opposite promise.
    : cancelAtPeriodEnd ? t('account.accessEndsOn')
    : status === 'trialing' ? t('account.trialEnds')
    : t('account.renewsOn')

  // Both leave `busy` set on the success path on purpose: the browser is on its
  // way to Stripe, and re-enabling would offer a second session mid-redirect.
  async function manage() {
    setBillingError(null)
    setBusy('portal')
    try {
      await openBillingPortal()
    } catch (e) {
      logFailure('billing-portal', e)
      setBillingError(t('errors.portal', { email: LEGAL_META.contactEmail }))
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
    void navigate('/')
  }

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> {t('account.backToApp')}
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{t('account.title')}</h1>

        {/* Plan card */}
        <div className="surface rounded-2xl p-6 mt-6">
          {!loaded && isSupabaseConfigured ? (
            <div className="flex items-center gap-2 text-content/50 py-4"><Loader2 size={18} className="animate-spin" /> {t('account.loadingPlan')}</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className={`w-10 h-10 rounded-xl grid place-items-center ${plan.tone === 'gold' ? 'bg-gold/12 border border-gold/25 text-gold' : plan.tone === 'warn' ? 'bg-warning/12 border border-warning/25 text-warning' : 'bg-white/5 border border-white/10 text-content/60'}`}>
                    <Crown size={20} />
                  </span>
                  <div>
                    <div className="font-bold text-lg">{t(plan.titleKey)}</div>
                    {isPro && periodEnd && <div className="text-sm text-content/50">{renewLabel} {periodEnd}</div>}
                    {!isPro && <div className="text-sm text-content/50">{t('account.upgradeHintShort')}</div>}
                    {cancelAtPeriodEnd && (
                      /**
                       * The part of cancelling nobody thinks about.
                       *
                       * The Casino Session, Bet Spread, Deck Estimation and the
                       * Bankroll tools are Pro. A paused session is kept alive
                       * in the browser, which makes it easy to assume it will
                       * still be there afterwards — it will not. Access ends
                       * with the period, and the mode goes behind the paywall
                       * with whatever is in it. Better said here than
                       * discovered on the day it happens.
                       */
                      <div className="mt-2 text-sm text-warning" data-testid="pro-ends-notice">
                        {t('account.proEndsNotice')}
                      </div>
                    )}
                  </div>
                </div>
                {isPro ? (
                  <button onClick={manage} disabled={busy !== null} className="rounded-xl px-5 py-3 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors cursor-pointer inline-flex items-center gap-2 disabled:opacity-60">
                    {busy === 'portal' ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />} {t('account.manageSubscription')}
                  </button>
                ) : (
                  /*
                    Opens the paywall rather than starting a checkout.

                    This button used to call `startCheckout('yearly')` directly:
                    one click, straight to a 69 CHF annual subscription, with no
                    price, no term and no choice shown anywhere on this page —
                    while the landing page advertises a monthly plan this route
                    could not reach. Stripe does show the amount before payment,
                    so nothing was ever charged unseen, but "Go Pro" meant
                    something different here than everywhere else in the product.

                    The paywall already answers all of it — both plans, both
                    prices, the VAT note and the same `already-subscribed`
                    recovery this page used to duplicate — so there is no reason
                    for a second way to buy.
                  */
                  <button onClick={() => showUpgrade(t('account.upgradeHintShort'))} data-testid="account-go-pro" className="rounded-xl px-5 py-3 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer inline-flex items-center gap-2">
                    {t('pricing.goPro')}
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
                <Link to="/#pricing" className="inline-block mt-4 text-sm text-gold hover:text-gold-bright">{t('account.comparePlans')}</Link>
              )}
            </>
          )}
        </div>

        <Section label={t('account.sectionProfile')} testId="account-profile">
          {email && <div className="text-content">{email}</div>}
          {memberSince && (
            <div className="text-sm text-content/50" data-testid="account-member-since">
              {t('account.memberSince')} {memberSince}
            </div>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            data-testid="account-sign-out"
            className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-error transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} {t('nav.signOut')}
          </button>
        </Section>

        <PreferencesSection />

        <DataSection />
      </div>

      {/* Mounted here because `/account` is its own route, outside the app
          shell that hosts this everywhere else. Without it the paywall has
          nowhere to render — which is how this page ended up with a checkout
          call of its own in the first place. */}
      <UpgradeModalHost />
    </div>
  )
}

/**
 * The device preferences, gathered from the four places they were.
 *
 * Every control here writes to the same store or singleton the scattered
 * originals write to, so the nav bar's mute button and the HUD's speed toggle
 * stay in step with this page — there is one setting, shown twice, not two
 * settings that drift.
 */
function PreferencesSection() {
  const { t } = useTranslation()
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const toggleSound = useAppStore(s => s.toggleSound)
  const soundVolume = useAppStore(s => s.soundVolume)
  const setSoundVolume = useAppStore(s => s.setSoundVolume)
  const dealingSpeed = useAppStore(s => s.dealingSpeed)
  const setDealingSpeed = useAppStore(s => s.setDealingSpeed)
  // The ambience volume lives on a singleton rather than in a store — it only
  // ever had one reader, the casino HUD. Mirrored into state so the slider
  // moves; the singleton stays the owner and does the persisting.
  const [ambientVolume, setAmbientVolume] = useState(() => casinoAmbient.volume)

  const speeds: DealingSpeed[] = ['slow', 'normal']

  return (
    <Section label={t('account.sectionPreferences')} testId="account-preferences">
      <Field label={t('account.language')}>
        <span data-testid="account-language"><LanguageSwitcher /></span>
      </Field>
      <Toggle
        label={t('account.sounds')}
        checked={soundEnabled}
        onChange={() => toggleSound()}
        testId="account-sound-toggle"
      />
      {soundEnabled && (
        <Slider
          label={t('account.soundVolume')}
          value={soundVolume}
          onChange={setSoundVolume}
          testId="account-sound-volume"
        />
      )}
      <Field label={t('account.dealingSpeed')}>
        <span data-testid="account-speed">
          <Segmented
            ariaLabel={t('account.dealingSpeed')}
            value={dealingSpeed}
            onChange={setDealingSpeed}
            options={speeds.map(s => ({ value: s, label: t(DEALING_SPEED_LABEL[s]) }))}
          />
        </span>
      </Field>
      <Slider
        label={t('account.ambientVolume')}
        value={ambientVolume}
        onChange={v => { casinoAmbient.volume = v; setAmbientVolume(v) }}
        testId="account-ambient-volume"
      />
      <p className="text-xs text-content/40">{t('account.devicePrefsHint')}</p>
    </Section>
  )
}

/**
 * What can be deleted, and how.
 *
 * The history reset is the same action the analytics page offers, reached from
 * the place a person looks for it. Account deletion is not self-service: it
 * needs a server-side call with the service role, and there is none yet — so
 * the page says how it is done rather than showing a button that cannot do it.
 */
function DataSection() {
  const { t } = useTranslation()
  const resetAllStats = useStatsStore(s => s.resetAllStats)
  const [resetError, setResetError] = useState<string | null>(null)

  async function deleteHistory() {
    // Translated: this confirms an irreversible deletion.
    if (!window.confirm(t('errors.resetConfirm'))) return
    setResetError(null)
    try {
      await resetAllStats()
    } catch (e) {
      logFailure('data-reset', e)
      setResetError(t('errors.reset'))
    }
  }

  return (
    <Section label={t('account.sectionData')} testId="account-data">
      <div>
        <button
          onClick={deleteHistory}
          data-testid="account-delete-history"
          className="text-sm font-semibold text-error hover:underline cursor-pointer"
        >
          {t('analytics.deleteHistory')}
        </button>
        <p className="mt-1 text-sm text-content/50">{t('account.deleteHistoryHint')}</p>
        {resetError && <p role="alert" className="mt-2 text-sm text-error">{resetError}</p>}
      </div>
      <div>
        <div className="text-sm font-semibold">{t('account.deleteAccount')}</div>
        <p className="mt-1 text-sm text-content/50">
          {t('account.deleteAccountHint', { email: LEGAL_META.contactEmail })}
        </p>
        <a
          href={`mailto:${LEGAL_META.contactEmail}`}
          data-testid="account-delete-account"
          className="inline-block mt-2 text-sm text-gold hover:text-gold-bright"
        >
          {LEGAL_META.contactEmail}
        </a>
      </div>
    </Section>
  )
}
