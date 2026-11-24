import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { UpgradePanel } from './UpgradePanel'
import { ModalBackdrop } from '../common/ModalBackdrop'
import type { PaywallSubject } from './paywall-subject'

/**
 * Renders the Pro paywall as a modal when any gated surface opens it via
 * `useUpgradePrompt`. Mounted once at the app root, and on the public pages
 * that can open it.
 *
 * @param subject - What the page's locked parts are about, for a page that is
 *   not a mode of the app and so cannot be read from it (the public strategy
 *   chart: the deviations). Inside the app the panel works it out.
 */
export function UpgradeModalHost({ subject }: { subject?: PaywallSubject } = {}) {
  const { t } = useTranslation()
  const open = useUpgradePrompt(s => s.open)
  const headline = useUpgradePrompt(s => s.headline)
  const hide = useUpgradePrompt(s => s.hide)

  if (!open) return null

  return (
    <ModalBackdrop onClose={hide} z="z-50" scroll testId="upgrade-modal">
      {/* `w-full` so the landscape card can take its width: a grid item
          centred by `place-items` is otherwise only as wide as its content. */}
      <div className="relative my-auto w-full max-w-[68rem]" onClick={e => e.stopPropagation()}>
        <button
          onClick={hide}
          aria-label={t('common.close')}
          className="absolute -top-2 -right-2 z-10 grid place-items-center w-8 h-8 rounded-full surface text-content/60 hover:text-content cursor-pointer"
        >
          <X size={16} />
        </button>
        <UpgradePanel headline={headline ?? undefined} subject={subject} />
      </div>
    </ModalBackdrop>
  )
}
