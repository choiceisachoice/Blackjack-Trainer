import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useAppStore } from '../../store/app-store'
import { useIsPro } from '../../store/entitlement-store'
import { Route, ChevronRight } from 'lucide-react'
import { ProTeaser } from '../pro/ProTeaser'
import {
  deriveCurriculum,
  currentStage,
  getPlacement,
  getReadStages,
  stageIndex,
} from '../../services/curriculum'
import type { TrainingSessionResult } from '../../services/stats-types'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { getAchievementById, achievementName } from '../../services/achievements/achievement-list'
import {
  RANGE_ORDER,
  RANGE_LABEL,
  MODE_DISPLAY,
  formatWhen,
  buildKpis,
  buildTrend,
  buildHeatmap,
  buildModeAccuracy,
  buildSkillRadar,
  buildEdge,
  buildWeakestHands,
  deriveInsight,
  type TimeRange,
  type Kpi,
} from './analytics-derive'
import {
  Sparkline,
  TrendChart,
  Heatmap,
  HeatLegend,
  ModeBars,
  WeakestHands,
  SkillRadar,
  EdgeChart,
} from './AnalyticsCharts'

/** Reusable elevated panel. */
function Panel({
  title,
  note,
  children,
  className = '',
}: {
  title: string
  note?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`surface p-5 ${className}`}>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-[0.95rem] font-semibold text-content tracking-tight">{title}</h2>
        {note && <span className="text-xs text-content/40">{note}</span>}
      </div>
      {children}
    </div>
  )
}

/** Render a KPI value string, shrinking unit suffixes marked with `~`. */
function renderKpiValue(display: string) {
  const segs = display.split('~')
  const parts: { t: string; small: boolean }[] = [{ t: segs[0], small: false }]
  for (let i = 1; i < segs.length; i++) {
    const m = /^([^0-9]*)(.*)$/.exec(segs[i])
    const unit = m?.[1] ?? ''
    const rest = m?.[2] ?? ''
    if (unit) parts.push({ t: unit, small: true })
    if (rest) parts.push({ t: rest, small: false })
  }
  return parts.map((p, i) =>
    p.small ? (
      <small key={i} className="text-[0.5em] font-bold text-content/50 ml-0.5">{p.t}</small>
    ) : (
      <span key={i}>{p.t}</span>
    ),
  )
}

/** A single KPI tile with delta pill and sparkline. */
function KpiTile({ kpi, hero, footNote }: { kpi: Kpi; hero?: boolean; footNote?: string }) {
  const { t } = useTranslation()
  const dir = kpi.delta == null ? 'flat' : kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : 'flat'
  const pillColor =
    dir === 'up' ? 'var(--color-success)' : dir === 'down' ? 'var(--color-error)' : 'var(--color-content)'
  const showPill = kpi.deltaDisplay !== '' || footNote != null

  return (
    <div
      className="surface p-4 relative overflow-hidden"
      data-testid={`kpi-${kpi.key}`}
      style={
        hero
          ? {
              borderColor: 'color-mix(in srgb, var(--color-gold) 32%, transparent)',
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--color-gold) 9%, var(--color-surface)), var(--color-surface))',
            }
          : undefined
      }
    >
      <div className="text-[0.75rem] font-semibold tracking-[0.12em] uppercase text-content/50">{t(kpi.labelKey)}</div>
      <div className="text-[clamp(1.6rem,3vw,2.05rem)] font-extrabold tracking-tight leading-none mt-2 text-content">
        {renderKpiValue(kpi.display)}
      </div>
      <div className="flex items-center justify-between mt-2 min-h-[26px]">
        {showPill ? (
          <span
            className="text-xs font-bold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{ color: pillColor, background: `color-mix(in srgb, ${pillColor} 14%, transparent)` }}
          >
            {kpi.deltaDisplay
              ? `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''} ${kpi.deltaDisplay}`.trim()
              : footNote}
          </span>
        ) : (
          <span />
        )}
        <Sparkline data={kpi.spark} />
      </div>
    </div>
  )
}

