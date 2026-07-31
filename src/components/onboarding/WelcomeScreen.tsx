import { Spade, ArrowRight, Crown } from 'lucide-react'
import { buildWelcomeCopy } from './welcome-content'

/**
 * Staggered entrance, done in CSS rather than with an animation library.
 *
 * A JS entrance starts an element at opacity 0 and relies on
 * requestAnimationFrame to reveal it. When rAF does not run — a background tab,
 * a throttled renderer, a script that fails or arrives late — the content stays
 * invisible. That was measured here, not guessed: 7 of 15 elements on this
 * screen, including the headline and the only button, sat at opacity 0.
 *
 * `.rise-in` has a *visible* base state and animates into it, so every failure
 * mode leaves the screen readable.
 */
const rise = (delay: number, className = '') => ({
  className: `rise-in ${className}`,
  style: { animationDelay: `${delay}s` },
})

/**
 * The first screen a new account sees.
 *
 * One job: turn "I just signed up" into "I know what happens next" before the
 * user has to make a single decision. Three steps and one button — a grid of
 * eight training modes at this moment is a shrug, not a welcome.
 */
export function WelcomeScreen({ isPro, onStart }: { isPro: boolean; onStart: () => void }) {
  const copy = buildWelcomeCopy(isPro)

  return (
    <div
      className="app-canvas settle-in flex-1 min-h-0 overflow-y-auto flex items-center justify-center"
      data-testid="welcome-screen"
    >
      {/*
        Sized to fit a normal window without a scrollbar — the first screen of a
        product should be one complete thought, not something you discover the
        bottom of. The copy is one line per step for exactly this reason.

        But it scrolls rather than clips. `overflow-hidden` on content that does
        not fit does not remove the scrollbar, it removes the button: measured at
        1280x600 the layout needed 734px, so hiding the overflow would have cut
        off the only call to action. Fit when you can, scroll when you cannot,
        never clip.
      */}
      <div className="w-full max-w-3xl px-5 md:px-6 py-[clamp(1.5rem,4vh,3.5rem)]">
        <div {...rise(0, 'flex items-center gap-3')}>
          <span className="grid place-items-center w-11 h-11 rounded-xl text-gold bg-gold/10 border border-gold/25">
            {isPro ? <Crown size={20} /> : <Spade size={20} className="fill-current" />}
          </span>
          <span
            className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-gold"
            data-testid="welcome-eyebrow"
          >
            {copy.eyebrow}
          </span>
        </div>

        <h1
          {...rise(
            0.08,
            'mt-6 text-[clamp(1.65rem,4.2vh,2.9rem)] font-extrabold text-gold-gradient leading-[1.08] tracking-tight text-balance pb-1',
          )}
        >
          {copy.headline}
        </h1>

        <p {...rise(0.16, 'mt-4 text-[1.0625rem] text-content/60 leading-relaxed max-w-[58ch]')}>
          {copy.subhead}
        </p>

        <ol className="mt-[clamp(1.75rem,4vh,3rem)] flex flex-col">
          {copy.steps.map((step, i) => (
            <li
              key={step.title}
              {...rise(0.26 + i * 0.09, 'relative flex gap-5 pb-[clamp(1.1rem,2.6vh,2.25rem)] last:pb-0')}
            >
              {/* Connecting rail — the path this screen describes, drawn. */}
              {i < copy.steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[17px] top-9 bottom-0 w-px
                    bg-gradient-to-b from-gold/35 to-transparent"
                />
              )}
              <span
                aria-hidden
                className="relative z-10 shrink-0 grid place-items-center w-[35px] h-[35px] rounded-full
                  text-[0.8rem] font-bold tabular-nums text-gold
                  bg-casino-bg border border-gold/35"
              >
                {i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <h2 className="font-semibold text-[1.0625rem] tracking-tight">{step.title}</h2>
                <p className="mt-1.5 text-[0.95rem] text-content/55 leading-relaxed max-w-[56ch]">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div {...rise(0.58, 'mt-[clamp(1.75rem,4vh,3rem)]')}>
          <button
            onClick={onStart}
            data-testid="welcome-start"
            className="group inline-flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-[1.0625rem] font-semibold
              bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer
              shadow-[0_10px_30px_-12px_var(--color-gold)] hover:shadow-[0_14px_38px_-12px_var(--color-gold)]
              transition-shadow"
          >
            {copy.cta}
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </button>

          {copy.footnote && (
            <p className="mt-4 text-sm text-content/40 max-w-[52ch]" data-testid="welcome-footnote">
              {copy.footnote}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
