import { X } from 'lucide-react'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { UpgradePanel } from './UpgradePanel'

/**
 * Renders the Pro paywall as a modal when any gated surface opens it via
 * `useUpgradePrompt`. Mounted once at the app root.
 */
export function UpgradeModalHost() {
  const open = useUpgradePrompt(s => s.open)
  const headline = useUpgradePrompt(s => s.headline)
  const hide = useUpgradePrompt(s => s.hide)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
      onClick={hide}
      data-testid="upgrade-modal"
    >
      <div className="relative my-auto" onClick={e => e.stopPropagation()}>
        <button
          onClick={hide}
          aria-label="Close"
          className="absolute -top-2 -right-2 z-10 grid place-items-center w-8 h-8 rounded-full surface text-content/60 hover:text-content cursor-pointer"
        >
          <X size={16} />
        </button>
        <UpgradePanel headline={headline ?? undefined} />
      </div>
    </div>
  )
}
