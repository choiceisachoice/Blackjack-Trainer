import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Crown, LogOut, ExternalLink, Loader2, Download, Pencil } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { useEntitlementStore, useIsPro } from '../store/entitlement-store'
import { useAppStore, DEALING_SPEED_LABEL } from '../store/app-store'
import type { DealingSpeed } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { useLevelStore } from '../store/level-store'
import { useAchievementStore } from '../store/achievement-store'
import { openBillingPortal } from '../services/supabase/billing'
import { signOutAndClearLocal } from '../services/supabase/cloud-sync'
import {
  displayNameOf, normalizeDisplayName, updateDisplayName,
  DISPLAY_NAME_MIN, DISPLAY_NAME_MAX,
} from '../services/supabase/profile-name'
import { collectDataExport, downloadJson, exportFileName } from '../services/data-export'
import { ALL_ACHIEVEMENTS } from '../services/achievements/achievement-list'
import { casinoAmbient } from '../services/casino-ambient'
import { useUpgradePrompt } from '../store/upgrade-prompt-store'
import { UpgradeModalHost } from '../components/pro/UpgradeModalHost'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { Field, Input, Segmented, Slider, Toggle } from '../components/common/ui'
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
function Section({ label, testId, className = '', children }: {
  label: string
  testId?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`surface rounded-2xl p-6 ${className}`} data-testid={testId}>
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
 * The shape follows what every account page people already know does: a
 * profile header with the name, the address and the numbers that describe the
 * account, then the settings in cards beneath it. The name was collected at
 * sign-up and never shown again anywhere; it is shown and editable here.
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

  useEffect(() => {
    if (isSupabaseConfigured && !loaded) void loadEntitlement()
  }, [loaded, loadEntitlement])

  const plan = planLabel(status, isPro, cancelAtPeriodEnd)
  const periodEnd = formatDate(currentPeriodEnd)
  const renewLabel =
    status === 'past_due' ? t('account.paymentDueBy')
    // "Access ends on", not "Renews on". Same date, opposite promise.
    : cancelAtPeriodEnd ? t('account.accessEndsOn')
    : status === 'trialing' ? t('account.trialEnds')
    : t('account.renewsOn')

  // Leaves `busy` set on the success path on purpose: the browser is on its
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

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-4xl mx-auto px-6 py-14">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> {t('account.backToApp')}
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{t('account.title')}</h1>

        <ProfileHeader onSignOut={() => void navigate('/')} />

        <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-4">
            {/* Plan card */}
            <div className="surface rounded-2xl p-6" data-testid="account-plan">
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

            <DataSection />
          </div>

          <PreferencesSection />
        </div>
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
 * Who this account belongs to, and the numbers that describe it.
 *
 * The name is the one collected at sign-up, editable in place. Level, XP,
 * sessions and achievements are read from the same stores the rest of the app
 * draws them from, so the header agrees with the awards page and the
 * analytics to the number.
 */
function ProfileHeader({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const email = user?.email ?? null
  const memberSince = formatDate(user?.created_at ? Date.parse(user.created_at) : null)
  const name = displayNameOf(user)
  const level = useLevelStore(s => s.level)
  const totalXP = useLevelStore(s => s.totalXP)
  const sessionCount = useStatsStore(s => s.lifetimeStats?.totalSessions ?? s.sessions.length)
  const unlocked = useAchievementStore(s => s.totalUnlocked)
  const [signingOut, setSigningOut] = useState(false)

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
    onSignOut()
  }

  const initial = (name ?? email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <section className="surface rounded-2xl p-6 mt-6" data-testid="account-profile">
      <div className="flex items-start gap-5 flex-wrap">
        <span
          aria-hidden
          className="grid place-items-center w-16 h-16 rounded-2xl text-2xl font-extrabold text-on-gold bg-gradient-to-b from-gold-bright to-gold shrink-0"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <NameEditor current={name} editable={isSupabaseConfigured && !!user} />
          {email && <div className="text-sm text-content/60 truncate">{email}</div>}
          {memberSince && (
            <div className="text-sm text-content/50" data-testid="account-member-since">
              {t('account.memberSince')} {memberSince}
            </div>
          )}
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          data-testid="account-sign-out"
          className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-error transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} {t('nav.signOut')}
        </button>
      </div>

      <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="account-stats">
        <Stat label={t('awards.level')} value={String(level.level)} sub={t(level.titleKey)} accent />
        <Stat label={t('account.xp')} value={totalXP.toLocaleString()} />
        <Stat label={t('account.sessions')} value={sessionCount.toLocaleString()} />
        <Stat label={t('account.achievements')} value={`${unlocked} / ${ALL_ACHIEVEMENTS.length}`} />
      </dl>
    </section>
  )
}

