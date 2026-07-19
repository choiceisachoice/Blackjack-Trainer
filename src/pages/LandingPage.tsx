import { useState, lazy, Suspense, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Spade, Check } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { startCheckout, setPendingCheckout, type BillingPlan } from '../services/supabase/billing'
import { PLAN_OPTIONS, PRO_BENEFITS, formatCHF, yearlySaving } from '../services/pro-features'
import { Reveal } from '../components/landing/Reveal'
import { ManifestoSection } from '../components/landing/ManifestoSection'
import { FeatureShowcase } from '../components/landing/FeatureShowcase'

// The WebGL hero pulls in Three.js — load it as its own chunk after the hero
// text has painted, so it never blocks the landing's first paint.
const HeroCanvas = lazy(() => import('../components/landing/HeroCanvas').then(m => ({ default: m.HeroCanvas })))

const STEPS = [
  { n: '1', title: 'Learn the system', body: 'Hi-Lo tags, the true-count conversion, basic strategy and the deviations that matter — without the jargon wall.' },
  { n: '2', title: 'Drill to reflex', body: 'Timed counting, flashcards and deck estimation until the numbers come without thinking.' },
  { n: '3', title: 'Play the table', body: 'Sit at a full casino session, bet the spread, take the deviations — and watch the analytics find your leaks.' },
]

const FAQS = [
  { q: 'Do I need to pay to start?', a: 'No. Create an account and the free tier gives you Speed Drill, Flashcards, the strategy-chart basics and your own analytics — enough to genuinely learn the count. Upgrade to Pro when you want the live table and the deviations.' },
  { q: 'Is card counting legal?', a: 'Counting cards in your head is legal — it’s just thinking. This is a practice tool to sharpen that skill. Casinos are private businesses and set their own rules, so play responsibly.' },
  { q: 'Which counting system does it teach?', a: 'Hi-Lo — the balanced, level-one system real counters actually use. The engine understands others, but the trainer keeps you focused on the one that works.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Manage or cancel your subscription yourself from your account at any time — you keep Pro until the end of the period you paid for.' },
]

const AMBIENT = 'radial-gradient(55% 45% at 68% 6%, rgba(212,168,71,.12), transparent 62%)'
const SCRIM = 'radial-gradient(46% 50% at 33% 55%, rgba(7,8,9,.9) 26%, rgba(7,8,9,.5) 52%, transparent 76%), linear-gradient(180deg, transparent 58%, var(--color-casino-bg) 97%)'

