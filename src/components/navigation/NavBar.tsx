import {
  Zap, Spade, GraduationCap, Coins, Layers, Club,
  BarChart3, Grid3x3, Trophy, BookOpen, Route, Volume2, VolumeX, Sun, Moon, LogOut,
  Lock, Crown, Settings, Loader2,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { useAuthStore, isSupabaseConfigured } from '../../store/auth-store'
import { useIsPro } from '../../store/entitlement-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { isProMode } from '../../services/pro-features'
import { signOutAndClearLocal } from '../../services/supabase/cloud-sync'
import { LevelBadge } from './LevelBadge'

interface NavItem {
  mode: AppMode
  icon: LucideIcon
}

/**
 * The label comes from `nav.modes.<mode>`, not from a field here.
 *
 * The mode id already names the destination, so carrying an English string
 * beside it would be a second source of truth that only English readers ever
 * see corrected.
 */

/** Primary training features shown in the top navigation. */
const TRAIN_ITEMS: NavItem[] = [
  { mode: 'speedDrill', icon: Zap },
  { mode: 'deviationTraining', icon: GraduationCap },
  { mode: 'betSpread', icon: Coins },
  { mode: 'deckEstimation', icon: Layers },
  { mode: 'casinoSession', icon: Club },
]

/** Secondary "tools" features. */
const TOOL_ITEMS: NavItem[] = [
  // The plan answers "what do I do next"; Learn is the reference beside it.
  { mode: 'plan', icon: Route },
  { mode: 'learn', icon: BookOpen },
  { mode: 'analytics', icon: BarChart3 },
  { mode: 'strategyChart', icon: Grid3x3 },
  { mode: 'achievements', icon: Trophy },
]

/**
 * Global top navigation bar. Shown on every screen (home + all modes).
 * Provides one-click access to all features with an active-state highlight,
 * plus the counting-system indicator, sound and theme toggles, and the level badge.
 */
export function NavBar() {
  const currentMode = useAppStore(s => s.currentMode)
  const { t } = useTranslation()
  const rawSetMode = useAppStore(s => s.setMode)
  const requestLeave = useLiveSessionStore(s => s.requestLeave)
  /**
   * Every mode change in this bar goes through the live-session guard.
   *
   * Not through `setMode` directly: the wordmark and the nav items are the two
   * clicks that used to end a running Casino Session without a word, and a
   * guard that each button has to remember to call is a guard the next button
   * will forget.
   */
  const setMode = (mode: Parameters<typeof rawSetMode>[0]) => {
    if (requestLeave(mode)) rawSetMode(mode)
  }
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const toggleSound = useAppStore(s => s.toggleSound)
  const theme = useAppStore(s => s.theme)
  const toggleTheme = useAppStore(s => s.toggleTheme)
  const authStatus = useAuthStore(s => s.status)
  const signedIn = isSupabaseConfigured && authStatus === 'signedIn'
  const isPro = useIsPro()
  const showUpgradeModal = useUpgradePrompt(s => s.show)
  const navigate = useNavigate()
  /**
   * Signing out is a security action, so it does not get optimistic treatment —
   * but it must not look broken either. Without a pending state the button did
   * nothing visible for the whole round trip and could be fired repeatedly.
   */
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    // `signOutAndClearLocal` clears this device before it talks to the server
    // and never rejects, so navigating afterwards is unconditional: a failed
    // revoke must not leave someone parked on a signed-in screen.
    await signOutAndClearLocal()
    navigate('/')
  }

  /**
   * @param compact Drop the label until there is genuinely room for it.
   *
   * ## Why anything is hidden at all
   *
   * The strip is `overflow-x-auto no-scrollbar`, so what did not fit was never
   * truncated — it was *hidden*. At 1520px "Strategy" and "Awards" sat 212px
   * outside the visible area with no scrollbar, no fade and nothing to suggest
   * they existed. Two features, invisible, on a common laptop.
   *
   * ## The measurements
   *
   * Taken in a browser, not estimated: the ten items need **850px** with the
   * tools compact and **1169px** with every label — the five tool labels alone
   * cost 319. The wordmark is ~120, the level badge ~230, and signing in adds
   * **210** for Go Pro, settings and sign-out. That last figure is why the dev
   * harness cannot be trusted here on its own: it runs without Supabase and so
   * always renders signed *out*, which is 210px more generous than production.
   *
   * ## The order things go in
   *
   * Navigation, then status, then decoration — and navigation never goes. So
   * the wordmark yields first, then the level badge, and the tool labels last,
   * each at the width where the signed-in bar still has slack:
   *
   *   <1400  brand icon only
   *   <1700  no level badge
   *   <2100  tools are icons with `title`/`aria-label`
   *
   * Ten labelled items, a badge and the account controls together need roughly
   * two thousand pixels. That is not a threshold anyone reaches by accident,
   * and it is the honest reading of a bar carrying more than it can hold — the
   * real fix is fewer top-level destinations, which is a product decision.
   */
  const renderItem = ({ mode, icon: Icon }: NavItem, compact = false) => {
    const label = t(`nav.modes.${mode}`)
    const active = currentMode === mode
    const proLocked = !isPro && isProMode(mode)
    return (
      <button
        key={mode}
        onClick={() => setMode(mode)}
        data-testid={`nav-${mode}`}
        // Named on the element, not only by its text: an icon whose label is
        // not drawn is otherwise a button that only its author can identify.
        title={label}
        aria-label={label}
        className={`glow-hover group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap cursor-pointer
          ${active
            ? 'text-gold bg-gold/10 border border-gold/30'
            : 'text-content/60 hover:text-content border border-transparent hover:bg-contrast/5'}`}
      >
        <Icon size={16} className={active ? 'text-gold' : 'text-content/50 group-hover:text-gold'} />
        {/* Hidden with `display`, so it leaves the layout *and* keeps no stray
            flex gap behind — but stays in the document for assistive tech. */}
        <span className={`font-medium ${compact ? 'hidden min-[2100px]:inline' : ''}`}>{label}</span>
        {proLocked && <Lock size={11} className="text-gold/70" aria-label={t('nav.proFeature')} />}
      </button>
    )
  }

  return (
    <header className="sticky top-0 z-40 shrink-0">
      <div
        className="h-14 flex items-center gap-4 px-4 border-b border-contrast/10 backdrop-blur-xl"
        style={{ backgroundColor: 'var(--color-topbar)' }}
      >
        {/* Brand */}
        <button
          onClick={() => setMode('home')}
          data-testid="nav-home"
          className="group flex items-center gap-2.5 shrink-0 cursor-pointer"
        >
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-gold/15 border border-gold/30 text-gold
            transition-shadow duration-200 group-hover:shadow-[0_0_18px_-4px_var(--color-gold)]">
            <Spade size={17} className="fill-current" />
          </span>
          {/* The wordmark is the first thing to go when space runs short: the
              spade still identifies the app and still links home, and losing
              decoration costs less than losing a way to reach a feature. */}
          <span className="hidden min-[1400px]:flex flex-col leading-none text-left">
            <span className="text-[0.85rem] font-extrabold tracking-[0.18em] text-gold-gradient">BLACKJACK</span>
            <span className="text-[0.65rem] font-medium tracking-[0.32em] text-content/40">TRAINER</span>
          </span>
        </button>

        {/* Nav links (scrollable on small screens) */}
        {/* The training modes keep their labels — they are what the product is
            for. The tools group is the one that collapses. */}
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {TRAIN_ITEMS.map(item => renderItem(item))}
          <span className="mx-1 h-5 w-px bg-contrast/10 shrink-0" aria-hidden />
          {TOOL_ITEMS.map(item => renderItem(item, true))}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {signedIn && !isPro && (
            <button
              onClick={() => showUpgradeModal()}
              data-testid="go-pro"
              className="glow-hover flex items-center gap-1.5 pl-2.5 pr-3 h-8 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-gold/15"
            >
              <Crown size={15} />
              <span className="hidden min-[1400px]:inline">{t('nav.goPro')}</span>
            </button>
          )}
          {signedIn && (
            <button
              onClick={() => navigate('/account')}
              data-testid="account"
              aria-label={t('nav.accountAndBilling')}
              title={t('nav.accountAndBilling')}
              className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
            >
              <Settings size={17} />
            </button>
          )}
          <LanguageSwitcher />
          <button
            onClick={toggleSound}
            data-testid="sound-toggle"
            aria-label={soundEnabled ? t('nav.muteSounds') : t('nav.enableSounds')}
            title={soundEnabled ? t('nav.muteSounds') : t('nav.enableSounds')}
            className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            onClick={toggleTheme}
            data-testid="theme-toggle"
            aria-label={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
            title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
            className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {signedIn && (
            <button
              onClick={signOut}
              disabled={signingOut}
              data-testid="sign-out"
              aria-label={t('nav.signOut')}
              title={t('nav.signOut')}
              className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              {signingOut ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />}
            </button>
          )}
          {/*
            Status, not navigation — so it yields before any nav item does, and
            it yields early because it is the single widest thing in this bar
            (~230px). The same figure is on the home screen.

            Its threshold also carries the case the dev harness cannot show. The
            harness runs without Supabase, so it renders *signed out*: no
            "Go Pro", no settings, no sign-out. Signed in, this cluster is around
            180px wider, which is exactly enough to put the overflow back. The
            measurements below were taken signed out; this number is the margin
            for the state that ships.
          */}
          <div className="hidden min-[1700px]:block pl-1">
            <LevelBadge />
          </div>
        </div>
      </div>
      <div className="hairline" />
    </header>
  )
}
