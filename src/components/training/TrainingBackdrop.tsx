import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatsStore } from '../../store/stats-store'
import type { TrainingMode } from '../../services/stats-types'
import { RAIL_CONTENT } from './training-rail-content'

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
              // Gold only. The felt-green wash that used to sit at the bottom
              // belongs on the casino table, not behind a settings panel — it
              // read as a second, unrelated theme.
              // Sized in px rather than percent: a percentage radial keeps
              // stretching on an ultrawide monitor until it flattens out.
              background:
                'radial-gradient(900px 420px at 50% -40px, color-mix(in srgb, var(--color-gold) 26%, transparent), transparent 70%),' +
                'radial-gradient(1600px 700px at 50% 0%, color-mix(in srgb, var(--color-gold) 10%, transparent), transparent 65%)',
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
  const { t } = useTranslation()
  const content = RAIL_CONTENT[mode]!
  // Literal class strings so Tailwind's JIT keeps both variants.
  const bpClass = breakpoint === '2xl' ? 'hidden 2xl:block' : 'hidden xl:block'
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)

  // Training screens don't otherwise hydrate the stats store; load it once so
  // the last-run figures reflect real saved sessions rather than an empty store.
  useEffect(() => {
    if (lifetimeStats == null) void loadStats()
  }, [lifetimeStats, loadStats])

  const lastSession = sessions.find(s => s.mode === mode)
  const lastAcc = lastSession ? Math.round(lastSession.accuracy * 100) : null
  const bestAcc = lifetimeStats?.byMode[mode]?.bestAccuracy != null
    ? Math.round(lifetimeStats.byMode[mode]!.bestAccuracy * 100)
    : null

  return (
    // The rails flank the *content*, not the monitor. Pinning them to the
    // viewport edges threw them ~1500px away from the centred panel on an
    // ultrawide screen, where they read as unrelated scraps in the corners.
    // A centred max-width track keeps them beside the panel at every size.
    <div aria-hidden className="absolute inset-0 pointer-events-none z-0">
      <div className="relative mx-auto h-full max-w-[86rem]">
        {/* left — how it works */}
        <aside className={`${bpClass} absolute left-4 top-1/2 -translate-y-1/2 w-[17rem]`}>
          <div className="rounded-2xl border border-contrast/10 bg-surface-2/55 backdrop-blur-sm p-5">
            <div className="text-xs font-bold tracking-[0.12em] uppercase text-content/45 mb-3">{t('training.rail.howItWorks')}</div>
            <ol className="space-y-3">
              {content.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5 items-start text-sm text-content/65 leading-snug">
                  <span className="flex-shrink-0 grid place-items-center w-[1.35rem] h-[1.35rem] rounded-full text-xs font-bold text-gold-bright"
                    style={{ background: 'color-mix(in srgb, var(--color-gold) 15%, transparent)' }}>{i + 1}</span>
                  {t(step)}
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* right — last run + pro-tip */}
        <aside className={`${bpClass} absolute right-4 top-1/2 -translate-y-1/2 w-[17rem]`}>
          <div className="rounded-2xl border border-contrast/10 bg-surface-2/55 backdrop-blur-sm p-5">
            <div className="text-xs font-bold tracking-[0.12em] uppercase text-content/45 mb-2">{t('training.rail.yourLastRun')}</div>
            {lastAcc != null ? (
              <>
                <div className="text-[2rem] font-extrabold text-gold-bright tracking-tight leading-none">
                  {lastAcc}<span className="text-[0.5em] text-content/50 font-semibold">%</span>
                </div>
                <div className="text-sm text-content/55 mt-2 leading-snug">
                  {bestAcc != null ? t('training.rail.bestInMode', { pct: bestAcc }) : t('training.rail.keepItUp')}
                </div>
              </>
            ) : (
              <div className="text-sm text-content/50 leading-snug">{t('training.rail.noRuns')}</div>
            )}
          </div>
          <div className="rounded-2xl border border-contrast/10 bg-surface-2/55 backdrop-blur-sm p-5 mt-3">
            <div className="text-xs font-bold tracking-[0.12em] uppercase text-content/45 mb-2">{t('training.rail.proTip')}</div>
            <p className="text-sm text-content/65 leading-relaxed">{t(content.tip)}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
