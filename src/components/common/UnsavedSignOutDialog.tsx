import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CloudOff, Loader2 } from 'lucide-react'
import { ModalBackdrop } from './ModalBackdrop'

/**
 * The question asked when signing out would delete training that has not
 * reached the cloud.
 *
 * Signing out wipes this device — it has to, or the next person to sign in
 * here inherits the data — and a session still waiting for its upload exists
 * nowhere else. The sign-out tries the upload first; this is what is shown
 * when that did not work. Until now it deleted them without a word.
 *
 * Built like `LeaveSessionDialog`, for the same reasons: staying is the
 * default and holds the focus, Escape and a click beside the dialog both mean
 * "stay", and the wording says exactly what is lost and where.
 *
 * Rendered into the body: one of its callers is the top bar, whose blur makes
 * it the containing block of anything `fixed` drawn inside it.
 */
export function UnsavedSignOutDialog({
  count,
  busy = false,
  onStay,
  onSignOut,
}: {
  /** How many sessions are on this device and not in the cloud. */
  count: number
  /** The sign-out is running: both answers are locked. */
  busy?: boolean
  /** "Stay signed in" — also Escape and the backdrop. */
  onStay: () => void
  /** "Sign out anyway". */
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  const stayRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { stayRef.current?.focus() }, [])

  return createPortal(
    <ModalBackdrop onClose={busy ? () => {} : onStay} z="z-[60]" testId="unsaved-sign-out-backdrop">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-sign-out-title"
        aria-describedby="unsaved-sign-out-body"
        data-testid="unsaved-sign-out-dialog"
        onClick={e => e.stopPropagation()}
        className="surface w-full max-w-md p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-warning/10 text-warning shrink-0">
            <CloudOff size={20} />
          </span>
          <div>
            <h2 id="unsaved-sign-out-title" className="text-lg font-semibold">
              {t('offline.signOut.title')}
            </h2>
            <p id="unsaved-sign-out-body" className="mt-1 text-sm text-content/60">
              {t('offline.signOut.body', { count })}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            ref={stayRef}
            onClick={onStay}
            disabled={busy}
            data-testid="unsaved-sign-out-stay"
            className="px-4 py-2.5 rounded-xl font-semibold cursor-pointer
              bg-gradient-to-b from-gold-bright to-gold text-on-gold
              disabled:opacity-50 disabled:cursor-default"
          >
            {t('offline.signOut.stay')}
          </button>
          <button
            onClick={onSignOut}
            disabled={busy}
            data-testid="unsaved-sign-out-anyway"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold cursor-pointer
              border border-white/12 text-content hover:border-gold/55 transition-colors
              disabled:opacity-50 disabled:cursor-default"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {t('offline.signOut.anyway')}
          </button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  )
}
