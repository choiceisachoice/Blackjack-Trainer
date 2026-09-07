import { useTranslation } from 'react-i18next'
import { Action } from '../../engine/rules/types'

interface ActionButtonsProps {
  onAction: (action: Action) => void
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
  humanBusted: boolean
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

export function ActionButtons({ onAction, canDouble, canSplit, canSurrender, humanBusted }: ActionButtonsProps) {
  const { t } = useTranslation()

  const isDisabled = (action: Action) => {
    if (humanBusted) return true
    if (action === Action.Double) return !canDouble
    if (action === Action.Split) return !canSplit
    if (action === Action.Surrender) return !canSurrender
    return false
  }

  return (
    <div className="flex flex-col items-center gap-2" data-testid="action-controls">
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
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
