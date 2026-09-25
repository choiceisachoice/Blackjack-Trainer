import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Loader2, RefreshCw } from 'lucide-react'
import { usePageMeta } from '../hooks/use-page-meta'
import { logFailure } from '../services/failure-log'
import {
  fetchAnalyticsReport,
  formatDuration,
  rangeBounds,
  RANGE_PRESETS,
  type AnalyticsReport,
  type RangeChoice,
  type RangePreset,
} from '../services/analytics/report'
import { DailyBars, type DailyMetric } from '../components/analytics-web/WebAnalyticsCharts'
import { Segmented, EmptyState } from '../components/common/ui'

/** `YYYY-MM-DD` of a local date, for the date inputs. */
function dayString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const PRESET_KEY: Record<RangePreset, string> = {
  today: 'adminAnalytics.range.today',
  yesterday: 'adminAnalytics.range.yesterday',
  last7: 'adminAnalytics.range.last7',
  last30: 'adminAnalytics.range.last30',
}

const METRICS: readonly DailyMetric[] = ['visitors', 'sessions', 'page_views', 'registrations']

const METRIC_KEY: Record<DailyMetric, string> = {
  visitors: 'adminAnalytics.kpi.visitors',
  sessions: 'adminAnalytics.sessions',
  page_views: 'adminAnalytics.kpi.pageViews',
  registrations: 'adminAnalytics.kpi.registrations',
}

