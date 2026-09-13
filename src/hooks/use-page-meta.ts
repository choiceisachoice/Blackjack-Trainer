import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Translate } from '../i18n/translate'

/** The public origin, for canonical and Open Graph URLs. */
export const SITE_ORIGIN = 'https://black-jack-training.com'

/** Every routed page that has a title of its own. */
export type PageKey = 'landing' | 'learn' | 'login' | 'app' | 'account' | 'terms' | 'privacy' | 'contact'

/** What the head carries for one page. */
export interface PageMeta {
  title: string
  description: string
  /** Absolute canonical URL. */
  canonical: string
}

/**
 * The title and description for a page, in the reader's language.
 *
 * The landing keeps the keys it had (`meta.title`, `meta.description`); every
 * other page reads `meta.pages.<page>`. A page whose keys are missing falls
 * back to the landing's, which is what every route showed before this
 * existed — so a forgotten key degrades to the old behaviour, not to a raw
 * key path in the tab.
 */
export function pageMeta(t: Translate, page: PageKey, path: string): PageMeta {
  const title = page === 'landing' ? t('meta.title') : t(`meta.pages.${page}.title`, { defaultValue: t('meta.title') })
  const description = page === 'landing'
    ? t('meta.description')
    : t(`meta.pages.${page}.description`, { defaultValue: t('meta.description') })
  return { title, description, canonical: `${SITE_ORIGIN}${path}` }
}

/** Find or create a `<meta>` / `<link>` in the head and set one attribute on it. */
function upsert(doc: Document, selector: string, create: () => Element, attr: string, value: string): void {
  let el = doc.head.querySelector(selector)
  if (!el) {
    el = create()
    doc.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

/**
 * Write a page's meta into the document. Pure in the sense that matters:
 * given the same document and meta, it always leaves the head in the same
 * state, and it never adds a second tag where one exists.
 */
export function applyPageMeta(doc: Document, meta: PageMeta): void {
  doc.title = meta.title
  const metaEl = (name: string, prop = false) => () => {
    const el = doc.createElement('meta')
    el.setAttribute(prop ? 'property' : 'name', name)
    return el
  }
  upsert(doc, 'meta[name="description"]', metaEl('description'), 'content', meta.description)
  upsert(doc, 'meta[property="og:title"]', metaEl('og:title', true), 'content', meta.title)
  upsert(doc, 'meta[property="og:description"]', metaEl('og:description', true), 'content', meta.description)
  upsert(doc, 'meta[property="og:url"]', metaEl('og:url', true), 'content', meta.canonical)
  upsert(doc, 'link[rel="canonical"]', () => {
    const el = doc.createElement('link')
    el.setAttribute('rel', 'canonical')
    return el
  }, 'href', meta.canonical)
}

/**
 * Give a routed page its own title, description and canonical URL.
 *
 * Every route used to share the landing's `<title>` — Google listed `/terms`
 * under the same name as the home page and noted that it had left similar
 * entries out. The tab, the bookmark, the history entry and the search
 * result all read this, so each page says what it is.
 *
 * Re-runs when the language changes: `useTranslation` re-renders the page
 * and the resolved strings differ, which is the dependency the effect keys
 * on. The i18n module no longer writes the title itself, so the two cannot
 * race for it.
 *
 * @param page - Which page this is
 * @param path - The route path, for the canonical URL (e.g. `/learn`)
 */
export function usePageMeta(page: PageKey, path: string): void {
  const { t } = useTranslation()
  const meta = pageMeta(t, page, path)
  useEffect(() => {
    if (typeof document === 'undefined') return
    applyPageMeta(document, meta)
  }, [meta.title, meta.description, meta.canonical]) // eslint-disable-line react-hooks/exhaustive-deps
}
