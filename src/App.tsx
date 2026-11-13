import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { useAuthStore } from './store/auth-store'
import { handleSignedIn } from './services/supabase/cloud-sync'
import { useEntitlementStore } from './store/entitlement-store'
import { startCheckout, consumePendingCheckout } from './services/supabase/billing'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { AdminRoute } from './routes/AdminRoute'
import { ScrollToTop } from './routes/ScrollToTop'
import { PageViewTracker } from './components/analytics-web/PageViewTracker'
import { AppLoader } from './components/common/AppLoader'
import { IntroGate } from './components/common/IntroGate'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { AppSkeleton } from './components/common/AppSkeleton'
import { unprefixedPath } from './i18n/locales'
import {
  LandingPage, LoginPage, TrainerApp, AccountPage, ResetPasswordPage, TermsPage, PrivacyPage, ContactPage,
  LearnPublicPage, LearnTopicPage, StrategyChartPublicPage, AdminAnalyticsPage, isAppPath, routeFor,
} from './routes/pages'

// The ternary matters: guarding only the <Route> leaves the dynamic import in
// place, and Rollup emits a DevPreview chunk into the production build that
// nothing can ever reach. Branching on the statically-known DEV flag lets the
// bundler drop the import entirely.
const DevPreview = import.meta.env.DEV
  ? lazy(() => import('./pages/DevPreview').then(m => ({ default: m.DevPreview })))
  : null
const LoaderGallery = import.meta.env.DEV
  ? lazy(() => import('./pages/LoaderGallery').then(m => ({ default: m.LoaderGallery })))
  : null
const LevelGallery = import.meta.env.DEV
  ? lazy(() => import('./pages/LevelGallery').then(m => ({ default: m.LevelGallery })))
  : null
const ControlsPreview = import.meta.env.DEV
  ? lazy(() => import('./pages/ControlsPreview').then(m => ({ default: m.ControlsPreview })))
  : null
const MotionFilm = import.meta.env.DEV
  ? lazy(() => import('./pages/MotionFilm').then(m => ({ default: m.MotionFilm })))
  : null
const SplitPreview = import.meta.env.DEV
  ? lazy(() => import('./pages/SplitPreview').then(m => ({ default: m.SplitPreview })))
  : null

/**
 * What a route shows while its chunk is on the way.
 *
 * Inside the app that is the app's own outline — the bar, the plan card, the
 * list — so the screen that arrives lands on the screen that was waiting for
 * it. It used to be an empty canvas followed 220 ms later by a full-screen
 * spinner, which React then held for its 300 ms fallback throttle: every
 * reload showed blank, a flash of spinner, and the page.
 *
 * Outside the app this is rarely reached at all: `main.tsx` has the first
 * page's chunk before the first render, and the router keeps the old page up
 * during a navigation.
 */
function RouteLoader() {
  return isAppPath(unprefixedPath(window.location.pathname)) ? <AppSkeleton /> : <AppLoader />
}

/**
 * Root router shell. Holds the app-wide session effects (auth init, cloud-sync
 * on sign-in, entitlement refresh after Stripe Checkout) and maps the routes:
 * `/` public landing · `/login` · `/app` (gated trainer) · `/account` (gated).
 */
