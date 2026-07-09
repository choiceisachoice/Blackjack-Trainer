import { useEffect } from 'react'
import { useStatsStore } from '../../store/stats-store'
import type { TrainingMode } from '../../services/stats-types'

/**
 * Per-mode content for the settings-screen context rails: a short "how it
 * works" sequence and a pro-tip. Keyed by the stats `TrainingMode` so the rail
 * can also pull that mode's real last-run figures.
 */
export const RAIL_CONTENT: Partial<Record<TrainingMode, { steps: string[]; tip: string }>> = {
  speedDrill: {
    steps: ['Cards flash by briefly.', 'Keep the running count as they go.', 'Enter your final count at the end.'],
    tip: 'Count in pairs (+2 / 0 / −2) rather than card by card — much faster at casino speed.',
  },
  deviationFlashCards: {
    steps: ['A hand + dealer card + true count.', 'Pick the correct action.', 'Do you deviate from basic strategy right?'],
    tip: 'The Illustrious 18 carry most of the deviation edge — master those first.',
  },
  betSpread: {
    steps: ['A true count is shown.', 'Choose the optimal bet size.', 'Closer to optimal = more points.'],
    tip: 'Rule of thumb: bet ≈ (true count − 1) × unit. It usually turns profitable from TC +2.',
  },
  deckEstimation: {
    steps: ['Watch the thickness of the discard tray.', 'Estimate the decks remaining.', 'The closer you are, the higher your score.'],
    tip: 'Count in decks, not cards — a full deck is ~19 mm in the discard tray.',
  },
  casinoSession: {
    steps: ['Take your seat and keep the count silently.', 'Size each bet by the true count.', 'Play every hand — deviations included.'],
    tip: 'Raise your bet only when the count is in your favor — flat-bet the rest to stay under the radar.',
  },
}

/**
 * Ambient, dark-luxury backdrop for the training-mode settings screens.
 *
 * Layers a soft gold/felt glow, a faint oversized suit watermark, fine grain
 * and a vignette behind the centred config panel so the screen reads as
 * finished and atmospheric rather than an empty black field. Purely decorative
 * (aria-hidden) and non-interactive.
 *
 * When `showRails` is set and the mode has rail content, it also floats two
 * context rails into the flanks on wide screens: a "how it works" sequence and
 * the mode's real last-run figures + a pro-tip. The rails never cover the
 * centred content — they appear from `railBreakpoint` up (use `2xl` for wider
 * hosts like the Casino Session setup).
 *
 * `showGlow` can be turned off for hosts that carry their own top/bottom
 * headings (e.g. Casino Session), keeping only the suit watermark + vignette so
 * the glow doesn't fight the titles.
 */
export function TrainingBackdrop({
  mode,
  showRails = false,
  showGlow = true,
  railBreakpoint = 'xl',
}: {
  mode?: TrainingMode
  showRails?: boolean
  showGlow?: boolean
  railBreakpoint?: 'xl' | '2xl'
}) {
  return (
    <>
      {/* ── ambient atmosphere (decorative) ── */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        {/* gold glow (top) + felt glow (bottom) — tuned for full-screen scale */}
        {showGlow && (
          <div
            data-testid="backdrop-glow"
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(45% 38% at 50% -2%, color-mix(in srgb, var(--color-gold) 30%, transparent), transparent 66%),' +
                'radial-gradient(90% 55% at 50% 0%, color-mix(in srgb, var(--color-gold) 12%, transparent), transparent 60%),' +
                'radial-gradient(58% 42% at 50% 106%, color-mix(in srgb, var(--color-felt) 38%, transparent), transparent 68%)',
            }}
          />
        )}
        {/* oversized suit watermark */}
        <div className="absolute inset-0" style={{ color: 'var(--color-gold)' }}>
          <span className="absolute -top-16 -left-16 leading-none rotate-[-15deg]" style={{ fontSize: '340px', opacity: 0.1 }}>♠</span>
          <span className="absolute -bottom-28 -right-14 leading-none rotate-[12deg]" style={{ fontSize: '420px', opacity: 0.1 }}>♦</span>
        </div>
        {/* vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(115% 80% at 50% 42%, transparent 40%, rgba(0,0,0,.55) 100%)', opacity: 0.85 }} />
      </div>

      {/* ── context rails (settings screen, wide viewports) ── */}
      {showRails && mode && RAIL_CONTENT[mode] && <ContextRails mode={mode} breakpoint={railBreakpoint} />}
    </>
  )
}

/** The two flanking rails: how-it-works (left) and last-run + tip (right). */
function ContextRails({ mode, breakpoint }: { mode: TrainingMode; breakpoint: 'xl' | '2xl' }) {
  const content = RAIL_CONTENT[mode]!
  // Literal class strings so Tailwind's JIT keeps both variants.
  const bpClass = breakpoint === '2xl' ? 'hidden 2xl:block' : 'hidden xl:block'
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)

  // Training screens don't otherwise hydrate the stats store; load it once so
  // the last-run figures reflect real saved sessions rather than an empty store.
  useEffect(() => {
    if (lifetimeStats == null) loadStats()
  }, [lifetimeStats, loadStats])

  const lastSession = sessions.find(s => s.mode === mode)
  const lastAcc = lastSession ? Math.round(lastSession.accuracy * 100) : null
  const bestAcc = lifetimeStats?.byMode[mode]?.bestAccuracy != null
    ? Math.round(lifetimeStats.byMode[mode]!.bestAccuracy * 100)
    : null

  return (
    <>
      {/* left — how it works */}
      <aside className={`${bpClass} absolute left-6 top-1/2 -translate-y-1/2 w-[240px] z-0`} aria-hidden>
        <div className="rounded-2xl border border-contrast/10 bg-surface-2/55 backdrop-blur-sm p-4">
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-content/40 mb-3">How it works</div>
          <ol className="space-y-2.5">
            {content.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 items-start text-[12.5px] text-content/60 leading-snug">
                <span className="flex-shrink-0 grid place-items-center w-[18px] h-[18px] rounded-full text-[10px] font-bold text-gold-bright"
                  style={{ background: 'color-mix(in srgb, var(--color-gold) 15%, transparent)' }}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* right — last run + pro-tip */}
      <aside className={`${bpClass} absolute right-6 top-1/2 -translate-y-1/2 w-[240px] z-0`} aria-hidden>
        <div className="rounded-2xl border border-contrast/10 bg-surface-2/55 backdrop-blur-sm p-4">
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-content/40 mb-2">Your last run</div>
          {lastAcc != null ? (
            <>
              <div className="text-[1.6rem] font-extrabold text-gold-bright tracking-tight leading-none">
                {lastAcc}<span className="text-[0.5em] text-content/50 font-semibold">%</span>
              </div>
              <div className="text-xs text-content/55 mt-1.5 leading-snug">
                {bestAcc != null ? `Best in this mode: ${bestAcc}%.` : 'Keep it up.'}
              </div>
            </>
          ) : (
            <div className="text-xs text-content/50 leading-snug">No runs yet — start your first and watch your progress here.</div>
          )}
        </div>
        <div className="rounded-2xl border border-contrast/10 bg-surface-2/55 backdrop-blur-sm p-4 mt-3">
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-content/40 mb-2">Pro tip</div>
          <p className="text-[12.5px] text-content/60 leading-relaxed">{content.tip}</p>
        </div>
      </aside>
    </>
  )
}
