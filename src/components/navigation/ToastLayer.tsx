import { XpToast } from './XpToast'
import { AchievementToast } from '../achievements/AchievementToast'

/**
 * Where the toasts sit, as one class string so a test can pin it.
 *
 * Under the app's header, never at the foot of the screen. They used to sit
 * bottom-centre, which is exactly where every summary screen puts its main
 * button and every setup screen its start button: at 2000×720 the XP toast
 * and the award covered "Back to settings" together, and on a phone the XP
 * toast was a 214px column five lines tall over "Start drill".
 *
 * - **Phone:** the full width less the page's 16px gutters, just below the
 *   56px header (`h-14`) — a toast as wide as the screen's content reads in
 *   one or two lines.
 * - **From `md`:** the top right, 24rem wide, below the header rather than on
 *   it, so the level badge at the header's right end stays readable.
 *
 * Both toasts stretch to the layer's width, so two of them form one column
 * rather than two ragged boxes. `pointer-events-none` on the layer: the space
 * between and around the toasts never swallows a click on the page under it
 * (the award toast takes clicks itself, to be dismissed).
 */
export const TOAST_LAYER = [
  'fixed z-50 pointer-events-none',
  'inset-x-4 top-[calc(3.5rem+0.75rem)]',
  'md:left-auto md:right-6 md:w-[24rem]',
  'flex flex-col items-stretch gap-2.5',
].join(' ')

/**
 * One layer for both toasts: the XP payout and the unlocked award.
 *
 * They used to position themselves independently, on identical coordinates
 * and the same z-index — and they fire on the same event: a session ends,
 * pays XP and unlocks an award. Whoever painted last won. Stacking them here
 * keeps each component ignorant of the other and still guarantees they cannot
 * land on top of each other: the XP toast first, the award under it, so
 * whichever shows alone sits at the top of the stack.
 *
 * Timing and content belong to the toasts themselves; this only places them.
 */
export function ToastLayer() {
  return (
    <div className={TOAST_LAYER} data-testid="toast-layer">
      <XpToast />
      <AchievementToast />
    </div>
  )
}
