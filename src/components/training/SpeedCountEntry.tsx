import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CornerDownLeft, Minus, Plus } from 'lucide-react'
import { formatTC } from '../strategy-chart/chart-primitives'
import { cleanCountInput, countDraft, parseCount } from './speed-drill-model'

/** Props of {@link SpeedCountEntry}. */
export interface SpeedCountEntryProps {
  /** What is in the field, as shown ("−4"). */
  draft: string
  onDraft: (draft: string) => void
  onSubmit: () => void
  /** The quick-pick values (`quickPicks`), lowest first. */
  picks: readonly number[]
  /** Wong Halves: answers within ±0.5 are accepted. */
  fractional?: boolean
}

/** True on a device with a mouse: there the field takes the focus, so typing works at once. */
function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

/**
 * The answer, large and in the middle of the felt.
 *
 * Three ways to the same number, for three kinds of hand: type it (the field
 * has the focus where there is a keyboard; ↑ and ↓ step), tap it (a chip for
 * every likely value), or step to it (− and +). Enter answers from anywhere
 * on the screen.
 *
 * The field keeps text, not a number: a number state turned the "-" of "-3"
 * back into "0" before the 3 arrived, so a negative count could not be typed
 * at all — "-1" was recorded as "+1". It is a text field rather than a number
 * field so its minus can be the app's real minus (`cleanCountInput`).
 */
export function SpeedCountEntry({ draft, onDraft, onSubmit, picks, fractional = false }: SpeedCountEntryProps) {
  const { t } = useTranslation()
  const field = useRef<HTMLInputElement>(null)
  const value = parseCount(draft)

  useEffect(() => {
    if (hasFinePointer()) field.current?.focus()
  }, [])

  // After a tap on a chip or a step, the field gets the focus back (with a
  // mouse only), so the next key typed goes into it and Enter answers.
  const set = (n: number) => {
    onDraft(countDraft(n))
    if (hasFinePointer()) field.current?.focus()
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      set(value + (e.key === 'ArrowUp' ? 1 : -1))
    }
  }

  const stepClass = `grid place-items-center shrink-0 w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 short:w-11 short:h-11 rounded-full
    bg-black/35 border border-white/15 text-content hover:bg-black/50 hover:border-gold/50 transition-colors duration-150 cursor-pointer`

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-5 lg:gap-6 short:gap-2.5 px-2 py-3 short:py-1">
        <h2 className="text-xl sm:text-2xl lg:text-[1.75rem] short:text-lg font-extrabold text-content text-center tracking-tight" data-testid="count-question">
          {t('training.speed.question')}
        </h2>

        <div className="flex items-center gap-3 sm:gap-5">
          <button type="button" onClick={() => set(value - 1)} aria-label={t('training.speed.decrease')} className={stepClass}>
            <Minus size={22} aria-hidden />
          </button>
          <input
            ref={field}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            value={draft}
            placeholder="0"
            onChange={e => onDraft(cleanCountInput(e.target.value))}
            onKeyDown={onKey}
            data-testid="count-input"
            aria-label={t('training.speed.question')}
            className="w-28 sm:w-36 lg:w-40 h-20 sm:h-24 short:h-14 short:w-28 rounded-2xl text-center tabular-nums
              text-5xl sm:text-6xl short:text-[2.5rem] font-extrabold text-content placeholder:text-content/35
              bg-black/40 border-2 border-gold/55 hover:border-gold/80 focus:border-gold-bright
              shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)] transition-colors duration-150"
          />
          <button type="button" onClick={() => set(value + 1)} aria-label={t('training.speed.increase')} className={stepClass}>
            <Plus size={22} aria-hidden />
          </button>
        </div>

        {/* One chip per likely value; which values depends on the round's
            length only, never on its cards (`quickPicks`). Seven to a row
            below lg, the short row centred; one row on a wide felt. */}
        <div
          role="group"
          aria-label={t('training.speed.quickPicks')}
          className="flex flex-wrap justify-center gap-1 lg:gap-2 max-w-[19.5rem] lg:max-w-[46rem]"
          data-testid="quick-picks"
        >
          {picks.map(v => {
            const on = draft.trim() !== '' && value === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => set(v)}
                aria-pressed={on}
                data-testid={`pick-${v}`}
                className={`w-10 h-11 short:h-9 lg:w-auto lg:min-w-12 lg:h-10 lg:px-2 rounded-full text-sm lg:text-base font-bold tabular-nums transition-colors duration-150 cursor-pointer
                  ${on
                    ? 'bg-gold text-on-gold border border-gold-bright shadow-[0_2px_10px_-4px_var(--color-gold)]'
                    : 'bg-black/30 border border-white/12 text-content/85 hover:border-gold/50 hover:text-content'}`}
              >
                {formatTC(v)}
              </button>
            )
          })}
        </div>

        {fractional && <p className="text-xs text-content/60">{t('training.speed.wongHalves')}</p>}

        <div className="w-full max-w-xs flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onSubmit}
            data-testid="submit-answer"
            className="lift-glow w-full h-12 lg:h-14 short:h-10 rounded-xl inline-flex items-center justify-center gap-2.5
              text-base font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50
              shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer"
          >
            {t('training.speed.submit')}
            <kbd aria-hidden className="hidden [@media(hover:hover)]:inline-grid place-items-center h-6 px-1.5 rounded-md bg-black/15 border border-black/20">
              <CornerDownLeft size={14} strokeWidth={2.5} />
            </kbd>
          </button>
          {/* Where there is a keyboard: the field already has the focus. */}
          <p className="hidden [@media(hover:hover)_and_(pointer:fine)]:block text-xs text-content/55 text-center" data-testid="entry-hint">
            {t('training.speed.entryHint')}
          </p>
        </div>
      </div>
    </div>
  )
}
