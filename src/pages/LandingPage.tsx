import { Link } from 'react-router-dom'
import { Spade } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/**
 * Public marketing landing at `/`. Placeholder shell for the routing slice — the
 * full landing (WebGL hero, features, pricing, FAQ) lands in the next slice. Kept
 * intentionally light so `/` renders cleanly for both signed-out and signed-in
 * visitors.
 */
export function LandingPage() {
  const signedIn = useAuthStore(s => s.status === 'signedIn')
  const authed = !isSupabaseConfigured || signedIn

  return (
    <div className="min-h-screen flex flex-col bg-casino-bg text-content">
      <header className="border-b border-white/8">
        <nav className="max-w-6xl mx-auto w-full px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-gradient-to-br from-gold-bright to-gold text-casino-bg">
              <Spade size={15} />
            </span>
            Blackjack Trainer
          </div>
          <div className="flex items-center gap-5 text-sm">
            {authed ? (
              <Link to="/app" className="font-semibold text-gold hover:text-gold-bright">Open app →</Link>
            ) : (
              <>
                <Link to="/login" className="text-content/70 hover:text-content">Sign in</Link>
                <Link
                  to="/login"
                  className="rounded-lg px-4 py-2.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg"
                >
                  Start free
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto w-full px-6 py-20">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">
            Hi-Lo card counting, trained properly
          </div>
          <h1 className="mt-4 text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.03] text-balance max-w-[15ch]">
            Train the <span className="text-gold-gradient">edge</span> that beats the shoe.
          </h1>
          <p className="mt-5 text-lg text-content/60 max-w-[34em]">
            Drills, deviations, a full casino table and the analytics that show exactly where your
            advantage leaks — everything you need to make the count automatic.
          </p>
          <div className="mt-8 flex flex-wrap gap-3.5">
            <Link
              to={authed ? '/app' : '/login'}
              className="rounded-xl px-6 py-3.5 font-semibold bg-gradient-to-br from-gold-bright to-gold text-casino-bg"
            >
              {authed ? 'Open app →' : 'Start free →'}
            </Link>
            {!authed && (
              <Link
                to="/login"
                className="rounded-xl px-6 py-3.5 font-semibold border border-white/12 text-content hover:border-gold/55"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
