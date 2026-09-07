import { useEffect, type ReactNode } from 'react'

/**
 * The dimmed layer behind a modal, with the three behaviours every modal in
 * this app needs and only some of them had.
 *
 * Three dialogs each built their own: `LeaveSessionDialog`, `UpgradeModalHost`
 * and `LevelUpPopup`, whose own comment records that its "overlay pattern
 * [was] copied from UpgradeModalHost". Copies drift, and this set had already
 * drifted in a way that mattered — **`UpgradeModalHost` had no Escape handler
 * at all.** The paywall was the one dialog in the app a keyboard user could not
 * dismiss, and it is the dialog that opens uninvited.
 *
 * `LevelUpPopup` deliberately keeps its own: it dismisses on Enter as well as
 * Escape, animates in, and writes a "don't show again" preference. Wrapping it
 * here would mean parameterising all of that, which is how a shared component
 * turns into a worse version of three specific ones.
 */
export function ModalBackdrop({
  onClose,
  children,
  z = 'z-50',
  scroll = false,
  testId,
  className = '',
}: {
  /** Called on Escape and on a click that lands on the backdrop itself. */
  onClose: () => void
  children: ReactNode
  /** Tailwind z-index class. The three dialogs sit at deliberately different depths. */
  z?: string
  /** Allow the backdrop to scroll when the dialog is taller than the viewport. */
  scroll?: boolean
  testId?: string
  className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Hold the page still underneath. Without this the document behind a modal
    // scrolls under the pointer, which reads as the dialog sliding away.
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = vorher
    }
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 ${z} grid place-items-center p-4 bg-black/70 backdrop-blur-sm
        ${scroll ? 'overflow-y-auto' : ''} ${className}`}
      onClick={onClose}
      data-testid={testId}
    >
      {children}
    </div>
  )
}
