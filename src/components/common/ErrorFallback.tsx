import { useTranslation } from 'react-i18next'
import { RotateCcw, RefreshCw } from 'lucide-react'

/**
 * The fallback UI, as a function component.
 *
 * The boundary itself has to be a class — React offers no hook for catching a
 * render error — but its copy still has to be translated, and hooks cannot run
 * in a class. So the class catches and this renders.
 */
export function ErrorFallback({ staleChunk, fullScreen, onReload, onReset }: {
  staleChunk: boolean
  fullScreen?: boolean
  onReload: () => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center justify-center p-6 ${fullScreen ? 'min-h-screen bg-casino-bg' : 'flex-1'}`}>
      <div className="surface max-w-md w-full p-8 text-center flex flex-col items-center gap-4">
        <h2 className="text-xl font-semibold text-gold-gradient">
          {staleChunk ? t('errorScreen.staleTitle') : t('errorScreen.genericTitle')}
        </h2>
        <p className="text-sm text-content/60">
          {staleChunk ? t('errorScreen.staleBody') : t('errorScreen.genericBody')}
        </p>
        {staleChunk ? (
          <button
            onClick={onReload}
            className="surface glow-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-content cursor-pointer"
            data-testid="error-boundary-reload"
          >
            <RefreshCw size={16} />
            {t('errorScreen.reload')}
          </button>
        ) : (
          <button
            onClick={onReset}
            className="surface glow-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-content cursor-pointer"
            data-testid="error-boundary-reset"
          >
            <RotateCcw size={16} />
            {t('errorScreen.tryAgain')}
          </button>
        )}
      </div>
    </div>
  )
}
