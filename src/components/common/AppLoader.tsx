import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid } from 'ldrs/react'
import 'ldrs/react/Grid.css'

/**
 * How long a wait has to last before it is worth mentioning.
 *
 * A returning subscriber on a warm cache resolves in well under this, and
 * flashing a full-screen loader at them for 80ms reads as a stutter, not as
 * polish. Below the threshold the screen simply stays as it was.
 */
export const LOADER_DELAY_MS = 220

/**
 * The app's loading screen.
 *
 * Replaces three separate bare spinners on a black background — which is what a
 * paying customer saw every time they opened the app. This one carries the same
 * marks as the rest of the product: the spade, the gold, the ivory wordmark.
 *
 * Two rules it exists to enforce, both about *not* being seen:
 *
 * 1. **It waits before appearing.** See {@link LOADER_DELAY_MS} — a loader that
 *    flashes makes a fast app feel broken.
 * 2. **It never blocks longer than the work.** There is no artificial minimum
 *    hold; the moment the caller stops rendering it, it is gone. Padding a
 *    load to "let the animation finish" is making the product slower to look
 *    busier, which is the opposite of luxurious.
 */
export function AppLoader({
  label,
  delayMs = LOADER_DELAY_MS,
}: {
  /**
   * What is being waited for. Written for a person, not a developer.
   *
   * Optional, but never absent on screen: without one the loader falls back to
   * a generic wait rather than showing nothing, so a caller cannot accidentally
   * render a nameless spinner.
   */
  label?: string
  /** Override only for tests; the default is the honest one. */
  delayMs?: number
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(delayMs === 0)

  useEffect(() => {
    if (delayMs === 0) return
    const timer = setTimeout(() => setVisible(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  // Deliberately an empty canvas rather than null: the background is already
  // the app's, so a fast load transitions from dark to dark with nothing
  // blinking in between.
  if (!visible) return <div className="app-canvas h-screen" aria-hidden />

  return (
    <div
      className="app-canvas h-screen flex flex-col items-center justify-center gap-9"
      role="status"
      aria-live="polite"
      data-testid="app-loader"
    >
      {/*
        The grid stands alone. Its centre cell is occupied, so the spade that
        used to sit inside the ring has nowhere to go here — and stacking a mark
        above the animation would make two objects compete where one will do.
        The gold wordmark below carries the brand instead.
      */}
      <Grid size={104} speed={1.4} color="var(--color-gold)" />

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-[0.95rem] font-extrabold tracking-[0.3em] uppercase text-gold-gradient">
          Blackjack Trainer
        </span>
        <span className="text-base text-content/45">{label ?? t('common.loadingTraining')}</span>
      </div>
    </div>
  )
}
