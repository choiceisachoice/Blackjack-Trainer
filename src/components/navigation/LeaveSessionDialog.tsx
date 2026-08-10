import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useAppStore } from '../../store/app-store'

/**
 * The question asked before a running session is left behind.
 *
 * It exists because leaving used to be silent and irreversible: the Casino
 * Session keeps its engine and shoe in refs inside a component, and switching
 * mode unmounted it. A single click on the wordmark ended a session that had
 * been running for half an hour, with nothing on screen to suggest it would.
 *
 * Two deliberate choices in the wording:
 *
 * The staying option is the default and holds the focus. Someone who reaches
 * this dialog by accident is one Enter or one Escape away from being back where
 * they were, and the destructive answer is never the one a stray keypress hits.
 *
 * The wording says exactly what happens today: leaving **ends** the session.
 * Keeping it alive across a mode change means not unmounting the component that
 * owns the engine, and that is a change to the app shell which has not been
 * made yet. Until it has, a dialog promising "you can come back to the same
 * hand" would be a comfortable lie — and the next person to read this file
 * would believe it.
 */
export function LeaveSessionDialog() {
  const pending = useLiveSessionStore(s => s.pending)
  const confirmLeave = useLiveSessionStore(s => s.confirmLeave)
  const cancelLeave = useLiveSessionStore(s => s.cancelLeave)
  const setMode = useAppStore(s => s.setMode)
  const stayRef = useRef<HTMLButtonElement>(null)

  // Escape closes it the safe way, and the focus starts on "stay".
  useEffect(() => {
    if (!pending) return
    stayRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelLeave() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, cancelLeave])

  if (!pending) return null

  const leave = () => {
    const target = confirmLeave()
    if (target) setMode(target)
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm px-4"
      // A click on the backdrop is the same as Escape: the harmless answer.
      onClick={cancelLeave}
      data-testid="leave-session-backdrop"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-session-title"
        aria-describedby="leave-session-body"
        data-testid="leave-session-dialog"
        onClick={e => e.stopPropagation()}
        className="surface w-full max-w-md p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-warning/10 text-warning shrink-0">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 id="leave-session-title" className="text-lg font-semibold">
              Leave and end this session?
            </h2>
            <p id="leave-session-body" className="mt-1 text-sm text-content/60">
              Your session is still running. Leaving now ends it, and the hands you have
              played will not be counted.
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button
            ref={stayRef}
            onClick={cancelLeave}
            data-testid="leave-session-stay"
            className="px-4 py-2.5 rounded-xl font-semibold cursor-pointer
              bg-gradient-to-br from-gold-bright to-gold text-casino-bg"
          >
            Keep playing
          </button>
          <button
            onClick={leave}
            data-testid="leave-session-leave"
            className="px-4 py-2.5 rounded-xl font-semibold cursor-pointer
              border border-error/40 text-error hover:bg-error/10 transition-colors"
          >
            Leave and end session
          </button>
        </div>
      </div>
    </div>
  )
}
