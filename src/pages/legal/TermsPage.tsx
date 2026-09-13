import { LegalPage } from './LegalPage'
import { TERMS_DOC } from './terms-content'
import { usePageMeta } from '../../hooks/use-page-meta'

export function TermsPage() {
  usePageMeta('terms', '/terms')
  return <LegalPage doc={TERMS_DOC} />
}
