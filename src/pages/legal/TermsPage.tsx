import { LegalPage } from './LegalPage'
import { usePageMeta } from '../../hooks/use-page-meta'

export function TermsPage() {
  usePageMeta('terms', '/terms')
  return <LegalPage kind="terms" />
}
