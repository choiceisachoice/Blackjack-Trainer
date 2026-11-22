import {
  Zap, Spade, GraduationCap, Coins, Layers, Club,
  BarChart3, Grid3x3, Trophy, BookOpen, Route, Volume2, VolumeX, LogOut,
  Lock, Crown, Settings, Loader2,
  type LucideIcon, Menu, ChevronDown,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { LanguageSwitcher } from '../common/LanguageSwitcher'
import { useAuthStore, isSupabaseConfigured } from '../../store/auth-store'
import { useIsPro } from '../../store/entitlement-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { isModeLocked } from '../../services/pro-features'
import { useTrialOpen } from '../../store/casino-trial-store'
import { useGuardedSignOut } from '../../hooks/use-guarded-sign-out'
import { UnsavedSignOutDialog } from '../common/UnsavedSignOutDialog'
import { LevelBadge } from './LevelBadge'
import { Avatar } from '../common/Avatar'
import { avatarOf } from '../../services/supabase/profile-avatar'
import { resolveAvatar } from '../../services/avatar-catalog'
import { useLevelStore } from '../../store/level-store'
import { useAchievementStore } from '../../store/achievement-store'

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
 * plus the counting-system indicator, the sound toggle and the level badge.
 */
export function NavBar() {
  const currentMode = useAppStore(s => s.currentMode)
  const { t, i18n } = useTranslation()
  const rawSetMode = useAppStore(s => s.setMode)
  const requestLeave = useLiveSessionStore(s => s.requestLeave)
  const requestLeaveApp = useLiveSessionStore(s => s.requestLeaveApp)
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
  const authStatus = useAuthStore(s => s.status)
  // The chosen profile picture takes the gear's place once there is one —
  // the way every account menu people know works.
  // Resolved against the stores, not trusted from the metadata: a picture
  // that was not earned is not drawn, whatever the account says.
  const chosenAvatar = useAuthStore(s => avatarOf(s.user))
  const levelNumber = useLevelStore(s => s.level.level)
  const unlockedIds = useAchievementStore(s => s.unlockedIds)
  const avatar = resolveAvatar(chosenAvatar, { level: levelNumber, unlockedAchievementIds: unlockedIds })
  const signedIn = isSupabaseConfigured && authStatus === 'signedIn'
  const isPro = useIsPro()
  const trialOpen = useTrialOpen()
  const showUpgradeModal = useUpgradePrompt(s => s.show)
  const navigate = useNavigate()
  /**
   * Signing out is a security action, so it does not get optimistic treatment —
   * but it must not look broken either. Without a pending state the button did
   * nothing visible for the whole round trip and could be fired repeatedly.
   */
  const guardedSignOut = useGuardedSignOut(() => void navigate('/'))
  const signingOut = guardedSignOut.busy

  /**
   * The menu that holds what the bar cannot label.
   *
   * The five secondary destinations — Plan, Learn, Analytics, Strategy,
   * Awards — were icons with a tooltip at every width below 2100px, which is
   * every screen anyone uses. A tooltip does not exist on a touch screen, and
   * on a desktop it is something you find by accident: five features that a
   * newcomer could only identify by trying them. They are a menu now, under
   * a button that says so, each with its name beside its icon.
   *
   * On a phone the same menu also lists the five training modes: the strip
   * that holds them scrolls sideways there with nothing to show that it does,
   * and two of the five sat off screen.
   *
   * The button reads the name of the current screen when that screen is one
   * of its own, so the bar always shows where you are.
   */
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const activeTool = TOOL_ITEMS.find(item => item.mode === currentMode)

  /**
   * Whether the five training tabs fit beside everything else in the bar.
   *
   * Measured, not assumed from a breakpoint. The strip was shown from 768px
   * up and scrolled sideways with its scrollbar hidden when it did not fit:
   * on a phone held sideways (844px) it needed 564px and had 486, so "Casino"
   * was cut in half with nothing to say there was more. How much room there
   * is depends on the language and on whether someone is signed in, which no
   * single breakpoint knows. When the tabs do not fit they leave the bar as a
   * group and the menu lists them — the same menu a phone already gets.
   *
   * While hidden, the strip stays in the document (out of the flow, invisible
   * and inert) so that its natural width can still be read.
   */
  const barRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLButtonElement>(null)
  const [tabsFit, setTabsFit] = useState(true)
  useLayoutEffect(() => {
    const bar = barRef.current
    const tabs = tabsRef.current
    const menu = menuRef.current
    const right = rightRef.current
    const brand = brandRef.current
    if (!bar || !tabs || !menu || !right || !brand) return
    const measure = () => {
      const style = getComputedStyle(bar)
      const gap = parseFloat(style.columnGap) || 0
      const inner = bar.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      // Brand, tabs, menu button, spacer, right cluster: four gaps.
      const room = inner - brand.offsetWidth - menu.offsetWidth - right.offsetWidth - gap * 4
      const needed = tabs.scrollWidth
      // A little slack before the tabs come back, so a width at the very
      // edge does not flip between the two states (the button's own label,
      // and so its width, differs between them).
      setTabsFit(fit => needed + (fit ? 0 : 24) <= room)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    for (const el of [bar, tabs, menu, right, brand]) observer.observe(el)
    return () => observer.disconnect()
  }, [i18n.language, signedIn, isPro, currentMode])

  /** Keep the open menu inside the screen: it is 256px wide and the button can sit near the right edge. */
  const menuPanelRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const panel = menuPanelRef.current
    if (!menuOpen || !panel) return
    panel.style.setProperty('--shift', '0px')
    const box = panel.getBoundingClientRect()
    const width = document.documentElement.clientWidth
    const margin = 8
    let shift = 0
    if (box.right > width - margin) shift = width - margin - box.right
    if (box.left + shift < margin) shift = margin - box.left
    panel.style.setProperty('--shift', `${Math.round(shift)}px`)
  }, [menuOpen, tabsFit])

  /** One row of the menu: icon, name, lock. 44px tall — it is the touch target. */
  const renderMenuRow = ({ mode, icon: Icon }: NavItem, testId: string) => {
    const active = currentMode === mode
    const proLocked = isModeLocked(mode, isPro, trialOpen)
    return (
      <button
        key={mode}
        role="menuitem"
        onClick={() => { setMenuOpen(false); setMode(mode) }}
        data-testid={testId}
        className={`flex items-center gap-3 w-full h-11 px-3 rounded-lg text-sm text-left cursor-pointer
          ${active ? 'text-gold bg-gold/10' : 'text-content/80 hover:text-content hover:bg-contrast/5'}`}
      >
        <Icon size={17} className={active ? 'text-gold' : 'text-content/50'} />
        <span className="font-medium flex-1">{t(`nav.modes.${mode}`)}</span>
        {proLocked && <Lock size={12} className="text-gold/70" aria-label={t('nav.proFeature')} />}
      </button>
    )
  }

  const signOut = async () => {
    if (signingOut) return
    // Signing out leaves the app, which unmounts the session for good. The
    // dialog answers by navigating, so the sign-out itself has to wait for the
    // route change rather than run behind it.
    if (!requestLeaveApp({ kind: 'signOut' })) return
    // `signOutAndClearLocal` clears this device before it talks to the server
    // and never rejects, so a failed revoke does not leave someone parked on a
    // signed-in screen. The one case in which it does not sign out — sessions
    // that could not be uploaded — is asked about below.
    await guardedSignOut.signOut()
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
  const renderItem = ({ mode, icon: Icon }: NavItem) => {
    const label = t(`nav.modes.${mode}`)
    const active = currentMode === mode
    const proLocked = isModeLocked(mode, isPro, trialOpen)
    return (
      <button
        key={mode}
        onClick={() => setMode(mode)}
        data-testid={`nav-${mode}`}
        // Named on the element, not only by its text: an icon whose label is
        // not drawn is otherwise a button that only its author can identify.
        title={label}
        aria-label={label}
        className={`glow-hover group relative flex items-center gap-2 px-2.5 h-10 md:h-9 rounded-lg text-sm whitespace-nowrap cursor-pointer
          ${active
            ? 'text-gold bg-gold/10 border border-gold/30'
            : 'text-content/60 hover:text-content border border-transparent hover:bg-contrast/5'}`}
      >
        {/* On a tablet's width the five names alone fill the strip — in German
            they are "Lernkarten" and "Bet Spread", the words the screens
            themselves use — so there the icons give way to them. */}
        <Icon size={16} className={`max-lg:hidden ${active ? 'text-gold' : 'text-content/50 group-hover:text-gold'}`} />
        {/* Hidden with `display`, so it leaves the layout *and* keeps no stray
            flex gap behind — but stays in the document for assistive tech. */}
        <span className="font-medium">{label}</span>
        {proLocked && <Lock size={11} className="text-gold/70" aria-label={t('nav.proFeature')} />}
      </button>
    )
  }

  return (
    <header className="sticky top-0 z-40 shrink-0">
      <div
        ref={barRef}
        className="relative h-14 flex items-center gap-4 px-4 border-b border-contrast/10 backdrop-blur-xl"
        style={{ backgroundColor: 'var(--color-topbar)' }}
      >
        {/* Brand */}
        <button
          ref={brandRef}
          onClick={() => setMode('home')}
          data-testid="nav-home"
          aria-label={t('nav.home')}
          title={t('nav.home')}
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
        <nav
          ref={tabsRef}
          data-testid="nav-tabs"
          data-fits={tabsFit}
          inert={!tabsFit}
          className={`order-3 md:order-2 hidden md:flex items-center gap-1 shrink-0
            ${tabsFit ? '' : 'md:absolute md:left-0 md:top-0 md:invisible md:pointer-events-none'}`}
        >
          {TRAIN_ITEMS.map(item => renderItem(item))}
        </nav>

        <div ref={menuRef} className="order-2 md:order-3 relative shrink-0">
          <button
            onClick={() => setMenuOpen(open => !open)}
            data-testid="nav-more"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={`glow-hover flex items-center gap-1.5 h-10 md:h-9 px-3 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer
              ${activeTool || menuOpen
                ? 'text-gold bg-gold/10 border border-gold/30'
                : 'text-content/70 hover:text-content border border-contrast/10 hover:bg-contrast/5'}`}
          >
            {/* "Menu" while it holds the training modes as well — on a phone,
                and wherever the tabs did not fit; "More" beside the tabs. */}
            <Menu size={16} className={tabsFit ? 'md:hidden' : ''} />
            <span className={tabsFit ? 'md:hidden' : ''}>{t('nav.menu')}</span>
            <span className={tabsFit ? 'hidden md:inline' : 'hidden'}>{activeTool ? t(`nav.modes.${activeTool.mode}`) : t('nav.more')}</span>
            <ChevronDown size={14} className={`${tabsFit ? 'hidden md:block' : 'hidden'} transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              data-testid="nav-menu"
              ref={menuPanelRef}
              className="absolute left-0 top-full mt-2 w-64 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-4.5rem)] overflow-y-auto p-1.5 rounded-xl border border-contrast/12 shadow-[0_18px_50px_-12px_rgba(0,0,0,.8)] z-50"
              style={{ backgroundColor: 'var(--color-surface-2)', transform: 'translateX(var(--shift, 0px))' }}
            >
              {/* The training modes, for the width at which the strip beside
                  this button cannot show all five. */}
              <div className={`${tabsFit ? 'md:hidden ' : ''}pb-1.5 mb-1.5 border-b border-contrast/10`}>
                {TRAIN_ITEMS.map(item => renderMenuRow(item, `menu-${item.mode}`))}
              </div>
              {TOOL_ITEMS.map(item => renderMenuRow(item, `nav-${item.mode}`))}
            </div>
          )}
        </div>

        <div className="order-4 flex-1 min-w-0" aria-hidden />

        {/* Right cluster */}
        <div ref={rightRef} className="order-5 flex items-center gap-2 shrink-0">
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
              onClick={() => { if (requestLeaveApp({ kind: 'route', path: '/account' })) void navigate('/account') }}
              data-testid="account"
              aria-label={t('nav.accountAndBilling')}
              title={t('nav.accountAndBilling')}
              className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
            >
              {avatar ? <Avatar id={avatar} initial="" size={22} className="rounded-md" /> : <Settings size={17} />}
            </button>
          )}
          <LanguageSwitcher />
          <button
            onClick={toggleSound}
            data-testid="sound-toggle"
            // A switch: one name, a pressed state, and an icon and a tooltip
            // that both show that state. The label used to name the action
            // ("mute") under an icon that showed the state (a sounding
            // speaker) — and in German the action labels, "Ton aus" / "Ton
            // an", read as states, so the button said "off" while it was on.
            aria-label={t('nav.sound')}
            aria-pressed={soundEnabled}
            title={soundEnabled ? t('nav.soundOn') : t('nav.soundOff')}
            className="grid place-items-center w-8 h-8 rounded-lg text-content/50 hover:text-gold hover:bg-contrast/5 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
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
      {guardedSignOut.unsavedCount !== null && (
        <UnsavedSignOutDialog
          count={guardedSignOut.unsavedCount}
          busy={guardedSignOut.busy}
          onStay={guardedSignOut.stay}
          onSignOut={() => void guardedSignOut.signOutAnyway()}
        />
      )}
    </header>
  )
}
