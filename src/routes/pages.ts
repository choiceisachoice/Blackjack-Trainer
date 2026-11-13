import { lazyRoute, type PreloadableRoute } from './lazy-route'

/*
  Route-level code splitting: the landing (with its Three.js hero) and the
  trainer (recharts/framer/all modes) load as separate chunks, so visiting `/`
  doesn't pull the whole app.

  Declared here rather than in `App.tsx` because two callers need them: the
  router, and `main.tsx`, which fetches the chunk for the page being opened
  *before* the first render so that render is the page and not a fallback.
*/

export const LandingPage = lazyRoute(() => import('../pages/LandingPage').then(m => ({ default: m.LandingPage })))
export const LoginPage = lazyRoute(() => import('../pages/LoginPage').then(m => ({ default: m.LoginPage })))
export const TrainerApp = lazyRoute(() => import('../pages/TrainerApp').then(m => ({ default: m.TrainerApp })))
export const AccountPage = lazyRoute(() => import('../pages/AccountPage').then(m => ({ default: m.AccountPage })))
export const ResetPasswordPage = lazyRoute(() => import('../pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
// Legal pages: static content, public, their own small chunk.
export const TermsPage = lazyRoute(() => import('../pages/legal/TermsPage').then(m => ({ default: m.TermsPage })))
export const PrivacyPage = lazyRoute(() => import('../pages/legal/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
export const ContactPage = lazyRoute(() => import('../pages/legal/ContactPage').then(m => ({ default: m.ContactPage })))
// The theory, public: the one part of the product search engines can answer with.
export const LearnPublicPage = lazyRoute(() => import('../pages/LearnPublicPage').then(m => ({ default: m.LearnPublicPage })))
export const LearnTopicPage = lazyRoute(() => import('../pages/LearnTopicPage').then(m => ({ default: m.LearnTopicPage })))
// The chart without a login: the one piece of the product that earns a link.
export const StrategyChartPublicPage = lazyRoute(() => import('../pages/StrategyChartPublicPage').then(m => ({ default: m.StrategyChartPublicPage })))
// The operator's numbers. Behind auth and the admin list; its own chunk, so
// a visitor never downloads it.
export const AdminAnalyticsPage = lazyRoute(() => import('../pages/AdminAnalyticsPage').then(m => ({ default: m.AdminAnalyticsPage })))

/**
 * The page a path opens, for fetching its chunk ahead of the render.
 *
 * Mirrors the `<Routes>` in `App.tsx`; a test holds the two together. An
 * unknown path answers null — the router redirects it to `/` and the landing
 * loads the ordinary way.
 *
 * @param path - The pathname with any language prefix already removed
 */
export function routeFor(path: string): PreloadableRoute | null {
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path || '/'
  if (p === '/') return LandingPage
  if (p === '/login') return LoginPage
  if (p === '/reset-password') return ResetPasswordPage
  if (p === '/app') return TrainerApp
  if (p === '/account') return AccountPage
  if (p === '/admin/analytics') return AdminAnalyticsPage
  if (p === '/learn') return LearnPublicPage
  if (/^\/learn\/[^/]+$/.test(p)) return LearnTopicPage
  if (p === '/strategy-chart') return StrategyChartPublicPage
  if (p === '/terms') return TermsPage
  if (p === '/privacy') return PrivacyPage
  if (p === '/contact') return ContactPage
  return null
}

/**
 * Whether a path is inside the signed-in app.
 *
 * The one distinction the first paint turns on: the public pages arrive
 * already rendered and get no loading screen of any kind, the app arrives
 * as an empty shell and gets the welcome on the first visit of a session and
 * its own skeleton afterwards.
 *
 * @param path - The pathname with any language prefix already removed
 */
export function isAppPath(path: string): boolean {
  return /^\/(app|account|admin)(\/|$)/.test(path)
}