function App() {
  const authStatus = useAuthStore(s => s.status)
  const initAuth = useAuthStore(s => s.init)

  // Load the auth session once. Harmless (resolves to signed-out) when Supabase
  // isn't configured yet.
  useEffect(() => { void initAuth() }, [initAuth])

  // On sign-in: migrate local data to the cloud (once) and hydrate from it.
  useEffect(() => {
    if (authStatus === 'signedIn') void handleSignedIn()
  }, [authStatus])

  // Resume a "Go Pro" intent a visitor made while signed out (from the landing):
  // once signed in, jump straight into checkout instead of dropping them in the app.
  useEffect(() => {
    if (authStatus !== 'signedIn') return
    const plan = consumePendingCheckout()
    if (plan) startCheckout(plan).catch(e => console.error('pending checkout failed', e))
  }, [authStatus])

  // Returning from Stripe Checkout. Stripe sends ?checkout=success on completion
  // and ?checkout=cancelled when the user backs out; clear either one so it
  // doesn't linger in the address bar or re-trigger on a manual refresh. Only
  // success starts the poll — the entitlement webhook lands a beat after the
  // redirect, so we wait for Pro to flip on.
  useEffect(() => {
    if (authStatus !== 'signedIn') return
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('checkout')
    if (outcome !== 'success' && outcome !== 'cancelled') return
    params.delete('checkout')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    if (outcome === 'success') void useEntitlementStore.getState().refreshUntilPro()
  }, [authStatus])

  /**
   * Whether the route behind the loading screen has actually finished arriving.
   *
   * Auth resolving is not the same thing: the trainer is its own chunk, and
   * handing over on auth alone ended the welcome on a screen that was still
   * downloading. Waiting for the chunk makes the loading screen wait for the
   * thing it is covering, which is the only honest meaning of "ready".
   *
   * Asked through the route table rather than by comparing the pathname, so
   * `/de/app` is the app too. The public pages no longer have anything to
   * wait for here: they get no loading screen (see `IntroGate`), and
   * `main.tsx` has fetched their chunk before this component first rendered.
   */
  const [chunksReady, setChunksReady] = useState(false)

  useEffect(() => {
    let alive = true
    const route = routeFor(unprefixedPath(window.location.pathname))
    // `preload` never rejects: a chunk that fails to load must not hold the
    // screen hostage. The route's own boundary reports it.
    void (route ? route.preload() : Promise.resolve()).then(() => { if (alive) setChunksReady(true) })
    return () => { alive = false }
  }, [])

  const appReady = authStatus !== 'loading' && chunksReady

  return (
    /*
      Reduced motion, decided once for the whole app.

      CSS was already covered: `index.css` carries a global
      `@media (prefers-reduced-motion: reduce)` reset that flattens every
      animation and transition. What no CSS rule can reach is framer-motion,
      which animates by writing inline styles frame by frame — so the casino
      session, the hands, the seats and the drill all kept moving for someone
      who had asked the system to stop, and those are the screens people sit in
      front of for an hour.

      One policy here rather than a hook threaded through a dozen components:
      "user" disables transform and layout animations while leaving opacity
      alone. Which is also why the entrances in this codebase were moved onto
      transform — `reducedMotion` does not touch opacity, so anything still
      fading in would keep fading in regardless of the setting.
    */
    <MotionConfig reducedMotion="user">
    <IntroGate appReady={appReady}>
    {/*
      Above the routes *and* above Suspense, deliberately.

      Above the routes, because `ErrorBoundary` previously wrapped only the
      trainer's modes: a render error on the landing page, `/login`, `/account`
      or a legal page unmounted the tree to a blank white screen — on exactly
      the routes a first-time visitor arrives at.

      Above Suspense, because a lazy route's `import()` rejects during render,
      and a boundary *inside* the suspended tree never sees it. That is the
      stale-chunk case: a deploy renames the hashed files and every tab still
      holding the old page requests one that is gone. The boundary recognises
      that specific failure and offers a reload, which is the only thing that
      recovers it.

      `onReset` is not wired: re-rendering the same route is the right retry
      here, and there is nowhere safer to send someone from the root.
    */}
    <ErrorBoundary fullScreen>
    {/* Outside Suspense: the scroll has to be reset even when the next route's
        chunk is still loading, or the fallback renders at the old offset. */}
    <ScrollToTop />
    {/* Page views, counted on every route change (ADR-003). Renders nothing;
        does nothing when Supabase is not configured or the visitor opted out. */}
    <PageViewTracker />
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Public on purpose: whoever follows a reset link is by definition
            unable to sign in, and the page checks for a valid recovery
            session itself rather than leaning on a route guard. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/app" element={<ProtectedRoute><TrainerApp /></ProtectedRoute>} />
        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute><AdminRoute><AdminAnalyticsPage /></AdminRoute></ProtectedRoute>} />
        <Route path="/learn" element={<LearnPublicPage />} />
        <Route path="/learn/:slug" element={<LearnTopicPage />} />
        <Route path="/strategy-chart" element={<StrategyChartPublicPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {/* First-run harness. The screens a new account sees sit behind auth,
            which makes the most important moment in the product the hardest one
            to look at. DEV-only, so it cannot reach production. */}
        {DevPreview && <Route path="/dev" element={<DevPreview />} />}
        {LoaderGallery && <Route path="/dev/loaders" element={<LoaderGallery />} />}
        {ControlsPreview && <Route path="/dev/controls" element={<ControlsPreview />} />}
        {LevelGallery && <Route path="/dev/levels" element={<LevelGallery />} />}
        {MotionFilm && <Route path="/dev/motion" element={<MotionFilm />} />}
        {SplitPreview && <Route path="/dev/split" element={<SplitPreview />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
    </IntroGate>
    </MotionConfig>
  )
}

export default App
