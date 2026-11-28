import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { isSupabaseConfigured } from '../../services/supabase/client'
import { CookieBar } from './CookieBanner'

/**
 * The cookie bar as HTML, for `scripts/prerender.mjs`.
 *
 * Built into the same SSR bundle as `entry-prerender.tsx`, so it shares its
 * i18next instance: called right after `render(route, locale)` it writes the
 * bar in that page's language. The page puts it after `#root`, not inside:
 * the app's first render replaces everything in `#root`, and a replaced bar
 * is a new paint that can become the LCP; outside, `CookieBanner` adopts it.
 *
 * Empty in a build without Supabase — there the question never applies
 * (`consentQuestionApplies`), and a bar the app would not show must not be
 * on the page either. The visitor-side exceptions (an answer already given,
 * Global Privacy Control, Do Not Track) are `public/boot.js`'s to apply,
 * before the first paint.
 *
 * @param basename - The language prefix (`/de`), so the privacy link stays in the page's language; empty for English
 * @param lang - The page's language, written into the `data-boot-banner` marker; `CookieBanner` adopts the bar only while the app is in it
 * @returns The bar's markup, or '' when the build asks no one
 */
export function renderCookieBannerMarkup(basename = '', lang = 'en'): string {
  if (!isSupabaseConfigured) return ''
  const location = basename ? `${basename}/` : '/'
  return renderToString(
    <StaticRouter location={location} basename={basename || undefined}>
      <CookieBar prerenderedLang={lang} />
    </StaticRouter>,
  )
}
