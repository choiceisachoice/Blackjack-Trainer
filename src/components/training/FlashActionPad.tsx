import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Action } from '../../engine/rules/types'
import { ACTION_KEY, ACTION_SHORTCUT, ALL_ACTIONS } from './deviation-utils'

/**
 * The six answers of a flashcard, as buttons in the casino table's colours.
 *
 * They were six identical grey pills, so the one decision on the screen looked
 * like the least important thing on it. The table's buttons say what each play
 * is by its colour — hit green, stand red, double gold, split blue — and a
 * learner who drills here should meet the same buttons there. The fills are
 * the table's chip colours rather than its signal green and red: white on the
 * signal green measures 2.3:1, on the chip green 5:1.
 *
 * The keys are the table's too (H, S, D, P, R), plus I for insurance, and the
 * key is shown only where there is a keyboard to press it (`hover: hover`).
 */

/** Fill and ink of an available button. The ink belongs to the fill. */
const FILL: Record<Action, string> = {
  [Action.Hit]: 'bg-chip-green hover:bg-chip-green/85 text-white',
  [Action.Stand]: 'bg-chip-red hover:bg-chip-red/85 text-white',
  [Action.Double]: 'bg-gold hover:bg-gold/85 text-on-gold',
  [Action.Split]: 'bg-chip-blue hover:bg-chip-blue/85 text-white',
  [Action.Surrender]: 'bg-contrast/12 hover:bg-contrast/18 text-content',
  [Action.Insurance]: 'bg-contrast/12 hover:bg-contrast/18 text-content',
}

/** Props of {@link FlashActionPad}. */
export interface FlashActionPadProps {
  /** Which plays the question offers. */
  enabled: Record<Action, boolean>
  /** Called with the chosen play while the question is open. */
  onAnswer: (action: Action) => void
  /** Once answered: what was chosen and what was right. The pad then shows both and takes no more answers. */
  answered: { chosen: Action; correct: Action } | null
}

/** The answer buttons of a flashcard. */
export function FlashActionPad({ enabled, onAnswer, answered }: FlashActionPadProps) {
  const { t } = useTranslation()
  return (
    // Six in a row where the column is wide enough, three by two below that.
    <div className="@container">
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5 @3xl:grid-cols-6" data-testid="flash-actions">
        {ALL_ACTIONS.map(action => {
          const on = enabled[action]
          const isRight = answered?.correct === action
          const isWrongPick = answered !== null && answered.chosen === action && !isRight
          const state = !on
            ? 'bg-transparent border border-dashed border-contrast/12 text-content/25 cursor-not-allowed'
            : answered === null
              ? `${FILL[action]} cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.35)] hover:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.6)] active:scale-[0.97]`
              : isRight
                ? `${FILL[action]} ring-2 ring-success ring-offset-2 ring-offset-casino-bg`
                : isWrongPick
                  ? `${FILL[action]} opacity-70 ring-2 ring-error ring-offset-2 ring-offset-casino-bg`
                  : `${FILL[action]} opacity-25`
          return (
            <button
              key={action}
              type="button"
              onClick={() => on && answered === null && onAnswer(action)}
              disabled={!on || answered !== null}
              aria-keyshortcuts={on ? ACTION_SHORTCUT[action] : undefined}
              data-testid={`action-${action.toLowerCase()}`}
              className={`relative h-12 sm:h-14 rounded-xl px-2 font-semibold text-[0.9375rem] sm:text-base short:text-[0.8125rem]! short:px-1!
                inline-flex items-center justify-center gap-2 select-none
                transition-[background-color,box-shadow,opacity,transform] duration-150 ease-out disabled:cursor-default ${state}`}
            >
              {isRight && <Check size={18} strokeWidth={3} aria-hidden className="shrink-0" />}
              {isWrongPick && <X size={18} strokeWidth={3} aria-hidden className="shrink-0" />}
              <span className="truncate">{t(ACTION_KEY[action])}</span>
              {on && answered === null && (
                // In the corner, not beside the label: in a row of six at
                // 1440 the badge took the room "Versicherung" needed and
                // the label was cut to "Versicher…".
                <kbd
                  aria-hidden
                  className="hidden [@media(hover:hover)]:inline-grid absolute top-1 right-1 place-items-center min-w-4 h-4 px-0.5 rounded
                    text-[0.625rem] leading-none font-bold font-sans bg-black/20 border border-white/15 opacity-70"
                >
                  {ACTION_SHORTCUT[action]}
                </kbd>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
