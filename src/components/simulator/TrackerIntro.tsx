import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import type { LucideIcon } from 'lucide-react'
import { introDollars } from './tracker-format'

/** One figure in the example's stat strip. */
export interface IntroStat {
  label: string
  value: string
  /** Colours the value: a gain, a loss, or plain. */
  tone?: 'up' | 'down' | 'plain'
}

/** One row of the example list. */
export interface IntroRow {
  /** Left: what the row is (date, venue). */
  primary: string
  /** Under it: the detail (hours, table, grade). */
  secondary: string
  /** The row's result in dollars. */
  amount: number
  /** A short tag at the end of the row, such as a grade. Optional. */
  tag?: string
  /** The tag's colour class; a quiet green when absent. */
  tagClass?: string
}

/** The illustration on the right: what a filled page looks like. */
export interface IntroSample {
  stats: IntroStat[]
  /** Bankroll after each session, starting with the starting bankroll. */
  curve: number[]
  rows: IntroRow[]
}

/** One promise of what the page will show. */
export interface IntroPoint {
  icon: LucideIcon
  text: string
}

const UP = '#22c55e'
const DOWN = '#ef4444'

const TONE_CLASS: Record<NonNullable<IntroStat['tone']>, string> = {
  up: 'text-green-400',
  down: 'text-red-400',
  plain: 'text-content',
}

/**
 * The first screen of a log that holds nothing yet.
 *
 * Both logs used to open on the same thing: an icon, a bankroll field and a
 * disabled button in a 448px column in the middle of the screen — which told
 * a newcomer neither what the page was for nor why they should fill it in.
 * This says what the page will show (left), shows it (right, a filled page
 * clearly labelled as an example, never the learner's own numbers), and
 * leaves exactly one way on: the `children`.
 *
 * Wide, the two halves sit side by side and the whole thing fits a 720px
 * tall screen; narrow, the promise and the action come first and the example
 * follows.
 *
 * @param testId - The page's test id (the same one the filled page uses)
 * @param icon - The log's icon, beside its name
 * @param kicker - The log's name
 * @param title - What the page is for, as a headline
 * @param body - One or two sentences on how it fills
 * @param points - What the filled page will show, three at most
 * @param sample - The example's figures
 * @param children - The one action
 */
export function TrackerIntro({ testId, icon: Icon, kicker, title, body, points, sample, children }: {
  testId: string
  icon: LucideIcon
  kicker: string
  title: string
  body: string
  points: IntroPoint[]
  sample: IntroSample
  children: ReactNode
}) {
  const { t } = useTranslation()
  const rising = sample.curve[sample.curve.length - 1] >= sample.curve[0]
  const stroke = rising ? UP : DOWN
  const data = sample.curve.map((bankroll, i) => ({ i, bankroll }))
  const min = Math.min(...sample.curve)
  const max = Math.max(...sample.curve)
  const pad = Math.max(1, (max - min) * 0.15)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 lg:px-8 lg:py-6" data-testid={testId}>
      <div
        className="mx-auto w-full max-w-[96rem] grid gap-5 lg:gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:min-h-full"
        data-testid="tracker-intro"
      >
        {/* The promise and the way in. */}
        <section className="flex flex-col gap-5 lg:py-4">
          <div>
            <p className="inline-flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-gold">
              <Icon size={15} aria-hidden />
              {kicker}
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl xl:text-[2.125rem] font-extrabold leading-tight text-gold-gradient text-balance">
              {title}
            </h1>
            <p className="mt-3 text-sm md:text-base text-content/65 leading-relaxed max-w-[52ch]">{body}</p>
          </div>

          <ul className="flex flex-col gap-2.5" data-testid="tracker-intro-points">
            {points.map(p => (
              <li key={p.text} className="flex items-center gap-3 text-sm text-content/80">
                <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg text-gold bg-gold/10 border border-gold/20">
                  <p.icon size={16} aria-hidden />
                </span>
                {p.text}
              </li>
            ))}
          </ul>

          <div className="pt-1">{children}</div>
        </section>

        {/* The example. Labelled as one twice — the badge and the caption —
            and drawn with plain figures, so nobody mistakes it for their own
            numbers. */}
        <section
          className="surface relative p-4 md:p-5 flex flex-col gap-3.5"
          aria-label={t('trackerIntro.exampleAria')}
          data-testid="tracker-intro-example"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full border border-dashed border-gold/50 px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-gold">
              {t('trackerIntro.example')}
            </span>
            <span className="text-xs text-content/45 text-right">{t('trackerIntro.exampleCaption')}</span>
          </div>

          <dl className="grid grid-cols-3 gap-2.5">
            {sample.stats.map(s => (
              <div key={s.label} className="rounded-xl bg-contrast/5 border border-contrast/10 px-3 py-2">
                <dt className="text-[0.6875rem] text-content/50 truncate">{s.label}</dt>
                <dd className={`text-lg md:text-xl font-bold tabular-nums ${TONE_CLASS[s.tone ?? 'plain']}`}>{s.value}</dd>
              </div>
            ))}
          </dl>

          <div className="h-28 md:h-32 [@media(min-height:860px)]:md:h-44 -mx-1" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id={`${testId}-intro-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={stroke} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={[min - pad, max + pad]} />
                <Area
                  type="monotone"
                  dataKey="bankroll"
                  stroke={stroke}
                  strokeWidth={2}
                  fill={`url(#${testId}-intro-fill)`}
                  dot={{ r: 2.5, fill: stroke, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex flex-col gap-1.5">
            {sample.rows.map(r => (
              <li
                key={r.primary}
                className="flex items-center gap-3 rounded-xl bg-contrast/5 border border-contrast/10 px-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content truncate">{r.primary}</p>
                  <p className="text-xs text-content/50 truncate">{r.secondary}</p>
                </div>
                {r.tag && <span className={`text-sm font-bold shrink-0 ${r.tagClass ?? 'text-green-300'}`}>{r.tag}</span>}
                <span className={`text-sm font-bold tabular-nums shrink-0 w-16 text-right ${r.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {introDollars(r.amount, true)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
