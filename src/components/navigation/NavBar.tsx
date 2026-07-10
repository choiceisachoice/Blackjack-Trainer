import {
  Zap, Spade, GraduationCap, Coins, Layers, Club,
  BarChart3, Grid3x3, Trophy, BookOpen, Volume2, VolumeX, Sun, Moon, LogOut,
  Lock, Crown, Settings,
  type LucideIcon,
} from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useAuthStore, isSupabaseConfigured } from '../../store/auth-store'
import { useIsPro } from '../../store/entitlement-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { isProMode } from '../../services/pro-features'
import { openBillingPortal } from '../../services/supabase/billing'
import { signOutAndClearLocal } from '../../services/supabase/cloud-sync'
import { LevelBadge } from './LevelBadge'

interface NavItem {
  mode: AppMode
  label: string
  icon: LucideIcon
}

/** Primary training features shown in the top navigation. */
const TRAIN_ITEMS: NavItem[] = [
  { mode: 'speedDrill', label: 'Speed', icon: Zap },
  { mode: 'deviationTraining', label: 'Flashcards', icon: GraduationCap },
  { mode: 'betSpread', label: 'Bet Spread', icon: Coins },
  { mode: 'deckEstimation', label: 'Decks', icon: Layers },
  { mode: 'casinoSession', label: 'Casino', icon: Club },
]

/** Secondary "tools" features. */
const TOOL_ITEMS: NavItem[] = [
  { mode: 'learn', label: 'Learn', icon: BookOpen },
  { mode: 'analytics', label: 'Analytics', icon: BarChart3 },
  { mode: 'strategyChart', label: 'Strategy', icon: Grid3x3 },
  { mode: 'achievements', label: 'Awards', icon: Trophy },
]

/**
 * Global top navigation bar. Shown on every screen (home + all modes).
 * Provides one-click access to all features with an active-state highlight,
 * plus the counting-system indicator, sound and theme toggles, and the level badge.
 */
export function NavBar() {
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const soundEnabled = useAppStore(s => s.soundEnabled)
  const toggleSound = useAppStore(s => s.toggleSound)
  const theme = useAppStore(s => s.theme)
  const toggleTheme = useAppStore(s => s.toggleTheme)
  const authStatus = useAuthStore(s => s.status)
  const showSignOut = isSupabaseConfigured && authStatus === 'signedIn'
  const isPro = useIsPro()
  const showBilling = isSupabaseConfigured && authStatus === 'signedIn'
  const showUpgradeModal = useUpgradePrompt(s => s.show)

  const renderItem = ({ mode, label, icon: Icon }: NavItem) => {
    const active = currentMode === mode
    const proLocked = !isPro && isProMode(mode)
    return (
      <button
        key={mode}
        onClick={() => setMode(mode)}
        data-testid={`nav-${mode}`}
        className={`glow-hover group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap cursor-pointer
          ${active
            ? 'text-gold bg-gold/10 border border-gold/30'
            : 'text-content/60 hover:text-content border border-transparent hover:bg-contrast/5'}`}
      >
        <Icon size={16} className={active ? 'text-gold' : 'text-content/50 group-hover:text-gold'} />
        <span className="font-medium">{label}</span>
        {proLocked && <Lock size={11} className="text-gold/70" aria-label="Pro feature" />}
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
          <span className="hidden sm:flex flex-col leading-none text-left">
            <span className="text-[13px] font-extrabold tracking-[0.18em] text-gold-gradient">BLACKJACK</span>
            <span className="text-[9px] font-medium tracking-[0.32em] text-content/40">TRAINER</span>
          </span>
        </button>

        {/* Nav links (scrollable on small screens) */}
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {TRAIN_ITEMS.map(renderItem)}
          <span className="mx-1 h-5 w-px bg-contrast/10 shrink-0" aria-hidden />
          {TOOL_ITEMS.map(renderItem)}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-2 shrink-0">
          {showBilling && (
            isPro ? (
              <button
                onClick={() => { void openBillingPortal() }}
                data-testid="manage-subscription"
                aria-label="Manage subscription"
                title="Manage subscription"
                className="grid place-items-center w-8 h-8 rounded-lg text-gold/70 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
              >
                <Settings size={17} />
              </button>
            ) : (
              <button
                onClick={() => showUpgradeModal()}
                data-testid="go-pro"
                className="glow-hover flex items-center gap-1.5 pl-2.5 pr-3 h-8 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm font-semibold whitespace-nowrap cursor-pointer hover:bg-gold/15"
              >
                <Crown size={15} />
                <span className="hidden sm:inline">Go Pro</span>
              </button>
            )
          )}
          <button
            onClick={toggleSound}
            data-testid="sound-toggle"
            aria-label={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
            className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button
            onClick={toggleTheme}
            data-testid="theme-toggle"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {showSignOut && (
            <button
              onClick={() => { void signOutAndClearLocal() }}
              data-testid="sign-out"
              aria-label="Sign out"
              title="Sign out"
              className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
            >
              <LogOut size={17} />
            </button>
          )}
          <div className="hidden sm:block pl-1">
            <LevelBadge />
          </div>
        </div>
      </div>
      <div className="hairline" />
    </header>
  )
}