/** One figure in the profile header. */
function Stat({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl px-4 py-3 bg-contrast/5 border border-contrast/10">
      <dt className="text-xs text-content/50">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${accent ? 'text-gold' : 'text-content'}`}>{value}</dd>
      {sub && <dd className="text-xs text-content/50 truncate">{sub}</dd>}
    </div>
  )
}

/**
 * The display name, shown as a heading and edited in place.
 *
 * A pencil turns the heading into a field; save writes both places the name
 * is kept and the auth store picks the change up from Supabase's own
 * `USER_UPDATED` event, so the heading updates without a reload.
 */
function NameEditor({ current, editable }: { current: string | null; editable: boolean }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const begin = () => {
    setDraft(current ?? '')
    setProblem(null)
    setSaved(false)
    setEditing(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const name = normalizeDisplayName(draft)
    if (!name) {
      setProblem(t('account.nameInvalid', { min: DISPLAY_NAME_MIN, max: DISPLAY_NAME_MAX }))
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await updateDisplayName(name)
      setSaved(true)
      setEditing(false)
    } catch (err) {
      logFailure('profile-name', err)
      setProblem(t('account.nameSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  // No backend, no account, no name — nothing to show or edit.
  if (!current && !editable) return null

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {current && <h2 className="text-xl font-bold truncate" data-testid="account-display-name">{current}</h2>}
        {editable && (
          <button
            type="button"
            onClick={begin}
            aria-label={t('account.displayName')}
            data-testid="account-edit-name"
            className="grid place-items-center w-7 h-7 rounded-lg text-content/40 hover:text-gold hover:bg-contrast/5 cursor-pointer transition-colors"
          >
            <Pencil size={14} />
          </button>
        )}
        {saved && <span role="status" className="text-xs text-success" data-testid="account-name-saved">{t('account.nameSaved')}</span>}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 flex-wrap">
      <Input
        aria-label={t('account.displayName')}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        maxLength={DISPLAY_NAME_MAX}
        autoFocus
        data-testid="account-name-input"
        invalid={problem !== null}
        className="w-56"
      />
      <button
        type="submit"
        disabled={busy}
        data-testid="account-name-save"
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold bg-gold text-on-gold cursor-pointer disabled:opacity-60"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {t('account.saveName')}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-sm text-content/60 hover:text-content cursor-pointer"
      >
        {t('common.cancel')}
      </button>
      {problem && <p role="alert" className="basis-full text-sm text-error">{problem}</p>}
    </form>
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
 * What can be taken away, and what can be deleted.
 *
 * The export is the data-portability right, served as a file. The history
 * reset is the same action the analytics page offers, reached from the place
 * a person looks for it. Account deletion is not self-service: it needs a
 * server-side call with the service role, and there is none yet — so the page
 * says how it is done rather than showing a button that cannot do it.
 */
function DataSection() {
  const { t } = useTranslation()
  const email = useAuthStore(s => s.user?.email ?? null)
  const resetAllStats = useStatsStore(s => s.resetAllStats)
  const [resetError, setResetError] = useState<string | null>(null)

  function exportData() {
    const now = new Date()
    downloadJson(exportFileName(now), collectDataExport(email))
  }

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
          onClick={exportData}
          data-testid="account-export-data"
          className="inline-flex items-center gap-2 text-sm font-semibold text-content hover:text-gold cursor-pointer transition-colors"
        >
          <Download size={15} /> {t('account.downloadData')}
        </button>
        <p className="mt-1 text-sm text-content/50">{t('account.downloadDataHint')}</p>
      </div>
      <div className="border-t border-contrast/10 pt-4">
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
      <div className="border-t border-contrast/10 pt-4">
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