/** Bold the highlighted segments of an insight sentence. */
function renderInsight(text: string, highlights: string[]) {
  if (highlights.length === 0) return text
  const pattern = highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`(${pattern})`, 'g')
  return text.split(re).map((chunk, i) =>
    highlights.includes(chunk) ? (
      <b key={i} className="text-gold-bright font-bold">{chunk}</b>
    ) : (
      <span key={i}>{chunk}</span>
    ),
  )
}

/**
 * Analytics dashboard (2.0) — a dark-luxury, data-first view of the user's
 * training: an insight hook, five range-aware KPIs, an accuracy trend, a
 * practice-consistency heatmap, a skill radar, the real Casino Session edge,
 * per-mode accuracy, most-misplayed hands, and recent sessions.
 *
 * All figures derive from real stored sessions — nothing is illustrative.
 */
/**
 * The training plan, condensed to one row: how far along the path the learner
 * is and what they are working on.
 *
 * Renders nothing before the placement test — there is no plan to report, and
 * an empty progress bar would imply one exists.
 */
function PlanStrip({
  sessions,
  isPro,
  onOpen,
}: {
  sessions: TrainingSessionResult[]
  isPro: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const placement = getPlacement()
  if (!placement) return null

  const progress = deriveCurriculum(sessions, getReadStages(), isPro)
  const active = currentStage(progress, placement)
  const from = stageIndex(placement)
  const total = progress.length - from
  const done = progress.slice(from).filter(p => p.done).length

  return (
    <button
      onClick={onOpen}
      data-testid="analytics-plan-strip"
      className="w-full text-left surface p-4 flex items-center gap-4 hover:border-gold/35
        border border-transparent transition-colors cursor-pointer"
    >
      <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0 text-gold bg-gold/10 border border-gold/20">
        <Route size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
          Training plan · {done} of {total} stages
        </span>
        <span className="block mt-0.5 font-semibold truncate">
          {active ? t(active.stage.titleKey) : t('plan.everyStageComplete')}
        </span>
        <span className="block mt-2 h-1.5 rounded-full bg-contrast/10 overflow-hidden">
          <span
            className="block h-full rounded-full bg-gold transition-[width] duration-300"
            style={{ width: `${(done / Math.max(total, 1)) * 100}%` }}
          />
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-content/30" />
    </button>
  )
}

export function AnalyticsDashboard() {
  const { t } = useTranslation()
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const isLoading = useStatsStore(s => s.isLoading)
  const loadStats = useStatsStore(s => s.loadStats)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)
  const resetAllStats = useStatsStore(s => s.resetAllStats)
  const [resetError, setResetError] = useState<string | null>(null)
  const setMode = useAppStore(s => s.setMode)
  const isPro = useIsPro()

  const [range, setRange] = useState<TimeRange>('30d')

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Stable "now" per mount so all derivations agree on the window.
  const now = useMemo(() => new Date(), [])
  const streak = getTrainingStreak()

  const derived = useMemo(() => {
    return {
      insight: deriveInsight(sessions, range, streak, now),
      kpis: buildKpis(sessions, range, streak, now),
      trend: buildTrend(sessions, range, now),
      heatmap: buildHeatmap(sessions, now),
      modes: buildModeAccuracy(sessions, range, now),
      radar: buildSkillRadar(sessions, range, now),
      edge: buildEdge(sessions, range, now),
      weakest: buildWeakestHands(sessions, range, now),
    }
  }, [sessions, range, streak, now])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-content/50">{t('analytics.loading')}</p>
      </div>
    )
  }

  const hasData = (lifetimeStats?.totalSessions ?? 0) > 0
  const bestStreak = lifetimeStats?.bestStreak ?? 0
  const radarSorted = [...derived.radar].sort((a, b) => b.value - a.value)
  const radarColor = (v: number) =>
    v >= 85 ? 'var(--color-success)' : v >= 75 ? 'var(--color-gold)' : 'var(--color-warning)'

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="analytics-dashboard">
      <div className="max-w-[1180px] mx-auto space-y-4">
        {/* Header */}
        <header className="flex items-end justify-between flex-wrap gap-4 mb-2">
          <div>
            <div className="text-[0.75rem] font-semibold tracking-[0.22em] uppercase text-content/50 flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" style={{ boxShadow: '0 0 10px var(--color-gold)' }} />
              {t('analytics.yourTraining')}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">{t('modes.analytics')}</h1>
            <p className="text-sm text-content/50 mt-2">
              {t('analytics.subhead')}
            </p>
          </div>
          <div className="inline-flex p-1 gap-0.5 rounded-[10px] bg-surface-2 border border-contrast/10" role="group" aria-label={t('analytics.timeRange')}>
            {RANGE_ORDER.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`text-xs px-2.5 py-1.5 rounded-[7px] transition-colors cursor-pointer ${
                  range === r ? 'text-gold-bright font-semibold' : 'text-content/50 hover:text-content/80'
                }`}
                style={range === r ? { background: 'color-mix(in srgb, var(--color-gold) 16%, transparent)' } : undefined}
                aria-pressed={range === r}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </header>

        {!hasData ? (
          <div className="surface p-10 text-center">
            <p className="text-content/60 text-lg font-medium">{t('analytics.noSessions')}</p>
            <p className="text-content/40 text-sm mt-1">{t('analytics.noSessionsBody')}</p>
          </div>
        ) : (
          <>
            {/* Where these numbers sit in the plan. Analytics answers "how am I
                doing"; without this it never answers "at what". */}
            <PlanStrip sessions={sessions} isPro={isPro} onOpen={() => setMode('plan')} />

            {/* Insight hook */}
            <div
              className="flex items-center gap-3.5 rounded-[14px] p-4"
              style={{
                background:
                  'linear-gradient(100deg, color-mix(in srgb, var(--color-gold) 11%, var(--color-surface)), var(--color-surface))',
                border: '1px solid color-mix(in srgb, var(--color-gold) 26%, transparent)',
              }}
              data-testid="insight-strip"
            >
              <div
                className="grid place-items-center w-9 h-9 rounded-[10px] text-lg flex-shrink-0"
                style={{
                  background: 'color-mix(in srgb, var(--color-gold) 18%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--color-gold) 30%, transparent)',
                }}
              >
                {derived.insight.icon}
              </div>
              <div className="text-[13.5px] leading-snug text-content/90">
                <span className="block text-[0.6875rem] font-bold tracking-[0.14em] uppercase text-content/50">{t('analytics.insight')}</span>
                {renderInsight(t(derived.insight.textKey, derived.insight.values), derived.insight.highlights)}
              </div>
            </div>

            {/* KPI row */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              {derived.kpis.map(kpi => (
                <KpiTile
                  key={kpi.key}
                  kpi={kpi}
                  hero={kpi.key === 'accuracy'}
                  footNote={kpi.key === 'streak' && bestStreak > 0 ? `Best ${bestStreak}` : undefined}
                />
              ))}
            </section>

            {/* Advanced analytics — Pro. Free users see a teaser instead. */}
            {!isPro ? (
              <ProTeaser
                title={t('analytics.proHeadline')}
                subtitle={t('analytics.proSub')}
                items={[1, 2, 3, 4, 5].map(n => t(`analytics.teaser.i${n}`))}
                upgradeHeadline={t('analytics.teaser.upgrade')}
              />
            ) : (
            <>
            {/* Trend + heatmap */}
            <section className="grid lg:grid-cols-[1.9fr_1fr] gap-4">
              <Panel title={t('analytics.accuracyTrend')} note={derived.trend.length >= 2 ? undefined : t('analytics.note.needDays')}>
                {derived.trend.length >= 2 ? (
                  <TrendChart points={derived.trend} />
                ) : (
                  <div className="h-[230px] grid place-items-center text-content/40 text-sm">
                    {t('analytics.trendEmpty')}
                  </div>
                )}
              </Panel>

              <Panel title={t('analytics.consistency')} note={t('analytics.note.last12')}>
                <Heatmap columns={derived.heatmap.cells} />
                <div className="flex items-center justify-between mt-3.5 text-xs text-content/50">
                  <span className="inline-flex items-center gap-1.5 font-bold text-gold-bright">
                    {streak > 0 ? `🔥 ${t('analytics.streakDaysShort', { n: streak })}` : t('analytics.noStreak')}
                  </span>
                  <HeatLegend />
                </div>
              </Panel>
            </section>

            {/* Skill radar + simulated edge */}
            <section className="grid lg:grid-cols-2 gap-4">
              <Panel title={t('analytics.skillProfile')} note={t('analytics.note.sharpRusty')}>
                <div className="flex items-center gap-2 flex-wrap">
                  <SkillRadar axes={derived.radar} />
                  <div className="flex-1 min-w-[150px] flex flex-col gap-2 text-[12.5px]">
                    {radarSorted.map(a => (
                      <div key={a.axis} className="flex items-center justify-between gap-3">
                        <span className="text-content/50">{a.axis}</span>
                        <b className="font-bold" style={{ color: radarColor(a.value) }}>{a.value}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel title={t('analytics.simulatedEdge')} note={t('analytics.note.casinoNet')}>
                {derived.edge.sessions > 0 ? (
                  <>
                    <div className="flex items-baseline gap-2.5">
                      <span
                        className="text-[1.75rem] font-extrabold tracking-tight"
                        style={{ color: derived.edge.net >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}
                      >
                        {derived.edge.net >= 0 ? '+' : '−'}${Math.abs(Math.round(derived.edge.net)).toLocaleString('en-US')}
                      </span>
                      <span className="text-xs font-bold text-content/50">
                        {derived.edge.sessions} sessions · {derived.edge.handsPlayed.toLocaleString('en-US')} hands
                      </span>
                    </div>
                    <p className="text-xs text-content/40 mb-1.5 mt-0.5">{t('analytics.edgeCaption')}</p>
                    <EdgeChart points={derived.edge.points} />
                  </>
                ) : (
                  <div className="h-[132px] grid place-items-center text-center text-content/40 text-sm px-4">
                    {t('analytics.edgeEmpty')}
                  </div>
                )}
              </Panel>
            </section>

            {/* Mode accuracy + weakest hands */}
            <section className="grid lg:grid-cols-[1.15fr_1fr] gap-4">
              <Panel title={t('analytics.accuracyByMode')} note={t('analytics.note.thisPeriod')}>
                {derived.modes.length > 0 ? (
                  <ModeBars rows={derived.modes} />
                ) : (
                  <div className="h-24 grid place-items-center text-content/40 text-sm">{t('analytics.noneInRange')}</div>
                )}
              </Panel>

              <Panel title={t('analytics.weakestHands')} note={t('analytics.note.misplayed')}>
                {derived.weakest.length > 0 ? (
                  <>
                    <WeakestHands hands={derived.weakest} />
                    <button
                      onClick={() => setMode('deviationTraining')}
                      className="mt-4 inline-flex items-center gap-2 text-[0.85rem] font-semibold px-4 py-2 rounded-[10px] cursor-pointer glow-hover"
                      style={{
                        color: '#10100c',
                        background: 'linear-gradient(to bottom, var(--color-gold-bright), var(--color-gold))',
                        border: '1px solid color-mix(in srgb, var(--color-gold) 50%, transparent)',
                      }}
                    >
                      Drill these hands →
                    </button>
                  </>
                ) : (
                  <div className="h-24 grid place-items-center text-center text-content/40 text-sm px-4">
                    {t('analytics.weakEmpty')}
                  </div>
                )}
              </Panel>
            </section>
            </>
            )}

            {/* Recent sessions */}
            <Panel title={t('analytics.recentSessions')} note={t('analytics.note.lastN', { n: Math.min(sessions.length, 8) })}>
              <div className="overflow-x-auto overflow-y-hidden">
                <table className="w-full text-[0.85rem] border-collapse tabular-nums">
                  <thead>
                    <tr className="text-[0.6875rem] tracking-[0.1em] uppercase text-content/40">
                      <th className="text-left font-semibold px-2.5 pb-2.5">{t('analytics.col.when')}</th>
                      <th className="text-left font-semibold px-2.5 pb-2.5">{t('analytics.col.mode')}</th>
                      <th className="text-right font-semibold px-2.5 pb-2.5">{t('analytics.col.accuracy')}</th>
                      <th className="text-right font-semibold px-2.5 pb-2.5">{t('analytics.col.hands')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 8).map(s => {
                      const acc = Math.round(s.accuracy * 100)
                      const col = acc >= 85 ? 'var(--color-success)' : acc >= 78 ? 'var(--color-gold)' : 'var(--color-warning)'
                      const disp = MODE_DISPLAY[s.mode]
                      return (
                        <tr key={s.id} className="border-t border-contrast/10">
                          <td className="px-2.5 py-2.5 text-content/50">{formatWhen(s.timestamp, now)}</td>
                          <td className="px-2.5 py-2.5">
                            <span className="inline-flex items-center gap-2">
                              <i className="w-1.5 h-1.5 rounded-full" style={{ background: disp?.color ?? 'var(--color-gold)' }} />
                              {disp ? t(disp.labelKey) : s.mode}
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5 text-right">
                            <span
                              className="font-bold px-2 py-0.5 rounded-full text-xs"
                              style={{ color: col, background: `color-mix(in srgb, ${col} 14%, transparent)` }}
                            >
                              {acc}%
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5 text-right text-content/50">{s.totalQuestions}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Achievements */}
            <RecentAchievements />
          </>
        )}

        {/*
          Reset.

          It said "reset all training data" and cleared the session history and
          nothing else — `storage.clearAll()` removes one key. Level, XP,
          achievements and challenge progress all survived, so anyone asking for
          a clean slate did not get one and was told they had. Wording that
          overstates a destructive, irreversible action is the worst kind to get
          wrong, so the promise now matches the behaviour rather than the other
          way round: wiping the earned rewards too would be a bigger decision
          than a relabelling, and belongs in a deliberate "delete everything"
          feature, not here.
        */}
        <section className="pt-2 pb-8 flex flex-col items-start gap-2">
          <button
            onClick={async () => {
              if (!window.confirm(
                'Delete your training history? Your sessions and the analytics '
                + 'built from them go for good. Your level, XP and achievements stay.'
              )) return
              setResetError(null)
              try {
                await resetAllStats()
              } catch (e) {
                // Previously fire-and-forget: a failed clear left the old data on
                // screen with nothing said, after the user had confirmed.
                setResetError(e instanceof Error ? e.message : t('analytics.deleteFailed'))
              }
            }}
            className="text-sm text-error/60 hover:text-error transition-colors cursor-pointer"
            data-testid="reset-all-stats"
          >
            {t('analytics.deleteHistory')}
          </button>
          {resetError && (
            <p className="text-sm text-error" role="alert">{resetError}</p>
          )}
        </section>
      </div>
    </div>
  )
}

const TIER_BADGE: Record<string, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  diamond: '💎',
}

/** Recent achievements strip with a link to the full gallery. */
function RecentAchievements() {
  const { t, i18n } = useTranslation()
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)
  const setMode = useAppStore(s => s.setMode)

  const recent = achievementEngine
    .getUnlocked()
    .sort((a, b) => b.unlockedAt - a.unlockedAt)
    .slice(0, 3)
    .map(u => ({ ...u, achievement: getAchievementById(u.achievementId) }))
    .filter(u => u.achievement != null)

  return (
    <Panel title={`Recent achievements`} note={`${totalUnlocked} unlocked`}>
      <div className="flex items-center justify-end mb-2 -mt-1">
        <button
          onClick={() => setMode('achievements')}
          className="text-xs text-gold hover:text-gold/80 transition-colors cursor-pointer"
          data-testid="view-all-achievements"
        >
          View All →
        </button>
      </div>
      {recent.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {recent.map(({ achievementId, unlockedAt, achievement }) => (
            <div key={achievementId} className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">{achievement!.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content truncate">{achievementName(achievement!, t)}</p>
                <p className="text-xs text-content/40">
                  {new Date(unlockedAt).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <span className="text-lg">{TIER_BADGE[achievement!.tier]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-content/40 py-4" data-testid="no-achievements">
          No achievements unlocked yet. Keep training!
        </div>
      )}
    </Panel>
  )
}