/** One of the five numbers. */
function Kpi({ label, value, note, testId }: { label: string; value: string; note?: string; testId: string }) {
  return (
    <div className="surface p-4" data-testid={testId}>
      <div className="text-[0.75rem] font-semibold tracking-[0.12em] uppercase text-content/50">{label}</div>
      <div className="text-[clamp(1.6rem,3vw,2.05rem)] font-extrabold tracking-tight leading-none mt-2 text-content tabular-nums">
        {value}
      </div>
      {note && <div className="text-xs text-content/40 mt-2">{note}</div>}
    </div>
  )
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface p-5 ${className}`}>
      <h2 className="text-[0.95rem] font-semibold text-content tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  )
}

/** A two-column list with a proportional bar behind each count. */
function RankedList({ rows, testId }: { rows: { label: string; count: number; key: string }[]; testId: string }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...rows.map(r => r.count))
  if (rows.length === 0) return <p className="text-sm text-content/40" data-testid={`${testId}-empty`}>{t('adminAnalytics.empty')}</p>
  return (
    <ol className="space-y-1.5" data-testid={testId}>
      {rows.map(r => (
        <li key={r.key} className="relative flex items-center justify-between gap-3 text-sm px-2 py-1.5 rounded-lg overflow-hidden">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 rounded-lg"
            style={{ width: `${(r.count / max) * 100}%`, background: 'color-mix(in srgb, var(--color-gold) 14%, transparent)' }}
          />
          <span className="relative truncate text-content/85">{r.label}</span>
          <span className="relative font-semibold tabular-nums text-content">{r.count.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * `/admin/analytics` — the operator's five numbers, for a range.
 *
 * Everything shown comes from one call to `analytics_report`; the page holds
 * the range, the chosen metric for the chart, and the last answer. The
 * definitions live on the SQL function and are repeated in one footnote
 * here, because a number without its definition is a guess.
 */
export function AdminAnalyticsPage() {
  const { t } = useTranslation()
  usePageMeta('admin-analytics', '/admin/analytics')

  const [choice, setChoice] = useState<RangeChoice>({ kind: 'preset', preset: 'last7' })
  const [customFrom, setCustomFrom] = useState(() => dayString(new Date(Date.now() - 6 * 86_400_000)))
  const [customTo, setCustomTo] = useState(() => dayString(new Date()))
  const [metric, setMetric] = useState<DailyMetric>('visitors')
  const [reloadTick, setReloadTick] = useState(0)
  /**
   * The last answer, tagged with the request it answers. "Loading" is not a
   * flag but a comparison: the current request has no answer yet. The last
   * good report stays on screen, dimmed, while the next one is fetched, and
   * survives a failure so a flaky reload does not blank the page.
   */
  const [answer, setAnswer] = useState<{ key: string; report: AnalyticsReport | null; error: boolean } | null>(null)

  const bounds = useMemo(() => rangeBounds(choice), [choice])
  const key = bounds ? `${bounds.from.toISOString()}|${bounds.to.toISOString()}|${reloadTick}` : null

  useEffect(() => {
    if (!bounds || !key) return
    let alive = true
    fetchAnalyticsReport(bounds)
      .then(r => { if (alive) setAnswer({ key, report: r, error: false }) })
      .catch(e => {
        logFailure('admin-analytics', e)
        if (alive) setAnswer(prev => ({ key, report: prev?.report ?? null, error: true }))
      })
    return () => { alive = false }
  }, [bounds, key])

  const report = answer?.report ?? null
  const loading = key !== null && answer?.key !== key
  const state: 'loading' | 'ready' | 'error' = loading ? 'loading' : answer?.error ? 'error' : 'ready'

  const applyCustom = useCallback(() => {
    setChoice({ kind: 'custom', from: customFrom, to: customTo })
  }, [customFrom, customTo])

  const rangeOptions = [
    ...RANGE_PRESETS.map(p => ({ value: p, label: t(PRESET_KEY[p]) })),
    { value: 'custom' as const, label: t('adminAnalytics.range.custom') },
  ]
  const selected = choice.kind === 'preset' ? choice.preset : 'custom'

  const deviceLabel = (d: string | null) =>
    d === 'mobile' || d === 'tablet' || d === 'desktop' ? t(`adminAnalytics.devices.${d}`) : t('adminAnalytics.unknown')

  return (
    <div className="app-canvas min-h-screen text-content">
      <div className="max-w-5xl mx-auto px-6 py-14">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> {t('account.backToApp')}
        </Link>
        <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t('adminAnalytics.title')}</h1>
            <p className="text-sm text-content/50 mt-1">{t('adminAnalytics.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setReloadTick(n => n + 1)}
            className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content cursor-pointer"
            data-testid="analytics-reload"
          >
            <RefreshCw size={14} /> {t('adminAnalytics.reload')}
          </button>
        </div>

        {/* Range */}
        <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="analytics-range">
          <Segmented
            options={rangeOptions}
            value={selected}
            onChange={v => {
              if (v === 'custom') applyCustom()
              else setChoice({ kind: 'preset', preset: v })
            }}
            ariaLabel={t('adminAnalytics.range.label')}
          />
          {selected === 'custom' && (
            <form
              className="flex items-center gap-2 text-sm"
              onSubmit={e => { e.preventDefault(); applyCustom() }}
              data-testid="analytics-custom-range"
            >
              <label className="flex items-center gap-1.5 text-content/60">
                {t('adminAnalytics.range.from')}
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="rounded-lg bg-contrast/5 border border-contrast/10 px-2 py-1 text-content"
                  data-testid="analytics-from"
                />
              </label>
              <label className="flex items-center gap-1.5 text-content/60">
                {t('adminAnalytics.range.to')}
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="rounded-lg bg-contrast/5 border border-contrast/10 px-2 py-1 text-content"
                  data-testid="analytics-to"
                />
              </label>
              <button type="submit" className="rounded-lg px-3 py-1 font-semibold bg-gold text-on-gold cursor-pointer" data-testid="analytics-apply">
                {t('adminAnalytics.range.apply')}
              </button>
            </form>
          )}
        </div>
        {!bounds && (
          <p className="mt-2 text-sm text-error" data-testid="analytics-invalid-range">{t('adminAnalytics.invalidRange')}</p>
        )}

        {/* Body */}
        {state === 'error' && (
          <div className="mt-8">
            <EmptyState icon={BarChart3} title={t('adminAnalytics.errorTitle')} body={t('adminAnalytics.errorBody')} />
          </div>
        )}
        {state === 'loading' && !report && (
          <div className="mt-8 flex items-center gap-2 text-content/50" data-testid="analytics-loading">
            <Loader2 size={18} className="animate-spin" /> {t('adminAnalytics.loading')}
          </div>
        )}
        {report && state !== 'error' && (
          <div className={state === 'loading' ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={state === 'loading'}>
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="analytics-kpis">
              <Kpi label={t('adminAnalytics.kpi.visitors')} value={report.visitors.toLocaleString()} testId="kpi-visitors" />
              <Kpi label={t('adminAnalytics.kpi.pageViews')} value={report.page_views.toLocaleString()} testId="kpi-page-views" />
              <Kpi label={t('adminAnalytics.kpi.avgSession')} value={formatDuration(report.avg_session_seconds)} note={t('adminAnalytics.sessionsCount', { count: report.sessions })} testId="kpi-avg-session" />
              <Kpi label={t('adminAnalytics.kpi.registrations')} value={report.registrations.toLocaleString()} testId="kpi-registrations" />
              <Kpi label={t('adminAnalytics.kpi.payingCustomers')} value={report.paying_customers.toLocaleString()} note={t('adminAnalytics.kpi.payingNow')} testId="kpi-paying" />
            </div>

            <Panel title={t('adminAnalytics.perDay')} className="mt-4">
              <div className="mb-3">
                <Segmented
                  options={METRICS.map(m => ({ value: m, label: t(METRIC_KEY[m]) }))}
                  value={metric}
                  onChange={setMetric}
                  ariaLabel={t('adminAnalytics.perDay')}
                />
              </div>
              <DailyBars rows={report.daily} metric={metric} label={t(METRIC_KEY[metric])} />
            </Panel>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Panel title={t('adminAnalytics.topPages')} className="lg:col-span-1">
                <RankedList
                  testId="analytics-top-pages"
                  rows={report.top_pages.map(p => ({ key: p.pathname, label: p.pathname, count: p.views }))}
                />
              </Panel>
              <Panel title={t('adminAnalytics.referrers')}>
                <RankedList
                  testId="analytics-referrers"
                  rows={report.referrers.map(r => ({ key: r.host ?? '∅', label: r.host ?? t('adminAnalytics.direct'), count: r.sessions }))}
                />
              </Panel>
              <Panel title={t('adminAnalytics.devices.title')}>
                <RankedList
                  testId="analytics-devices"
                  rows={report.devices.map(d => ({ key: d.device ?? '∅', label: deviceLabel(d.device), count: d.sessions }))}
                />
              </Panel>
            </div>

            <p className="mt-6 text-xs text-content/40 max-w-3xl" data-testid="analytics-definitions">
              {t('adminAnalytics.definitions')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
