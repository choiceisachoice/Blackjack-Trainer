import { renderToString } from 'react-dom/server'
// v7 re-exports everything from react-router, StaticRouter included; the
// `/server` entry point was v6.
import { Routes, Route, StaticRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import i18next, { setLocale } from './i18n'
import type { Locale } from './i18n/locales'
import { pageMeta, type PageKey, type PageMeta } from './hooks/use-page-meta'
import { LandingPage } from './pages/LandingPage'
import { LearnPublicPage } from './pages/LearnPublicPage'
import { LearnTopicPage } from './pages/LearnTopicPage'
import { StrategyChartPublicPage } from './pages/StrategyChartPublicPage'
import { TermsPage } from './pages/legal/TermsPage'
import { PrivacyPage } from './pages/legal/PrivacyPage'
import { ContactPage } from './pages/legal/ContactPage'
import { LEARN_TOPICS, learnTopicPath } from './services/learn-topics'

/**
 * The build-time renderer for the public pages.
 *
 * ## Why this exists
 *
 * The server hands every visitor 2.8 kB of HTML whose body is an empty
 * `<div id="root">`. A search engine can render the JavaScript, but it does
 * so later, in a second pass, and it weighs a page it had to execute below a
 * page it could read. `scripts/prerender.mjs` calls `render` for each public
 * route after `vite build` and writes the result into `dist`, so the HTML a
 * crawler receives already contains the page.
 *
 * ## What it renders, and what it deliberately does not
 *
 * Only the routes a crawler may index — the landing, the theory, the legal
 * pages. Not the app, not the account, not sign-in: those are per-user and
 * disallowed in `robots.txt`. The pages are the same components the client
 * mounts; there is no second copy of anything.
 *
 * The client does not hydrate this HTML — `main.tsx` still calls
 * `createRoot`, which replaces it. Hydrating would demand that the first
 * client render match the server's exactly, and it cannot: the nav bar
 * depends on the auth state, the hero is a lazy Three.js chunk, and the
 * landing shows the visitor's stored language. The prerendered page is
 * what a crawler and a no-JavaScript visitor read; a browser with the app
 * swaps it out behind the loading screen.
 */

/** The routes worth prerendering, with the page each one is. */
export const PRERENDER_ROUTES: readonly { path: string; page: PageKey }[] = [
  { path: '/', page: 'landing' },
  { path: '/learn', page: 'learn' },
  // One page per chapter: the hub links to them, and each answers one query.
  ...LEARN_TOPICS.map(t => ({ path: learnTopicPath(t), page: `learn-${t.slug}` as PageKey })),
  { path: '/strategy-chart', page: 'strategy-chart' },
  { path: '/terms', page: 'terms' },
  { path: '/privacy', page: 'privacy' },
  { path: '/contact', page: 'contact' },
]

/** One prerendered page. */
export interface Prerendered {
  /** The markup for `<div id="root">`. */
  html: string
  meta: PageMeta
  lang: Locale
}

/**
 * Render one public route in one language.
 *
 * @param path - A route from {@link PRERENDER_ROUTES}
 * @param locale - The language to render in; its messages are loaded first
 * @param basename - URL prefix the router should treat as the root, for the
 *   language versions (`/de`); empty for English
 */
export async function render(path: string, locale: Locale, basename = ''): Promise<Prerendered> {
  const route = PRERENDER_ROUTES.find(r => r.path === path)
  if (!route) throw new Error(`not a prerendered route: ${path}`)
  await setLocale(locale)
  // The router strips the basename from the location it is given, so the
  // location has to carry it — `/de/learn`, not `/learn` under `/de`.
  const location = basename ? (path === '/' ? basename : `${basename}${path}`) : path
  const html = renderToString(
    <MotionConfig reducedMotion="user">
      <StaticRouter location={location} basename={basename || undefined}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/learn" element={<LearnPublicPage />} />
          <Route path="/learn/:slug" element={<LearnTopicPage />} />
          <Route path="/strategy-chart" element={<StrategyChartPublicPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
      </StaticRouter>
    </MotionConfig>,
  )
  return { html, meta: pageMeta(i18next.t, route.page, `${basename}${path === '/' && basename ? '' : path}`), lang: locale }
}