export function LandingPage() {
  const signedIn = useAuthStore(s => s.status === 'signedIn')
  const authed = !isSupabaseConfigured || signedIn
  const navigate = useNavigate()
  const [plan, setPlan] = useState<BillingPlan>('yearly')

  const current = PLAN_OPTIONS.find(p => p.id === plan)!
  const saving = yearlySaving()

  function startFree() { navigate(authed ? '/app' : '/login') }
  async function goPro() {
    if (!authed) {
      // Remember the intent so checkout resumes automatically after sign-in.
      setPendingCheckout(plan)
      navigate('/login')
      return
    }
    try { await startCheckout(plan) } catch (e) { console.error('checkout failed', e) }
  }

  return (
    <div className="app-canvas text-content overflow-x-hidden">
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[rgba(9,10,12,.6)] border-b border-white/8">
        {/* Tighter padding and gaps below sm: at 360px the wordmark and the
            actions otherwise meet with zero space between them. */}
        <nav className="max-w-6xl mx-auto w-full px-4 sm:px-6 h-[62px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-bold">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-gradient-to-br from-gold-bright to-gold text-casino-bg shrink-0"><Spade size={15} /></span>
            {/* Below 360px the wordmark plus the actions need ~342px, so it
                would wrap to two lines inside a 62px bar. Drop to the mark
                alone there; from 360px up it fits on one line. */}
            <span className="hidden min-[360px]:inline whitespace-nowrap">Blackjack Trainer</span>
          </div>
          <div className="flex items-center gap-4 sm:gap-5 text-sm text-content/70 shrink-0">
            <a href="#features" className="hidden sm:inline hover:text-content">Features</a>
            <a href="#pricing" className="hidden sm:inline hover:text-content">Pricing</a>
            {authed ? (
              <Link to="/app" className="font-semibold text-gold hover:text-gold-bright">Open app →</Link>
            ) : (
              <>
                <Link to="/login" className="hover:text-content">Sign in</Link>
                <button onClick={startFree} className="rounded-lg px-3.5 sm:px-4 py-2.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer whitespace-nowrap">Start free</button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative min-h-[calc(100vh-62px)] flex items-center overflow-hidden">
        <HeroLayer />
        <div className="relative z-[5] w-full">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">Hi-Lo card counting, trained properly</div>
            <h1 className="mt-4 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.02] text-balance max-w-[15ch]">
              Train the <span className="text-gold-gradient">edge</span> that beats the shoe.
            </h1>
            <p className="mt-5 text-lg text-content/60 max-w-[34em]">
              Drills, deviations, a full casino table and the analytics that show exactly where your advantage leaks
              — everything you need to make the count automatic.
            </p>
            <div className="mt-8 flex flex-wrap gap-3.5">
              <button onClick={startFree} className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer shadow-[0_8px_30px_-10px_rgba(212,168,71,.6)]">
                {authed ? 'Open app →' : 'Start free →'}
              </button>
              <a href="#pricing" className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">See what Pro unlocks</a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-content/40">
              <span>No card needed to start</span><Dot /><span>6-deck shoe</span><Dot /><span>Illustrious 18 · Fab 4</span><Dot /><span>Cancel anytime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility strip */}
      <div className="border-y border-white/8 py-4 bg-[rgba(7,8,9,.55)]">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap gap-x-7 gap-y-2 justify-center text-sm text-content/60">
          <span><b className="text-content font-semibold">6 decks</b> · 312 cards</span>
          <span><b className="text-content font-semibold">Hi-Lo</b> counting</span>
          <span><b className="text-content font-semibold">Basic strategy</b> · S17 / H17</span>
          <span><b className="text-content font-semibold">Illustrious 18</b> + Fab 4</span>
          <span><b className="text-content font-semibold">Real</b> casino table</span>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <Reveal>
          <SectionHead eyebrow="Everything in one trainer" title={<>Everything you need to <span className="text-gold-gradient">actually get good</span>.</>}
            sub="Not flashcards in a vacuum — a full path from keeping the count to sitting at a live table and reading your own leaks." />
        </Reveal>
        <FeatureShowcase />
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 pb-8">
        <Reveal>
          <SectionHead eyebrow="How it works" title={<>Learn it. Drill it. Play it.</>} />
        </Reveal>
        <div className="mt-11 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.06}>
              <div className="surface rounded-2xl p-6 h-full">
                <div className="w-7 h-7 rounded-lg grid place-items-center text-sm font-extrabold bg-gradient-to-br from-gold-bright to-gold text-casino-bg mb-3.5">{s.n}</div>
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
          <SectionHead eyebrow="Pricing" title={<>Start free. Go <span className="text-gold-gradient">Pro</span> when you’re ready.</>}
            sub="The free tier is genuinely enough to learn the count. Pro unlocks the real table, the deviations, and the full picture of your edge." />
        </Reveal>
        <Reveal delay={0.06} className="mt-10 grid gap-4 md:grid-cols-[1fr_1.15fr] items-stretch max-w-3xl">
          {/* Free */}
          <div className="surface rounded-2xl p-7 flex flex-col">
            <div className="text-sm uppercase tracking-wide text-content/60 font-semibold">Free</div>
            <div className="mt-3.5 flex items-baseline gap-1.5"><span className="text-4xl font-extrabold">CHF 0</span><span className="text-content/60 text-sm">forever</span></div>
            <div className="text-xs text-gold mt-1.5">No card required</div>
            <div className="mt-5 flex flex-col gap-2.5 text-sm text-content/60">
              {['Speed Drill & Flashcards', 'Strategy Chart (basics)', 'Your basic analytics', 'Awards, levels & the Learn guide'].map(t => (
                <div key={t} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{t}</div>
              ))}
            </div>
            <button onClick={startFree} className="mt-6 rounded-xl px-5 py-3 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors cursor-pointer w-full">Start free</button>
          </div>
          {/* Pro */}
          <div className="rounded-2xl p-7 flex flex-col relative border border-gold/50 bg-[linear-gradient(180deg,rgba(24,20,10,.55),var(--color-surface))] shadow-[0_0_0_1px_rgba(212,168,71,.15),0_40px_80px_-46px_rgba(212,168,71,.4)]">
            <div className="absolute -top-2.5 right-6 text-xs font-extrabold text-casino-bg bg-gradient-to-br from-gold-bright to-gold px-3 py-1 rounded-full">Most popular</div>
            <div className="text-sm uppercase tracking-wide text-content/60 font-semibold">Pro</div>
            <div className="mt-3.5 flex items-baseline gap-2 flex-wrap">
              {plan === 'yearly' && (
                <span className="text-lg text-content/35 line-through tabular-nums">{formatCHF(saving.monthlyTotal)}</span>
              )}
              <span className="text-4xl font-extrabold tabular-nums">{formatCHF(current.amount)}</span>
              <span className="text-content/60 text-sm">{current.cadence}</span>
            </div>
            {/* Derived, not written: the old copy said "2 months free" while the
                real discount is ~4.5 months. */}
            <div className="text-xs text-gold mt-1.5 min-h-4">
              {plan === 'yearly'
                ? `Save ${formatCHF(saving.saved)} — ${saving.percent}% off monthly`
                : 'Flexible — cancel anytime'}
            </div>
            <div className="inline-flex mt-2 self-start bg-surface-2 border border-white/8 rounded-[11px] p-1 gap-1">
              <button onClick={() => setPlan('yearly')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${plan === 'yearly' ? 'bg-gradient-to-br from-gold-bright to-gold text-casino-bg' : 'text-content/60'}`}>Yearly</button>
              <button onClick={() => setPlan('monthly')} className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${plan === 'monthly' ? 'bg-gradient-to-br from-gold-bright to-gold text-casino-bg' : 'text-content/60'}`}>Monthly</button>
            </div>
            <div className="mt-5 flex flex-col gap-2.5 text-sm text-content/60">
              <div className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" /><span className="text-content">Everything in Free, plus:</span></div>
              {PRO_BENEFITS.map(b => (<div key={b} className="flex gap-2.5 items-start"><Check size={16} className="text-gold shrink-0 mt-0.5" />{b}</div>))}
            </div>
            <button onClick={goPro} className="mt-6 rounded-xl px-5 py-3 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer w-full">Go Pro →</button>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-8">
        <Reveal>
          <SectionHead eyebrow="Good to know" title={<>Questions, answered.</>} />
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
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">Ready when you are</div>
          <h2 className="mt-3.5 text-3xl md:text-4xl font-extrabold tracking-tight max-w-[16em] mx-auto text-balance">Turn the count into an edge you can feel.</h2>
          <div className="mt-7 flex justify-center gap-3.5 flex-wrap">
            <button onClick={startFree} className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer">{authed ? 'Open app →' : 'Start free →'}</button>
            <a href="#pricing" className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55 transition-colors">See Pro</a>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/8 py-8">
        {/* text-content/40 fails WCAG AA here (3.53:1 on the near-black
            background); /60 clears the 4.5:1 threshold for this size. */}
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-between items-center gap-4 text-sm text-content/60">
          <div className="flex items-center gap-2.5 font-semibold text-content/80"><span className="w-6 h-6 rounded-md grid place-items-center bg-gradient-to-br from-gold-bright to-gold text-casino-bg"><Spade size={13} /></span> Blackjack Trainer</div>
          <div className="flex gap-5 flex-wrap"><a href="#features" className="hover:text-content">Features</a><a href="#pricing" className="hover:text-content">Pricing</a><Link to="/login" className="hover:text-content">Sign in</Link></div>
          <div>Practice tool — not affiliated with any casino.</div>
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
      <div className="absolute inset-0 z-[2] pointer-events-none" style={{ background: AMBIENT }} />
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
