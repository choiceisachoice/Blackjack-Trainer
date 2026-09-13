import { LegalPage } from './LegalPage'
import { PRIVACY_DOC } from './privacy-content'
import { usePageMeta } from '../../hooks/use-page-meta'

export function PrivacyPage() {
  usePageMeta('privacy', '/privacy')
  return <LegalPage doc={PRIVACY_DOC} />
}
