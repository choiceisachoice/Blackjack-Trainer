import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react'
import { PlaySection, PLAY_SECTION_ID, type PlaySectionHandle } from '../components/landing/PlaySection'
import { preloadTrialRound } from '../components/landing/trial-round-loader'
import { CookieSettingsLink } from '../components/common/CookieBanner'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Spade, Check, Loader2 } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { startCheckout, setPendingCheckout, type BillingPlan } from '../services/supabase/billing'
import { useHasSubscription } from '../store/entitlement-store'
import { PRO_BENEFITS, formatMoney, formatDecimal, yearlySaving, CH_VAT_PERCENT } from '../services/pro-features'
import { usePlanPriceStore, selectPlan } from '../store/plan-price-store'
import { logFailure } from '../services/failure-log'
import { LEGAL_META } from './legal/legal-meta'
import { SocialLinks } from '../components/common/SocialLinks'
import { usePageMeta } from '../hooks/use-page-meta'
import { JsonLd } from '../components/common/JsonLd'
import { siteJsonLd } from '../services/structured-data'
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { PublicNavMenu } from '../components/common/PublicNavMenu'
import { Reveal } from '../components/landing/Reveal'
import { ManifestoSection } from '../components/landing/ManifestoSection'
import { FeatureShowcase } from '../components/landing/FeatureShowcase'
import { LandingPhoto } from '../components/landing/LandingPhoto'
import { LANDING_PHOTOS } from '../components/landing/landing-photos'
import { QrRewardWelcome } from '../components/landing/QrRewardWelcome'
import { shouldLoadHeroCanvas, readHeroCanvasEnv, whenIdle } from '../components/landing/hero-canvas-gate'
import { isQrArrival, rememberQrReward, hasQrReward, withoutRefParam, qrWelcomeShown, markQrWelcomeShown } from '../services/qr-reward'

// The WebGL hero pulls in Three.js — its own chunk, requested by `HeroLayer`
// only where the gate allows it, so it never blocks the landing's first paint.
const HeroCanvas = lazy(() => import('../components/landing/HeroCanvas').then(m => ({ default: m.HeroCanvas })))

/*
 * What sits over the moving canvas: a patch of the ground colour behind the
 * headline, so type stays legible when a card drifts under it, and a fade into
 * the page at the bottom. Both are the ground's own colour going to
 * transparent, so on the ground itself they draw nothing — they only ever dim
 * a card. No glow, no vignette: a faint gradient on near-black is what made
 * the page look grainy (see `.app-canvas`).
 */
const SCRIM = 'radial-gradient(58% 62% at 28% 54%, rgba(7,8,9,.97) 44%, rgba(7,8,9,.6) 66%, transparent 86%), linear-gradient(180deg, transparent 58%, var(--color-casino-bg) 97%)'

/*
 * Over the closing photo: the surface colour, darkest in the middle where the
 * headline and buttons sit, letting the felt and the hands show at the edges.
 * Measured, not judged by eye: every pixel of photo-under-scrim inside each
 * line of text, against that text's colour, at 390, 768, 1024 and 1440 wide
 * (23 Nov 2026, worst points: eyebrow 6.4:1, headline 13:1, "See Pro" 13.4:1).
 *
 * The photo itself is cropped by the box — a strip of the 16:9 frame on a
 * desktop, a portrait slice on a phone, which is why `sizes` says 760px
 * there: a 340px-wide box 430px tall draws the photo about 765px wide.
 */
const CLOSING_SCRIM = 'radial-gradient(62% 78% at 50% 50%, rgba(13,15,19,.9) 35%, rgba(13,15,19,.76) 100%)'

