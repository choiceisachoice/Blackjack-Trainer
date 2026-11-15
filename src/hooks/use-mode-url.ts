import { useEffect, useRef, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore, type AppMode } from '../store/app-store'
import { useLiveSessionStore } from '../store/live-session-store'

/**
 * The address of every screen in the app.
 *
 * Until 15 Nov 2026 all thirteen modes lived at `/app`. The browser's Back
 * button left the app instead of going back a screen, a refresh threw the
 * learner onto the home screen, and no mode could be linked from a video, a
 * short or an email. The slugs are short, English in every language (the URL
 * a person shares should not change with their settings), and once published
 * they are a promise: rename one and every link to it breaks.
 */
export const MODE_SLUGS: Readonly<Record<AppMode, string>> = {
  home: '',
  plan: 'plan',
  speedDrill: 'speed',
  deviationTraining: 'flashcards',
  betSpread: 'bet-spread',
  deckEstimation: 'decks',
  casinoSession: 'casino',
  casinoSessionTracker: 'casino-log',
  bankrollSim: 'bankroll',
  analytics: 'analytics',
  strategyChart: 'strategy',
  achievements: 'awards',
  learn: 'learn',
}

const MODE_BY_SLUG: ReadonlyMap<string, AppMode> = new Map(
  (Object.entries(MODE_SLUGS) as [AppMode, string][]).map(([mode, slug]) => [slug, mode]),
)

/**
 * The URL of a mode, without the language prefix (the router adds it).
 *
 * @param mode - The screen
 * @returns `/app` for home, `/app/<slug>` for everything else
 */
export function modePath(mode: AppMode): string {
  const slug = MODE_SLUGS[mode]
  return slug ? `/app/${slug}` : '/app'
}

/**
 * The mode a pathname names.
 *
 * @param pathname - As the router reports it, prefix already removed
 * @returns The mode; `home` for `/app` itself; `null` for a path outside the
 *   app or a slug that does not exist
 */
export function modeFromPath(pathname: string): AppMode | null {
  const m = /^\/app(?:\/([^/]*))?\/?$/.exec(pathname)
  if (!m) return null
  return MODE_BY_SLUG.get(m[1] ?? '') ?? null
}

/**
 * Keep the app's mode and the address bar in step, both ways.
 *
 * The store stays the source of truth for navigation inside the app — 26 call
 * sites switch modes through `setMode`, and none of them has to know about
 * URLs. This hook listens to both sides:
 *
 * - **The URL on arrival** (a refresh, a link, a bookmark) sets the mode. A
 *   slug that does not exist is corrected to `/app` rather than left in the
 *   address bar.
 * - **A mode change** in the store becomes a history entry, so Back returns
 *   to the previous screen.
 * - **Back and Forward** change the URL, and the URL changes the mode — unless
 *   a casino hand is in play on screen, in which case the leave question is
 *   asked first (the same one the in-app buttons raise) and the address bar is
 *   put back until it is answered.
 *
 * It also starts each screen at the top. The inner scroller is shared by every
 * mode, so scrolling home down to the tools and opening Learn used to open
 * Learn half-way down.
 *
 * Inert outside `/app` (the trainer's tests render it at `/`).
 *
 * @param scrollerRef - The element the modes scroll in
 */
export function useModeUrl(scrollerRef: RefObject<HTMLElement | null>): void {
  const location = useLocation()
  const navigate = useNavigate()
  const currentMode = useAppStore(s => s.currentMode)
  const setMode = useAppStore(s => s.setMode)
  const inApp = /^\/app(\/|$)/.test(location.pathname)

  // URL → mode, on arrival and on Back/Forward.
  const urlMode = inApp ? modeFromPath(location.pathname) : null
  const lastUrl = useRef<string | null>(null)
  useEffect(() => {
    if (!inApp) return
    if (lastUrl.current === location.pathname) return
    lastUrl.current = location.pathname

    if (urlMode === null) {
      // Not a screen we have: correct the address rather than show it.
      void navigate(modePath(useAppStore.getState().currentMode), { replace: true })
      return
    }
    const now = useAppStore.getState().currentMode
    if (urlMode === now) return
    if (useLiveSessionStore.getState().requestLeave(urlMode)) {
      setMode(urlMode)
    } else {
      // The leave question is up. Show the screen that is still on screen;
      // if the player confirms, the dialog's `setMode` brings the URL along.
      lastUrl.current = modePath(now)
      void navigate(modePath(now), { replace: true })
    }
  }, [inApp, location.pathname, urlMode, navigate, setMode])

  // Mode → URL, for every in-app switch.
  useEffect(() => {
    if (!inApp) return
    // The store's value, not this render's: on arrival the effect above has
    // just set the mode from the URL, and this render still holds the old one.
    // Reading the stale value pushed `/app` straight over a deep link.
    const path = modePath(useAppStore.getState().currentMode)
    if (path === lastUrl.current) return
    lastUrl.current = path
    void navigate(path)
  }, [inApp, currentMode, navigate])

  // Each screen starts at the top.
  useEffect(() => {
    scrollerRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
  }, [currentMode, scrollerRef])

  // A refresh or a closed tab destroys a hand in progress, and there is no
  // in-app dialog that can stand in the way of either. The browser's own
  // question is the only one available; it is asked only while a hand exists.
  const casinoLive = useLiveSessionStore(s => s.activeMode === 'casinoSession')
  useEffect(() => {
    if (!casinoLive) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [casinoLive])
}
