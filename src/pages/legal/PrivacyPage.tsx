import { LegalPage } from './LegalPage'
import { usePageMeta } from '../../hooks/use-page-meta'

export function PrivacyPage() {
  usePageMeta('privacy', '/privacy')
  return <LegalPage kind="privacy" />
}
