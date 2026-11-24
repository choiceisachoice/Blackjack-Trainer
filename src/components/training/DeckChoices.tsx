import { Check, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { activeLocale } from '../../i18n'
import { formatDecks, isAcceptable } from './deck-estimation-model'

/** Props of {@link DeckChoices}. */
export interface DeckChoicesProps {
  /** The answers, lowest first (`deckOptions`). */
  options: readonly number[]
  onAnswer: (decks: number) => void
  /**
   * Once answered: the estimate (null when the clock ran out) and the decks
   * that were left. The chips then show the answer and every value that
   * would have counted, and take no more answers.
   */
  answered: { guess: number | null; actual: number } | null
  className?: string
}

/**
 * The answers, as a row of numbers in order — one row across a wide felt,
 * six to a row on a phone.
 *
 * Deliberately not stood up beside the tray at its height: a scale lined up
 * with the stack would be read, not estimated. The estimate is the skill; the
 * ruler on the tray is filled in once it has been made.
 *
 * Answered, every value within the tolerance gets a green outline — the
 * band that would have counted — and the one chosen is marked right or wrong.
 */
export function DeckChoices({ options, onAnswer, answered, className = '' }: DeckChoicesProps) {
  const { t } = useTranslation()
  const locale = activeLocale()
  return (
    <div className={`@container ${className}`}>
      <div
        role="group"
        aria-label={t('training.deck.howMany')}
        className="grid grid-cols-6 gap-1.5 sm:gap-2 @3xl:grid-cols-[repeat(var(--n),minmax(0,1fr))]"
        style={{ '--n': options.length } as CSSProperties}
        data-testid="deck-choices"
      >
        {options.map(d => {
          const ok = answered !== null && isAcceptable(d, answered.actual)
          const chosen = answered !== null && answered.guess === d
          const state = answered === null
            ? 'bg-contrast/10 border-contrast/12 text-content hover:bg-contrast/16 hover:border-gold/50 cursor-pointer active:scale-[0.97]'
            : chosen
              ? ok ? 'bg-success/20 border-success text-success' : 'bg-error/20 border-error text-error'
              : ok ? 'bg-transparent border-success/60 text-success/90' : 'bg-transparent border-contrast/8 text-content/30'
          return (
            <button
              key={d}
              type="button"
              onClick={() => answered === null && onAnswer(d)}
              disabled={answered !== null}
              data-testid={`deck-${d}`}
              aria-pressed={chosen || undefined}
              className={`h-11 sm:h-12 short:h-9 rounded-xl border text-[0.9375rem] sm:text-base font-bold tabular-nums select-none
                inline-flex items-center justify-center gap-1
                transition-[background-color,border-color,color,transform] duration-150 ease-out disabled:cursor-default ${state}`}
            >
              {chosen && (ok ? <Check size={14} strokeWidth={3} aria-hidden /> : <X size={14} strokeWidth={3} aria-hidden />)}
              {formatDecks(d, locale)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
