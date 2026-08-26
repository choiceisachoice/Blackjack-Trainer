import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'
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
import { LanguageSwitcher } from '../components/common/LanguageSwitcher'
import { Reveal } from '../components/landing/Reveal'
import { ManifestoSection } from '../components/landing/ManifestoSection'
import { FeatureShowcase } from '../components/landing/FeatureShowcase'

// The WebGL hero pulls in Three.js — load it as its own chunk after the hero
// text has painted, so it never blocks the landing's first paint.
const HeroCanvas = lazy(() => import('../components/landing/HeroCanvas').then(m => ({ default: m.HeroCanvas })))



/*
 * The hero used to carry an ambient gold wash over the canvas. It read as a
 * pale haze rather than as atmosphere and sat oddly against the cards coming out
 * of focus, so it is gone: the ground behind the hero is the ground colour and
 * nothing else. The scrim below stays — that one is not decoration, it is what
 * keeps the headline legible over a moving canvas.
 */
const SCRIM = 'radial-gradient(46% 50% at 33% 55%, rgba(7,8,9,.9) 26%, rgba(7,8,9,.5) 52%, transparent 76%), linear-gradient(180deg, transparent 58%, var(--color-casino-bg) 97%)'

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
  const signedIn = useAuthStore(s => s.status === 'signedIn')
  const authed = !isSupabaseConfigured || signedIn
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

  function startFree() { void navigate(authed ? '/app' : '/login') }
  async function goPro() {
    if (busy) return
    if (!authed) {
      // Remember the intent so checkout resumes automatically after sign-in.
      setPendingCheckout(plan)
      void navigate('/login')
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
      const outcome = await startCheckout(plan) // redirects on success, so this normally never returns
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
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[rgba(9,10,12,.6)] border-b border-white/8">
        {/* Tighter padding and gaps below sm: at 360px the wordmark and the
            actions otherwise meet with zero space between them. */}
        <nav className="max-w-6xl mx-auto w-full px-4 sm:px-6 h-[62px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-bold">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-gradient-to-br from-gold-bright to-gold text-on-gold shrink-0"><Spade size={15} /></span>
            {/* Below 360px the wordmark plus the actions need ~342px, so it
                would wrap to two lines inside a 62px bar. Drop to the mark
                alone there; from 360px up it fits on one line. */}
            <span className="hidden min-[360px]:inline whitespace-nowrap">Blackjack Trainer</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-5 text-sm text-content/70 shrink-0">
            <a href="#features" className="hidden sm:inline hover:text-content">{t('landing.nav.features')}</a>
            <a href="#pricing" className="hidden sm:inline hover:text-content">{t('landing.nav.pricing')}</a>
            {/* The one control a visitor may need before they can read the rest.
                It belongs on the page they land on, not only inside the app. */}
            <LanguageSwitcher />
            {authed ? (
              <Link to="/app" className="font-semibold text-gold hover:text-gold-bright">{t('landing.hero.ctaOpen')}</Link>
            ) : (
              <>
                <Link to="/login" className="hover:text-content">{t('landing.nav.signIn')}</Link>
                <button onClick={startFree} className="rounded-lg px-3.5 sm:px-4 py-2.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-on-gold cursor-pointer whitespace-nowrap">{t('landing.nav.startFree')}</button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero + credibility strip form one dark stage, in both themes.
          See `.hero-stage` in index.css for why it does not follow the theme. */}
      <div className="hero-stage">
      <section className="relative min-h-[calc(100vh-62px)] flex items-center overflow-hidden">
        <HeroLayer />
        <div className="relative z-[5] w-full intro-enter">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('landing.hero.eyebrow')}</div>
            <h1 className="mt-4 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.02] text-balance max-w-[15ch]">
              {/* Trans, not three concatenated keys: the accented word sits in
                  different places in different languages, and fragments cannot
                  be reordered by a translator. */}
              <Trans i18nKey="landing.hero.headline" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />
            </h1>
            <p className="mt-5 text-lg text-content/60 max-w-[34em]">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <button onClick={startFree} className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-on-gold cursor-pointer shadow-[0_8px_30px_-10px_rgba(212,168,71,.6)]">
                {authed ? t('landing.hero.ctaOpen') : t('landing.hero.ctaStart')}
              </button>
              <a href="#pricing" className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">{t('landing.hero.ctaSeePro')}</a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-content/40">
              <span>{t('landing.hero.noCard')}</span><Dot /><span>{t('landing.hero.shoe')}</span><Dot /><span>{t('landing.hero.tags')}</span><Dot /><span>{t('landing.hero.cancel')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility strip */}
      <div className="border-y border-white/8 py-4 bg-[rgba(7,8,9,.55)]">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap gap-x-7 gap-y-2 justify-center text-sm text-content/60">
          <span><b className="text-content font-semibold">{t('landing.tag.decksBold')}</b> · {t('landing.tag.decks')}</span>
          <span><b className="text-content font-semibold">Hi-Lo</b> {t('landing.tag.counting')}</span>
          <span><b className="text-content font-semibold">{t('landing.hero.chipStrategy')}</b> · S17 / H17</span>
          <span><b className="text-content font-semibold">Illustrious 18</b> + Fab 4</span>
          <span><b className="text-content font-semibold">{t('landing.tag.realBold')}</b> {t('landing.tag.realTable')}</span>
        </div>
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
                <div className="w-7 h-7 rounded-lg grid place-items-center text-sm font-extrabold bg-gradient-to-br from-gold-bright to-gold text-on-gold mb-3.5">{s.n}</div>
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
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <Reveal>
          <SectionHead
            eyebrow={t('landing.pricingIntro.eyebrow')}
            title={<Trans i18nKey="landing.pricingIntro.title" components={[<span key="0" />, <span key="1" className="text-gold-gradient" />]} />}
            sub={t('landing.pricingIntro.body')} />
        </Reveal>
        <Reveal delay={0.06} className="mt-10 grid gap-4 md:grid-cols-[1fr_1.15fr] items-stretch max-w-3xl">
          {/* Free */}
          <div className="surface rounded-2xl p-7 flex flex-col">
            <div className="text-sm uppercase tracking-wide text-content/60 font-semibold">{t('pricing.free')}</div>
            <div className="mt-3.5 flex items-baseline gap-1.5"><span className="text-4xl font-extrabold">CHF 0</span><span className="text-content/60 text-sm">{t('pricing.forever')}</span></div>
            <div className="text-xs text-gold mt-1.5">{t('pricing.noCard')}</div>
            <div className="mt-5 flex flex-col gap-2.5 text-sm text-content/60">
              {[t('landing.freeCard.l1'), t('landing.freeCard.l2'), t('landing.freeCard.l3'), t('landing.freeCard.l4')].map(item => (
                <div key={item} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{item}</div>
              ))}
            </div>
            <button onClick={startFree} className="mt-6 rounded-xl px-5 py-3 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors cursor-pointer w-full">{t('landing.nav.startFree')}</button>
          </div>
          {/* Pro */}
          <div className="rounded-2xl p-7 flex flex-col relative border border-gold/50 bg-[linear-gradient(180deg,rgba(24,20,10,.55),var(--color-surface))] shadow-[0_0_0_1px_rgba(212,168,71,.15),0_40px_80px_-46px_rgba(212,168,71,.4)]">
            <div className="absolute -top-2.5 right-6 text-xs font-extrabold text-on-gold bg-gradient-to-br from-gold-bright to-gold px-3 py-1 rounded-full">{t('pricing.mostPopular')}</div>
            <div className="text-sm uppercase tracking-wide text-content/60 font-semibold">{t('pricing.pro')}</div>
            {/* Fetched from Stripe, never asserted. The marketing page is the
                place a wrong price does the most damage, so it shows a skeleton
                until it has the real one and no figure at all if the fetch
                fails — Stripe still states the amount at checkout. */}
            <div className="mt-3.5 flex items-baseline gap-2 flex-wrap min-h-10" data-testid="pricing-amount">
              {current ? (
                <>
                  {plan === 'yearly' && saving && (
                    <span className="text-lg text-content/35 line-through tabular-nums">
                      {money(saving.monthlyTotal, current.currency)}
                    </span>
                  )}
                  <span className="text-4xl font-extrabold tabular-nums">
                    {money(current.amount, current.currency)}
                  </span>
                  <span className="text-content/60 text-sm">
                    {t(`pricing.${current.interval === 'year' ? 'perYear' : 'perMonth'}`)}
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
                  data-testid="pricing-amount-pending"
                  className={`h-9 w-36 self-center rounded-lg ${
                    priceStatus === 'error' ? 'bg-transparent' : 'bg-contrast/10 animate-pulse'
                  }`}
                />
              )}
            </div>
            {/* Derived, not written: the old copy said "2 months free" while the
                real discount is ~4.5 months. Both sentences were also still in
                English on all seven locales — they sat inside a JSX expression,
                where the no-literal-string rule cannot see them, while the
                translated keys they needed already existed. */}
            <div className="text-xs text-gold mt-1.5 min-h-4">
              {plan === 'yearly'
                ? saving && monthly && t('pricing.saveAgainstMonthly', {
                  amount: money(saving.saved, monthly.currency),
                  percent: saving.percent,
                })
                : t('pricing.flexibleCancel')}
            </div>
            <div className="text-xs text-content/45 mt-1" data-testid="pricing-vat-note">{t('pricing.vatNote', { rate: formatDecimal(CH_VAT_PERCENT, i18n.language) })}</div>
            <div className="inline-flex mt-2 self-start bg-surface-2 border border-white/8 rounded-[11px] p-1 gap-1">
              <button onClick={() => setPlan('yearly')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${plan === 'yearly' ? 'bg-gradient-to-br from-gold-bright to-gold text-on-gold' : 'text-content/60'}`}>{t('pricing.yearly')}</button>
              <button onClick={() => setPlan('monthly')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${plan === 'monthly' ? 'bg-gradient-to-br from-gold-bright to-gold text-on-gold' : 'text-content/60'}`}>{t('pricing.monthly')}</button>
            </div>
            <div className="mt-5 flex flex-col gap-2.5 text-sm text-content/60">
              <div className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" /><span className="text-content">{t('pricing.everythingInFree')}</span></div>
              {PRO_BENEFITS.map(b => (<div key={b} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{t(`paywall.${b}`)}</div>))}
            </div>
            <button
              onClick={goPro}
              disabled={busy}
              className="mt-6 rounded-xl px-5 py-3 font-semibold bg-gradient-to-br from-gold-bright to-gold
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

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <Reveal className="rounded-3xl border border-white/8 py-14 px-6 text-center bg-[radial-gradient(80%_120%_at_50%_0%,rgba(212,168,71,.12),transparent_60%),var(--color-surface)]">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('landing.closing.eyebrow')}</div>
          <h2 className="mt-3.5 text-3xl md:text-4xl font-extrabold tracking-tight max-w-[16em] mx-auto text-balance">{t('landing.closing.title')}</h2>
          <div className="mt-7 flex justify-center gap-3.5 flex-wrap">
            <button onClick={startFree} className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-on-gold cursor-pointer">{authed ? t('landing.hero.ctaOpen') : t('landing.hero.ctaStart')}</button>
            <a href="#pricing" className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">{t('landing.closing.seePro')}</a>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8">
        {/* text-content/40 fails WCAG AA here (3.53:1 on the near-black
            background); /60 clears the 4.5:1 threshold for this size. */}
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-between items-center gap-4 text-sm text-content/60">
          <div className="flex items-center gap-2.5 font-semibold text-content/80"><span className="w-6 h-6 rounded-md grid place-items-center bg-gradient-to-br from-gold-bright to-gold text-on-gold"><Spade size={13} /></span> Blackjack Trainer</div>
          <div className="flex gap-5 flex-wrap">
            <a href="#features" className="hover:text-content">{t('landing.nav.features')}</a>
            <a href="#pricing" className="hover:text-content">{t('landing.nav.pricing')}</a>
            <Link to="/login" className="hover:text-content">{t('landing.nav.signIn')}</Link>
            <Link to="/terms" className="hover:text-content">{t('landing.footer.terms')}</Link>
            <Link to="/privacy" className="hover:text-content">{t('landing.footer.privacy')}</Link>
            <Link to="/contact" className="hover:text-content">{t('landing.footer.contact')}</Link>
          </div>
          <div>{t('landing.footer.note')}</div>
        </div>
      </footer>
    </div>
  )
}

function HeroLayer() {
  return (
    <>
      <Suspense fallback={null}>
        <HeroCanvas className="absolute inset-0 w-full h-full z-[1]" />
      </Suspense>
      <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: SCRIM }} />
      <div className="absolute inset-0 z-[4] pointer-events-none shadow-[inset_0_0_190px_30px_rgba(0,0,0,.55)]" />
    </>
  )
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: string }) {
  return (
    <div className="max-w-[34em]">
      <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{eyebrow}</div>
      <h2 className="mt-3 text-3xl md:text-[2.375rem] font-extrabold tracking-tight leading-tight text-balance">{title}</h2>
      {sub && <p className="mt-3.5 text-content/60 text-base">{sub}</p>}
    </div>
  )
}

function Dot() { return <span className="w-[3px] h-[3px] rounded-full bg-content/30" /> }
