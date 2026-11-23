import { useTranslation } from 'react-i18next'
import { Action } from '../../engine/rules/types'

interface ActionButtonsProps {
  onAction: (action: Action) => void
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
  humanBusted: boolean
  /** False for a hand that takes no more cards by choice: doubled, or a split ace. */
  canHit?: boolean
  /** False while a split ace or a doubled hand finishes by itself. */
  canStand?: boolean
  /** Seconds left for this decision; when they run out the hand stands. Omitted: no clock. */
  secondsLeft?: number
  /** The length of the decision window, for the bar. */
  secondsTotal?: number
}

/**
 * One row per action, driven by a table rather than five copied blocks.
 *
 * The previous version repeated the same `<button>` five times with only the
 * colour and the label changed, and carried **no `transition-*` class at all** —
 * so on the screen a player spends most of their time on, every hover was a hard
 * colour jump and a press produced nothing. That is the single clearest "this is
 * a mockup" tell an interface can have.
 *
 * **Deliberately CSS and not framer-motion**, although framer-motion is already
 * in the bundle and `table/ActionButtons.tsx` uses it for exactly this. The test
 * suite mocks framer-motion with `motion.div` and `motion.span` only — there is
 * no `motion.button`, and the mock's own comment records what happens when a
 * component it does not provide is rendered: "renders `undefined` as a component
 * and takes the whole tree down." A press animation is not worth a mock change
 * that would also silently drop `disabled` in every test. CSS does this better
 * here anyway, and the app-wide `prefers-reduced-motion` reset in `index.css`
 * neutralises it for free.
 */
interface ActionDef {
  action: Action
  testId: string
  labelKey: string
  /** Idle and hover fill. The ink is chosen by the fill, never by the theme. */
  fill: string
}

const ACTIONS: readonly ActionDef[] = [
  { action: Action.Hit, testId: 'action-hit', labelKey: 'casino.act.hit', fill: 'bg-success hover:bg-success/80 text-white' },
  { action: Action.Stand, testId: 'action-stand', labelKey: 'casino.act.stand', fill: 'bg-error hover:bg-error/80 text-white' },
  { action: Action.Double, testId: 'action-double', labelKey: 'casino.act.double', fill: 'bg-gold hover:bg-gold/80 text-on-gold' },
  { action: Action.Split, testId: 'action-split', labelKey: 'casino.act.split', fill: 'bg-chip-blue hover:bg-chip-blue/80 text-white' },
  { action: Action.Surrender, testId: 'action-surrender', labelKey: 'casino.act.surrender', fill: 'bg-contrast/10 hover:bg-contrast/20 text-content' },
]

export function ActionButtons({ onAction, canDouble, canSplit, canSurrender, humanBusted, canHit = true, canStand = true, secondsLeft, secondsTotal = 30 }: ActionButtonsProps) {
  const { t } = useTranslation()

  const isDisabled = (action: Action) => {
    if (humanBusted) return true
    if (action === Action.Hit) return !canHit
    if (action === Action.Stand) return !canStand
    if (action === Action.Double) return !canDouble
    if (action === Action.Split) return !canSplit
    if (action === Action.Surrender) return !canSurrender
    return false
  }

  const touch = isTouch()
  return (
    <div className="flex flex-col items-center gap-2" data-testid="action-controls">
      {/* The decision clock, as at an online table: a bar that runs down, red
          for the last five seconds. It says how long the hand waits. */}
      {secondsLeft !== undefined && (
        <div
          className="flex items-center gap-2"
          data-testid="decision-clock"
          role="timer"
          aria-label={t('casino.table.decisionClock')}
        >
          <span className="block w-44 h-1.5 rounded-full bg-contrast/15 overflow-hidden">
            <span
              className={`block h-full rounded-full transition-[width] duration-1000 ease-linear ${secondsLeft <= 5 ? 'bg-error' : 'bg-gold'}`}
              style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / secondsTotal) * 100))}%` }}
            />
          </span>
          <span className={`text-sm font-bold tabular-nums ${secondsLeft <= 5 ? 'text-error' : 'text-content/70'}`}>
            0:{String(Math.max(0, secondsLeft)).padStart(2, '0')}
          </span>
        </div>
      )}
      <div className="flex gap-2 flex-wrap justify-center">
        {ACTIONS.map(({ action, testId, labelKey, fill }) => (
          <button
            key={action}
            onClick={() => onAction(action)}
            data-testid={testId}
            disabled={isDisabled(action)}
            className={`px-5 py-2 rounded-lg font-semibold cursor-pointer ${fill}
              transition-[background-color,transform,box-shadow,opacity] duration-150 ease-out
              shadow-[0_1px_2px_rgba(0,0,0,0.35)]
              hover:shadow-[0_3px_10px_-3px_rgba(0,0,0,0.5)]
              active:scale-[0.97] active:shadow-[0_1px_1px_rgba(0,0,0,0.4)]
              disabled:opacity-30 disabled:cursor-not-allowed
              disabled:hover:shadow-[0_1px_2px_rgba(0,0,0,0.35)] disabled:active:scale-100`}
          >
            {/* "(H)" is a key on a keyboard. On a touch screen it is noise that
                pushes five buttons into three rows. */}
            {touch ? withoutKeyHint(t(labelKey)) : t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Whether the screen is worked with a finger: then a button's "(H)" names a key there is none of. */
function isTouch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/** A label without its trailing key hint: "Hit (H)" → "Hit". */
function withoutKeyHint(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '')
}

/**
 * The insurance question with its two answers, under the felt.
 *
 * It was markup inside the casino table's controls until the guest table
 * (`components/trial`) asked the same question; one question, one place.
 * On a touch screen the answers lose their key hint, like the five actions.
 *
 * @param hand - Which hand is asked about when the player holds several
 *   (from 0), or null for the one hand
 * @param onAnswer - true takes insurance, false declines it
 */
export function InsurancePrompt({ hand, onAnswer }: { hand: number | null; onAnswer: (take: boolean) => void }) {
  const { t } = useTranslation()
  const touch = isTouch()
  const label = (key: string) => (touch ? withoutKeyHint(t(key)) : t(key))
  return (
    <div className="flex flex-col items-center gap-3" data-testid="insurance-controls">
      <span className="text-sm text-content" data-testid="insurance-ask">
        {hand !== null ? t('casino.hud.insuranceAskHand', { n: hand + 1 }) : t('casino.hud.insuranceAsk')}
      </span>
      <div className="flex gap-3">
        <button onClick={() => onAnswer(true)} data-testid="insurance-yes"
          className="px-6 py-2 bg-gold text-on-gold rounded-xl font-bold hover:bg-gold/90 cursor-pointer">
          {label('casino.hud.yes')}
        </button>
        <button onClick={() => onAnswer(false)} data-testid="insurance-no"
          className="px-6 py-2 bg-contrast/10 text-content rounded-xl font-bold hover:bg-contrast/20 cursor-pointer">
          {label('casino.hud.no')}
        </button>
      </div>
    </div>
  )
}