export function LandingPage() {
  const { t, i18n } = useTranslation()
  /*
    Built here, not as module constants: a constant is evaluated once at import
    and would freeze whichever language happened to be active then. Switching
    language would leave these three steps and four answers in the old one.
  */
  const STEPS = [
    { n: '1', title: t('landing.steps.s1title'), body: t('landing.steps.s1body') },
    { n: '2', title: t('landing.steps.s2title'), body: t('landing.steps.s2body') },
    { n: '3', title: t('landing.steps.s3title'), body: t('landing.steps.s3body') },
  ]
  const FAQS = [
    { q: t('landing.faq.q1'), a: t('landing.faq.a1') },
    { q: t('landing.faq.q2'), a: t('landing.faq.a2') },
    { q: t('landing.faq.q3'), a: t('landing.faq.a3') },
    { q: t('landing.faq.q4'), a: t('landing.faq.a4') },
  ]
  usePageMeta('landing', '/')
  const signedIn = useAuthStore(s => s.status === 'signedIn')
  const authed = !isSupabaseConfigured || signedIn
  /*
    The play section is the trial round, and the trial is for a visitor
    without an account: `/try` sends a signed-in one to the app. This page
    redirects nobody, so for them the section is simply not there — the hero
    and the bar above already say "Open app", and a third copy of that line
    under the hero would be the only thing it could hold. Same condition as
    `/try`, deliberately not `authed`: a build without a cloud has no accounts
    to keep a round out of, and the prerender must not depend on which kind
    of build it runs in.
  */
  const showPlay = !(isSupabaseConfigured && signedIn)
  const play = useRef<PlaySectionHandle>(null)
  const hasSubscription = useHasSubscription()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<BillingPlan>('yearly')
  /**
   * Checkout state for the one button on this page that spends money.
   *
   * `startCheckout` calls an Edge Function and only then redirects, so there is
   * a real window in which nothing has visibly happened. Without `busy` the
   * button looked untouched for the whole of it and a second click opened a
   * *second* Stripe Checkout session; without `error` a failure went to the
   * console and the visitor was left with a button that appeared not to work.
   * This is the public front door — the same treatment `UpgradePanel` already
   * gives the paywall inside the app.
   */
  const [busy, setBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const priceStatus = usePlanPriceStore(s => s.status)
  const loadPrices = usePlanPriceStore(s => s.load)
  const current = usePlanPriceStore(s => selectPlan(s, plan))
  const monthly = usePlanPriceStore(s => selectPlan(s, 'monthly'))
  const yearly = usePlanPriceStore(s => selectPlan(s, 'yearly'))
  useEffect(() => { void loadPrices() }, [loadPrices])

  const saving = monthly && yearly ? yearlySaving(monthly.amount, yearly.amount) : null
  const money = (minor: number, currency: string) => formatMoney(minor, currency, i18n.language)

  /*
    The QR code in the casino-games video opens `/?ref=qr`.

    Read in the state initialisers: the prerender in Node has no `window`, so
    the static HTML never ships an open dialog, and the client does not hydrate
    that HTML but renders afresh, so there is no mismatch to avoid. The side
    effects go in the effect: remember the reward, and take `ref` out of the
    address bar so a reload or a copied link does not replay the welcome. The
    page-view tracker has already read it as the session's source by then.

    `qrWelcomeShown` is per page load: coming back to `/` inside the app must
    not open the dialog a second time. The plan toggle already starts on yearly.
  */
  const [qrOpen, setQrOpen] = useState(() => isQrArrival() && !qrWelcomeShown())
  const [qrRewarded] = useState(() => (typeof window !== 'undefined' && isQrArrival()) || hasQrReward())
  useEffect(() => {
    if (!isQrArrival()) return
    markQrWelcomeShown()
    rememberQrReward()
    window.history.replaceState({}, '', withoutRefParam(window.location.pathname, window.location.search, window.location.hash))
  }, [])

  // Every "Start free" means a new account, so the form opens on that side.
  function startFree() { void (authed ? navigate('/app') : navigate('/login', { state: { mode: 'signup' } })) }
  /**
   * Buy `chosen` (the toggle's plan by default). Takes the plan as an argument
   * so the QR reward can claim the yearly plan without waiting for the toggle's
   * state to settle.
   */
  async function goPro(chosen: BillingPlan = plan) {
    if (busy) return
    if (!authed) {
      // Remember the intent so checkout resumes automatically after sign-in.
      // A buyer has no account yet as a rule: the form opens on sign-up, and
      // the page says which plan is waiting (`SignupContext`).
      setPendingCheckout(chosen)
      void navigate('/login', { state: { mode: 'signup' } })
      return
    }
    // Someone who already pays does not get sent to a payment form. This is the
    // convenience half of the guard — it can be wrong in the safe direction,
    // because the entitlement may not have been loaded on a page a signed-out
    // visitor usually sees first. The half that actually protects the customer
    // is in the Edge Function, which asks Stripe.
    if (hasSubscription) {
      void navigate('/account')
      return
    }
    setCheckoutError(null)
    setBusy(true)
    try {
      const outcome = await startCheckout(chosen) // redirects on success, so this normally never returns
      // Deliberately no `setBusy(false)` on the redirect path: the browser is on
      // its way to Stripe. Re-enabling would offer a second checkout during it.
      if (outcome === 'already-subscribed') {
        // The server knows better than this page did. Their account page is
        // where the existing subscription can be seen and managed.
        void navigate('/account')
      }
    } catch (e) {
      logFailure('checkout-landing', e)
      setCheckoutError(t('errors.checkout', { email: LEGAL_META.contactEmail }))
      setBusy(false)
    }
  }

  return (
    <div className="app-canvas text-content overflow-x-hidden">
      <JsonLd data={siteJsonLd(t)} />
      {qrOpen && (
        <QrRewardWelcome
          percent={saving ? saving.percent : null}
          loading={priceStatus === 'idle' || priceStatus === 'loading'}
          yearlyPrice={yearly ? money(yearly.amount, yearly.currency) : null}
          monthlyTotal={saving && yearly ? money(saving.monthlyTotal, yearly.currency) : null}
          signedIn={authed}
          busy={busy}
          error={checkoutError}
          onClaim={() => void goPro('yearly')}
          onClose={() => setQrOpen(false)}
        />
      )}
      {/* Nav */}
      {/* `--color-topbar`, not a pinned near-black. This bar was a fixed 60%
          black in both themes while its links used `text-content`, which flips
          — so on the light theme dark ink sat on a dark-grey bar at 2.69:1.
          The token already exists and the app's own top bar already uses it;
          only the landing page was doing its own thing. The hairline goes with
          it, for the same reason. */}
      <header className="sticky top-0 z-40 backdrop-blur-md border-b border-contrast/10"
        style={{ backgroundColor: 'var(--color-topbar)' }}>
        {/* Tighter padding and gaps below sm: at 360px the wordmark and the
            actions otherwise meet with zero space between them. */}
        <nav className="max-w-6xl mx-auto w-full px-4 sm:px-6 h-[62px] flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 font-bold">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-gradient-to-b from-gold-bright to-gold text-on-gold shrink-0"><Spade size={15} /></span>
            {/* The wordmark gives way before an action does. Signed in, the
                bar holds the mark, the language menu and one link, and has
                room for it from 420px; signed out it also holds "Sign in" and
                the button, which in German are 215px on their own. Measured
                at 360px before this: the bar ran to 381px (390 in German) and
                the page scrolled sideways. */}
            <span className={`hidden whitespace-nowrap ${authed ? 'min-[420px]:inline' : 'sm:inline'}`}>Blackjack Trainer</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-5 text-sm text-content/70 shrink-0">
            <a href="#features" className="hidden sm:inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.features')}</a>
            <a href="#pricing" className="hidden sm:inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.pricing')}</a>
            <Link to="/learn" className="hidden sm:inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.learn')}</Link>
            {/* The one control a visitor may need before they can read the rest.
                It belongs on the page they land on, not only inside the app. */}
            <LanguageSwitcher />
            {authed && <PublicNavMenu signIn={false} className="sm:hidden" />}
            {authed ? (
              <Link to="/app" className="inline-flex items-center min-h-10 px-1 whitespace-nowrap font-semibold text-gold hover:text-gold-bright">{t('landing.hero.ctaOpen')}</Link>
            ) : (
              <>
                {/* Below sm "Sign in" moves into the menu, which also carries
                    Learn and the strategy chart: same width as before. */}
                <Link to="/login" className="hidden sm:inline-flex items-center min-h-10 hover:text-content px-1 whitespace-nowrap">{t('landing.nav.signIn')}</Link>
                <PublicNavMenu className="sm:hidden" />
                <button onClick={startFree} className="rounded-lg px-3 sm:px-4 py-2.5 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer whitespace-nowrap">{t('landing.nav.startFree')}</button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* On a phone the block starts near the top instead of in the middle:
          with a four-line headline (German) the second button otherwise sat
          under the cookie bar on a first visit — the visit it is there for. */}
      <section className="relative min-h-[calc(100vh-62px)] flex items-center max-sm:items-start overflow-hidden">
        <HeroLayer />
        <div className="relative z-[5] w-full intro-enter max-sm:pt-10 max-sm:pb-8">
          <div className="max-w-6xl mx-auto px-6">
            {/* The small line is part of the heading, not a label above it: it
                is the one place on the page that names the thing in the words
                people type into a search box ("blackjack trainer"), and a
                search engine reads the h1 as what the page is about. The big
                line alone said "Train the edge that beats the shoe" — a good
                line that contains none of those words. Two block spans, so
                each keeps its own size; the measure (15ch) belongs to the big
                one because a ch follows the font size. */}
            <h1>
              <span className="block text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('landing.hero.eyebrow')}</span>
              <span className="block mt-4 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.02] text-balance max-w-[15ch]">
                {/* Trans, not three concatenated keys: the accented word sits in
                    different places in different languages, and fragments cannot
                    be reordered by a translator. */}
                <Trans i18nKey="landing.hero.headline" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />
              </span>
            </h1>
            <p className="mt-5 text-lg text-content/60 max-w-[34em]">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <button onClick={startFree} className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer shadow-[0_8px_30px_-10px_rgba(212,168,71,.6)]">
                {authed ? t('landing.hero.ctaOpen') : t('landing.hero.ctaStart')}
              </button>
              {/* Two actions, never three. A visitor without an account gets
                  the product itself as the second one: a round of flashcards
                  before any form, on this page — the button brings the play
                  section up and deals its first hand. It is a link to the
                  section's anchor underneath, so it already works on the
                  prerendered page, before this code has arrived (there it
                  scrolls, and the section's own button deals). Someone
                  signed in has no use for a trial and keeps the way to the
                  prices, which everyone else still has in the bar above and
                  at the foot of the page. */}
              {authed ? (
                <a href="#pricing" className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">{t('landing.hero.ctaSeePro')}</a>
              ) : (
                <a href={`#${PLAY_SECTION_ID}`} data-testid="hero-try"
                  onClick={e => { e.preventDefault(); play.current?.start() }}
                  onPointerEnter={() => void preloadTrialRound()}
                  onFocus={() => void preloadTrialRound()}
                  className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">
                  {t('landing.hero.ctaTry')}
                </a>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-content/40">
              <span>{t('landing.hero.noCard')}</span><Dot /><span>{t('landing.hero.shoe')}</span><Dot /><span>{t('landing.hero.tags')}</span><Dot /><span>{t('landing.hero.cancel')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* The trainer itself, before anything is said about it. */}
      {showPlay && <PlaySection ref={play} />}

      {/* Credibility strip */}
      <div className="border-y border-white/8 py-4 bg-[rgba(7,8,9,.55)]">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap gap-x-7 gap-y-2 justify-center text-sm text-content/60">
          <span><b className="text-content font-semibold">{t('landing.tag.decksBold')}</b> · {t('landing.tag.decks')}</span>
          <span><b className="text-content font-semibold">Hi-Lo</b> {t('landing.tag.counting')}</span>
          {/* The one item in the strip that is also a free tool: it opens
              the public chart, so a visitor can check the claim before
              signing up — and the chart page gets a link from the front. */}
          <Link to="/strategy-chart" data-testid="strip-strategy-chart"
            className="underline decoration-gold/40 underline-offset-4 hover:text-content hover:decoration-gold">
            <b className="text-content font-semibold">{t('landing.hero.chipStrategy')}</b> · {t('landing.tag.freeChart')}
          </Link>
          <span><b className="text-content font-semibold">Illustrious 18</b> + Fab 4</span>
          <span><b className="text-content font-semibold">{t('landing.tag.realBold')}</b> {t('landing.tag.realTable')}</span>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <Reveal>
          <SectionHead eyebrow={t('landing.sections.featuresEyebrow')} title={<Trans i18nKey="landing.sections.featuresTitle" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />}
            sub={t('landing.sections.featuresSub')} />
        </Reveal>
        <FeatureShowcase />
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 pb-8">
        <Reveal>
          <SectionHead eyebrow={t('landing.sections.howEyebrow')} title={t('landing.steps.heading')} />
        </Reveal>
        <div className="mt-11 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.06}>
              <div className="surface rounded-2xl p-6 h-full">
                <div className="w-7 h-7 rounded-lg grid place-items-center text-sm font-extrabold bg-gradient-to-b from-gold-bright to-gold text-on-gold mb-3.5">{s.n}</div>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-content/60">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Manifesto — the emotional beat right before the pricing ask */}
      <ManifestoSection />

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 pt-14 pb-20">
        <Reveal>
          <SectionHead
            center
            eyebrow={t('landing.pricingIntro.eyebrow')}
            title={<Trans i18nKey="landing.pricingIntro.title" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />}
            sub={t('landing.pricingIntro.body')} />
        </Reveal>
        {/* Wide, not tall. On a 720px-high screen the old stacked Pro card put
            "Go Pro" below the fold the moment the section came into view. Now
            the Pro card is two columns — price and button on the left, what
            it adds on the right — beside a narrower free card, and the whole
            row fits under the heading. Below lg the two cards stack; below md
            the Pro card's columns do too, price and button first. */}
        <Reveal delay={0.06} className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)]">
          {/* Free */}
          <div className="surface rounded-2xl p-7 flex flex-col">
            <div className="text-sm uppercase tracking-wide text-content/60 font-semibold">{t('pricing.free')}</div>
            <div className="mt-3.5 flex items-baseline gap-1.5"><span className="text-4xl font-extrabold">CHF 0</span><span className="text-content/60 text-sm">{t('pricing.forever')}</span></div>
            <div className="text-xs text-gold mt-1.5">{t('pricing.noCard')}</div>
            <div className="mt-5 mb-6 flex flex-col gap-2.5 text-sm text-content/60">
              {[t('landing.freeCard.l1'), t('landing.freeCard.l2'), t('landing.freeCard.l3'), t('landing.freeCard.l4')].map(item => (
                <div key={item} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{item}</div>
              ))}
            </div>
            <button onClick={startFree} className="mt-auto rounded-xl px-5 py-3 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors cursor-pointer w-full">{t('landing.nav.startFree')}</button>
          </div>
          {/* Pro */}
          <div className="rounded-2xl p-7 grid gap-x-10 gap-y-6 md:grid-cols-2 border border-gold/50 bg-[linear-gradient(180deg,rgba(24,20,10,.55),var(--color-surface))] shadow-[0_0_0_1px_rgba(212,168,71,.15),0_40px_80px_-46px_rgba(212,168,71,.4)]">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm uppercase tracking-wide text-content/60 font-semibold">{t('pricing.pro')}</span>
                  {qrRewarded && plan === 'yearly' && (
                    <span className="text-xs font-bold text-gold border border-gold/50 rounded-full px-2.5 py-0.5" data-testid="pricing-qr-badge">
                      {t('qrReward.badge')}
                    </span>
                  )}
                </div>
                <div className="inline-flex bg-surface-2 border border-white/8 rounded-[11px] p-1 gap-1">
                  <button onClick={() => setPlan('yearly')} aria-pressed={plan === 'yearly'} className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${plan === 'yearly' ? 'bg-gradient-to-b from-gold-bright to-gold text-on-gold' : 'text-content/60'}`}>{t('pricing.yearly')}</button>
                  <button onClick={() => setPlan('monthly')} aria-pressed={plan === 'monthly'} className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${plan === 'monthly' ? 'bg-gradient-to-b from-gold-bright to-gold text-on-gold' : 'text-content/60'}`}>{t('pricing.monthly')}</button>
                </div>
              </div>
              {/* Fetched from Stripe, never asserted. The marketing page is the
                  place a wrong price does the most damage, so it shows a skeleton
                  until it has the real one and no figure at all if the fetch
                  fails — only a line saying where the figure will be, because
                  Stripe still states the amount at checkout. */}
              <div className="mt-4 flex items-baseline gap-2 flex-wrap min-h-10" data-testid="pricing-amount">
                {current ? (
                  <>
                    <span className="text-4xl font-extrabold tabular-nums">
                      {money(current.amount, current.currency)}
                    </span>
                    <span className="text-content/60 text-sm">
                      {t(`pricing.${current.interval === 'year' ? 'perYear' : 'perMonth'}`)}
                    </span>
                    {plan === 'yearly' && saving && saving.saved > 0 && (
                      <span
                        className="self-center ml-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums
                          bg-gold/15 text-gold border border-gold/40"
                        data-testid="pricing-saving"
                      >
                        {t('pricing.youSave', { amount: money(saving.saved, current.currency) })}
                      </span>
                    )}
                  </>
                ) : priceStatus === 'error' ? (
                  /* A skeleton that goes on animating after the fetch has failed
                      promises an arrival that will never happen. One neutral
                      sentence, in the same 40px. (Locally, with no Supabase
                      configured, this is the state to expect.) */
                  <span className="self-center text-sm text-content/60" data-testid="pricing-amount-unavailable">
                    {t('pricing.atCheckout')}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    data-testid="pricing-amount-pending"
                    className="h-9 w-36 self-center rounded-lg bg-contrast/10 animate-pulse"
                  />
                )}
              </div>
              {/* The saving, visible: the owner asked for the struck-through
                  figure back (28 Nov 2026), because "69" alone hides what a
                  buyer saves. It stays — with the words that make it honest.
                  A crossed-out amount on its own reads as a former price,
                  and twelve monthly payments were never this plan's price;
                  labelled "if paid monthly" it is what it is, a comparison of
                  two prices on sale today, and the badge beside the price says
                  the difference in money. All three figures are derived from
                  the two Stripe prices, none is written. */}
              <div className="text-xs mt-2 min-h-4 space-y-0.5" data-testid="pricing-compare">
                {plan === 'yearly'
                  ? saving && yearly && saving.saved > 0 && (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="text-base text-content/50 line-through decoration-content/50 tabular-nums" data-testid="pricing-struck">
                          {money(saving.monthlyTotal, yearly.currency)}
                        </span>
                        <span className="text-content/55">{t('pricing.compareLabel')}</span>
                      </div>
                      <div className="text-gold">
                        {t('pricing.perMonthShort', { amount: money(Math.round(yearly.amount / 12), yearly.currency) })}
                      </div>
                    </>
                  )
                  : <span className="text-gold">{t('pricing.flexibleCancel')}</span>}
              </div>
              <button
                onClick={() => void goPro()}
                disabled={busy}
                className="mt-5 rounded-xl px-5 py-3 font-semibold bg-gradient-to-b from-gold-bright to-gold
                  text-casino-bg cursor-pointer w-full inline-flex items-center justify-center gap-2
                  disabled:opacity-60 disabled:cursor-default"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {t('pricing.goPro')}
              </button>
              {/* `role="alert"` so the failure is announced, not merely drawn: the
                  visitor who most needs this message may not be looking at the
                  button they just pressed. */}
              {checkoutError && (
                <p className="mt-3 text-sm text-error" role="alert">{checkoutError}</p>
              )}
              <div className="mt-3 text-xs text-content/45 leading-relaxed">
                <span data-testid="pricing-vat-note">{t('pricing.vatNote', { rate: formatDecimal(CH_VAT_PERCENT, i18n.language) })}</span>
                {' · '}
                <span>{t('pricing.cancelInAccount')}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-sm text-content/60 min-w-0 md:border-l md:border-white/8 md:pl-10">
              <div className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" /><span className="text-content">{t('pricing.everythingInFree')}</span></div>
              {PRO_BENEFITS.map(b => (<div key={b} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{t(`paywall.${b}`)}</div>))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-8">
        <Reveal>
          <SectionHead eyebrow={t('landing.goodToKnow')} title={<>{t('landing.faq.heading')}</>} />
        </Reveal>
        <Reveal delay={0.06} className="mt-9 max-w-3xl">
          {FAQS.map(f => (
            <details key={f.q} className="border-b border-white/8 py-4 group">
              <summary className="cursor-pointer font-semibold text-base flex justify-between items-center list-none">{f.q}<span className="text-gold text-xl transition-transform group-open:rotate-45">+</span></summary>
              <p className="mt-3 text-content/60 text-sm leading-relaxed">{f.a}</p>
            </details>
          ))}
        </Reveal>
      </section>

      {/* Final CTA, over a real table: players' hands and chips on the felt,
          held far down under CLOSING_SCRIM so the words stay the subject.
          The photo is atmosphere only — empty alt, nothing for a screen
          reader to announce. `isolate` keeps the two layers behind the text
          and inside the rounded box. */}
      <section className="max-w-6xl mx-auto px-6 pb-20" data-testid="closing-cta">
        <Reveal className="relative isolate overflow-hidden rounded-3xl border border-white/8 py-14 px-6 text-center bg-surface">
          <LandingPhoto
            photo={LANDING_PHOTOS.feltHandsChips}
            alt=""
            sizes="(min-width: 640px) calc(100vw - 48px), 760px"
            position="50% 40%"
            className="absolute inset-0 -z-10 w-full h-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 -z-10" style={{ background: CLOSING_SCRIM }} />
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('landing.closing.eyebrow')}</div>
          <h2 className="mt-3.5 text-3xl md:text-4xl font-extrabold tracking-tight max-w-[16em] mx-auto text-balance">{t('landing.closing.title')}</h2>
          <div className="mt-7 flex justify-center gap-3.5 flex-wrap">
            <button onClick={startFree} className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer">{authed ? t('landing.hero.ctaOpen') : t('landing.hero.ctaStart')}</button>
            <a href="#pricing" className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">{t('landing.closing.seePro')}</a>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8">
        {/* text-content/40 fails WCAG AA here (3.53:1 on the near-black
            background); /60 clears the 4.5:1 threshold for this size. */}
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-between items-center gap-x-4 gap-y-2 text-sm text-content/60">
          <div className="flex items-center gap-2.5 font-semibold text-content/80"><span className="w-6 h-6 rounded-md grid place-items-center bg-gradient-to-b from-gold-bright to-gold text-on-gold"><Spade size={13} /></span> Blackjack Trainer</div>
          <div className="flex gap-x-5 flex-wrap">
            <a href="#features" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.features')}</a>
            <a href="#pricing" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.pricing')}</a>
            <Link to="/learn" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.learn')}</Link>
            <Link to="/strategy-chart" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.strategyChart')}</Link>
            <Link to="/login" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.nav.signIn')}</Link>
            <Link to="/terms" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.terms')}</Link>
            <Link to="/privacy" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.privacy')}</Link>
            <Link to="/contact" className="inline-flex items-center min-h-10 hover:text-content">{t('landing.footer.contact')}</Link>
            <CookieSettingsLink className="inline-flex items-center min-h-10 hover:text-content" />
          </div>
          <SocialLinks />
          <div>{t('landing.footer.note')}</div>
        </div>
      </footer>
    </div>
  )
}

function HeroLayer() {
  /*
    The canvas is an extra, not the hero: three.js measured 2.2 s of
    main-thread blocking on a phone, where it sits under the 72% scrim anyway.
    So it is requested only after mount, once the browser is idle, and only
    on a screen and device that can show it (`hero-canvas-gate.ts`). The
    prerender and every phone keep the static ground — the same near-black
    the canvas clears to, so nothing changes under the headline when it
    arrives.
  */
  const [canvas, setCanvas] = useState(false)
  useEffect(() => {
    if (!shouldLoadHeroCanvas(readHeroCanvasEnv())) return
    return whenIdle(() => setCanvas(true))
  }, [])
  return (
    <>
      {canvas && (
        <Suspense fallback={null}>
          <HeroCanvas className="absolute inset-0 w-full h-full z-[1]" />
        </Suspense>
      )}
      <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: SCRIM }} />
      {/* On a phone the text runs the full width, so there is no side of the
          hero a card can pass on: every card is held back to a shape in the
          dark behind the words. One flat tone over the canvas, not a gradient. */}
      <div className="absolute inset-0 z-[3] pointer-events-none bg-[rgba(7,8,9,.72)] md:hidden" />
    </>
  )
}

/**
 * @param center - Centre the block in its section. Used above the pricing
 *   cards, which are centred themselves: a heading on the left edge over two
 *   cards in the middle belongs to neither.
 */
function SectionHead({ eyebrow, title, sub, center = false }: { eyebrow: string; title: ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={`max-w-[34em] ${center ? 'mx-auto text-center' : ''}`}>
      <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{eyebrow}</div>
      <h2 className="mt-3 text-3xl md:text-[2.375rem] font-extrabold tracking-tight leading-tight text-balance">{title}</h2>
      {sub && <p className="mt-3.5 text-content/60 text-base">{sub}</p>}
    </div>
  )
}

function Dot() { return <span className="w-[3px] h-[3px] rounded-full bg-content/30" /> }
