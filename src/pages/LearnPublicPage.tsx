import { useTranslation } from 'react-i18next'
import { LearnPage } from '../components/learn/LearnPage'
import { PublicShell } from '../components/common/PublicShell'
import { JsonLd } from '../components/common/JsonLd'
import { faqJsonLd } from '../services/structured-data'
import { usePageMeta } from '../hooks/use-page-meta'

/**
 * `/learn` — the theory, outside the login.
 *
 * The Learn page lived only inside the app, behind `ProtectedRoute`, which
 * meant the one part of the product that answers the questions people
 * actually search for — how the Hi-Lo count works, what a true count is,
 * what the Illustrious 18 are — was invisible to every search engine. The
 * landing is a product page; this is the content.
 *
 * It is the hub now, not the whole book. Each chapter has a page of its own
 * (`/learn/<slug>`, see `LearnTopicPage`) with its own title, and this page
 * carries the summaries, the FAQ and a link into every chapter. A single URL
 * about eight subjects loses to eight pages about one subject each; the
 * chapters are where the ranking happens, this is what holds them together.
 * Every topic starts open here all the same: a collapsed topic is not in the
 * DOM, and what is not in the DOM is not indexed.
 */
export function LearnPublicPage() {
  const { t } = useTranslation()
  usePageMeta('learn', '/learn')

  return (
    <PublicShell testId="learn-public">
      <JsonLd data={faqJsonLd(t)} />
      <LearnPage openAll chapters="linked" />
    </PublicShell>
  )
}
