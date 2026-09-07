import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { UpgradePanel } from './UpgradePanel'
import { ModalBackdrop } from '../common/ModalBackdrop'

/**
 * Renders the Pro paywall as a modal when any gated surface opens it via
 * `useUpgradePrompt`. Mounted once at the app root.
 */
export function UpgradeModalHost() {
  const { t } = useTranslation()
  const open = useUpgradePrompt(s => s.open)
  const headline = useUpgradePrompt(s => s.headline)
  const hide = useUpgradePrompt(s => s.hide)

  if (!open) return null

  return (
    <ModalBackdrop onClose={hide} z="z-50" scroll testId="upgrade-modal">
      <div className="relative my-auto" onClick={e => e.stopPropagation()}>
        <button
          onClick={hide}
          aria-label={t('common.close')}
          className="absolute -top-2 -right-2 z-10 grid place-items-center w-8 h-8 rounded-full surface text-content/60 hover:text-content cursor-pointer"
        >
          <X size={16} />
        </button>
        <UpgradePanel headline={headline ?? undefined} />
      </div>
    </ModalBackdrop>
  )
}
