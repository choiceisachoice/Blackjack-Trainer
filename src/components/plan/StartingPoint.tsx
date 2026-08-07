import { ArrowRight, Spade } from 'lucide-react'
import { ENTRY_OPTIONS, type EntryOption } from '../../services/starting-point'

/**
 * Staggered entrance in CSS. See WelcomeScreen for why this is not a JS
 * animation: a JS entrance that starts at opacity 0 leaves the whole screen
 * invisible whenever requestAnimationFrame does not run.
 */
const rise = (delay: number, className = '') => ({
  className: `rise-in ${className}`,
  style: { animationDelay: `${delay}s` },
})

/**
 * The only question the app asks before it opens.
 *
 * This replaced a six-question profile plus an adaptive card test. The full
 * reasoning is in `services/starting-point.ts`; the short version is that the
 * other five answers were either editable one screen later or never used, and a
 * five-minute exam in front of an unseen product costs more than the accuracy
 * it bought.
 *
 * One tap, no confirm step, no result screen. The answer chooses where the plan
 * starts, and the next thing the learner sees is the app itself.
 */
export function StartingPoint({
  onPick,
  onSkip,
}: {
  /** Answered — carries the whole option so the caller can key a recommendation off it. */
  onPick: (option: EntryOption) => void
  /**
   * Leave without answering. Kept because the plan is the app's front door: a
   * front door you cannot walk past is a gate, and someone who just wants to
   * try a drill should not have to answer anything first.
   */
  onSkip?: () => void
}) {
  return (
    <div className="app-canvas flex-1 overflow-y-auto" data-testid="starting-point">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <header>
          <span className="grid place-items-center w-11 h-11 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-5">
            <Spade size={20} className="fill-current" />
          </span>
          <h1 className="text-[1.75rem] md:text-4xl font-extrabold text-gold-gradient leading-[1.1] pb-1 tracking-tight">
            Where are you starting from?
          </h1>
          <p className="mt-3 text-[0.95rem] text-content/55 leading-relaxed max-w-[52ch]">
            One question, and it is the only one. Pick the highest line that is true — it
            decides where your plan begins, and nothing is closed off either way.
          </p>
        </header>

        <div className="mt-8 flex flex-col gap-2.5">
          {ENTRY_OPTIONS.map((o, i) => (
            <button
              key={o.value}
              onClick={() => onPick(o)}
              data-testid={`entry-${o.value}`}
              {...rise(
                0.04 + i * 0.05,
                `group w-full text-left rounded-2xl border border-contrast/12 bg-contrast/[.03] p-4 md:p-5
                 hover:border-gold/45 hover:bg-gold/[.06] cursor-pointer transition-colors`,
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-[1.05rem]">{o.label}</div>
                  <div className="mt-1 text-sm text-content/50 leading-snug">{o.hint}</div>
                </div>
                <ArrowRight
                  size={18}
                  className="shrink-0 text-content/25 group-hover:text-gold transition-colors"
                />
              </div>
            </button>
          ))}
        </div>

        {onSkip && (
          <button
            onClick={onSkip}
            data-testid="starting-point-skip"
            className="mt-8 mx-auto block text-sm text-content/40 hover:text-content/70
              cursor-pointer transition-colors"
          >
            Skip — let me look around first
          </button>
        )}
      </div>
    </div>
  )
}
