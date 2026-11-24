import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { CasinoSessionResult } from '../../engine/casino-session/types'
import { MIN_GRADED_HANDS, sessionScores } from '../../engine/casino-session/session-scores'
import type { SessionRecorder } from '../../services/session-recorder'
import { formatDollar, formatTime } from './helpers'
import { TRIAL_HANDS } from '../../services/casino-trial'
import { ACTION_KEY } from '../training/deviation-utils'
import { formatTrueCount, sessionMisses, spotName, type SessionMiss } from './hand-review-model'

interface CasinoSessionSummaryProps {
  result: CasinoSessionResult
  onPlayAgain: () => void
  onHome: () => void
  recorder: SessionRecorder | null
  /**
   * The session was played at the free trial table: how many trial hands the
   * account has left. With none, "play again" leads to the paywall and says so.
   */
  trial?: { handsLeft: number }
}

/** A percentage in the reader's format: "84 %" in German, "84%" in English. */
function percent(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value / 100)
  } catch {
    return `${Math.round(value)}%`
  }
}

/** A short decimal in the reader's format: "0.4" / "0,4". */
function decimal(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)
  } catch {
    return value.toFixed(1)
  }
}

/** The misses listed before "and N more". */
const MISSES_SHOWN = 6

/**
 * What a player sees after a Casino Session.
 *
 * Laid out like a scorecard, not a list: on a wide screen the result and the
 * grade on the left, the categories as bars in the middle, the hands that
 * were played wrong with the right play on the right; on a phone the same
 * three, one under the other, with the way on held at the foot of the screen.
 *
 * Two things it no longer pretends. A category the session gave nothing to
 * grade — no count check asked, no deviation spot met, insurance never
 * offered — says so instead of drawing a full bar at "100.0 %". And a session
 * shorter than {@link MIN_GRADED_HANDS} hands gets no letter: two hands made a
 * red "F" out of one wrong decision. The counts are shown at any length.
 *
 * There used to be a third button here — "export debug log" — which downloaded
 * a `casino-debug-*.json` of every recorded event. It served a diagnostic
 * purpose during development and outlived it. The `SessionRecorder` itself
 * stays: it still feeds the anomaly count below.
 */
export function CasinoSessionSummary({ result, onPlayAgain, onHome, recorder, trial }: CasinoSessionSummaryProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const anomalyCount = recorder?.getAnomalyCount() ?? 0
  /** The trial's hands are used up: the way on from here is Pro. */
  const trialDone = trial !== undefined && trial.handsLeft === 0
  const basicPlay = result.config.playStyle === 'basic'
  const scores = sessionScores(result)
  const misses = sessionMisses(result.hands, result.config)
  // The table's own labels end in a colon ("Start:"); as headings over a figure they do not.
  const label = (key: string) => t(key).replace(/\s*:\s*$/, '')

  // In basic play the bets and the count are not part of the game: those rows
  // are left out, not shown as a phantom score.
  const categories: CategoryProps[] = [
    ...(basicPlay ? [] : [{
      id: 'betting', label: t('casino.summary.betting'), value: scores.bet,
      correct: result.correctBetDecisions, total: result.totalBetDecisions,
      detail: t('casino.summary.ofTotal', { n: result.correctBetDecisions, total: result.totalBetDecisions }),
      empty: t('try.table.noDecisions'),
    }]),
    {
      id: 'play', label: t('casino.summary.play'), value: scores.play,
      correct: result.correctPlayDecisions, total: result.totalPlayDecisions,
      detail: t('casino.summary.ofTotal', { n: result.correctPlayDecisions, total: result.totalPlayDecisions }),
      empty: t('try.table.noDecisions'),
    },
    ...(basicPlay ? [] : [
      {
        id: 'counting', label: t('casino.summary.counting'), value: scores.count,
        correct: result.correctRCChecks + result.correctTCChecks, total: result.totalCountChecks * 2,
        // The literal "RC: x/y" is the row's handle in the tests across every language.
        detail: `RC: ${result.correctRCChecks}/${result.totalCountChecks}, TC: ${result.correctTCChecks}/${result.totalCountChecks}`
          + ` · ${t('casino.summary.avgRcError')} ${decimal(result.avgRCError, locale)} · ${t('casino.summary.avgTcError')} ${decimal(result.avgTCError, locale)}`,
        empty: t('casino.summary.emptyCount'),
      },
      {
        id: 'deviations', label: t('casino.summary.deviations'), value: scores.deviation,
        correct: result.correctDeviations, total: result.totalDeviationSituations,
        detail: t('casino.summary.ofTotal', { n: result.correctDeviations, total: result.totalDeviationSituations }),
        empty: t('casino.summary.emptyDeviations'),
      },
    ]),
    {
      id: 'insurance', label: t('casino.summary.insurance'), value: scores.insurance,
      correct: result.correctInsuranceDecisions, total: result.totalInsuranceOffers,
      detail: t('casino.summary.ofTotal', { n: result.correctInsuranceDecisions, total: result.totalInsuranceOffers }),
      empty: t('casino.summary.emptyInsurance'),
    },
  ]

  const net = result.netProfit
  // A typographic minus for the large figure: the hyphen sat apart from the dollar sign.
  const netText = net > 0 ? `+${formatDollar(net)}` : net < 0 ? `−${formatDollar(-net)}` : formatDollar(0)

  return (
    <div className="flex-1 overflow-y-auto" data-testid="casino-summary">
      <div className="min-h-full flex flex-col px-4 pt-5 pb-4 lg:pt-3 lg:pb-5">
        <div className="w-full max-w-[86rem] mx-auto lg:my-auto">
          <div className="surface">
          <div className="grid lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.15fr)_minmax(0,1.15fr)] lg:divide-x divide-contrast/8 max-lg:divide-y">
            {/* ── The result ── */}
            <section className="p-5 sm:p-6 lg:px-7 lg:py-5" aria-labelledby="summary-result">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-gold">{t('casino.summary.eyebrow')}</div>
              <p className="mt-1 text-xs text-content/45" data-testid={basicPlay ? 'summary-basic-mode' : 'summary-counting-mode'}>
                {basicPlay ? t('casino.summary.basicMode') : t('casino.summary.countingMode')}
              </p>

              <div className="mt-4 flex items-center gap-4" id="summary-result">
                {scores.grade ? (
                  <>
                    <span className="text-7xl leading-none font-black tracking-tight" style={{ color: scores.grade.color }} data-testid="summary-grade">
                      {scores.grade.letter}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-content/50">{t('casino.summary.overall')}</div>
                      <div className="text-2xl font-extrabold text-content tabular-nums" data-testid="summary-overall">
                        {scores.overall !== null ? percent(scores.overall, locale) : '—'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="grid place-items-center shrink-0 w-[4.5rem] h-[4.5rem] rounded-2xl border border-dashed border-contrast/20 text-2xl font-bold text-content/30"
                      data-testid="summary-grade" aria-hidden>—</span>
                    <div className="min-w-0" data-testid="summary-no-grade">
                      <div className="text-sm font-semibold text-content/80">{t('casino.summary.noGrade', { min: MIN_GRADED_HANDS })}</div>
                      <div className="mt-0.5 text-xs text-content/50">{t('casino.summary.noGradeHands', { count: scores.hands })}</div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-contrast/8">
                <div className="text-xs text-content/50">{label('casino.summary.net')}</div>
                <div className={`mt-0.5 text-3xl font-extrabold tabular-nums ${net > 0 ? 'text-success' : net < 0 ? 'text-error' : 'text-content'}`} data-testid="summary-net">
                  {netText}
                </div>
                <div className="mt-1 text-xs text-content/50 tabular-nums">
                  {formatDollar(result.startingBankroll)} <span aria-hidden className="text-content/30">→</span> {formatDollar(result.finalBankroll)}
                </div>
                <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <Stat label={label('casino.summary.handsLabel')} value={String(result.hands.length)} />
                  <Stat label={label('casino.summary.duration')} value={formatTime(result.durationSeconds)} />
                  <Stat label={label('casino.summary.peak')} value={formatDollar(result.peakBankroll)} />
                  <Stat label={label('casino.summary.drawdown')} value={formatDollar(result.worstDrawdown)} />
                </dl>
              </div>
            </section>

            {/* ── The categories ── */}
            <section className="p-5 sm:p-6 lg:px-7 lg:py-5" aria-labelledby="summary-accuracy">
              <h3 id="summary-accuracy" className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-content/50">
                {t('casino.summary.accuracy')}
              </h3>
              <ul className="mt-3.5 space-y-3">
                {categories.map((c, i) => <Category key={c.id} {...c} order={i} />)}
              </ul>
            </section>

            {/* ── The hands played wrong ── */}
            <section className="p-5 sm:p-6 lg:px-7 lg:py-5 min-w-0" aria-labelledby="summary-misses">
              <h3 id="summary-misses" className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-content/50">
                {t('try.end.missedTitle')}
              </h3>
              <Misses misses={misses} decisions={result.totalPlayDecisions + result.totalInsuranceOffers} />
            </section>
          </div>

          {/*
            The card's foot: the trial's one line and the anomaly note on the
            left, the way on at the right. On a phone, where the scorecard is
            three screens long, it is held at the foot of the screen. The
            trial's last pair goes one under the other there: "Keep playing
            with Pro" is a sentence in most languages.
          */}
          <footer
            className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 px-4 py-3.5 sm:px-6 lg:px-7 lg:py-3.5 border-t border-contrast/8 rounded-b-2xl
              max-lg:sticky max-lg:bottom-[var(--cookie-bar,0px)] max-lg:z-20 max-lg:bg-surface-2/95 max-lg:backdrop-blur-md"
          >
            {(trial || anomalyCount > 0) && (
              <div className="min-w-0 lg:flex-1 flex flex-col gap-1 max-lg:text-center">
                {trial && (
                  <p className="text-sm text-content/70" data-testid="trial-summary-note">
                    {trial.handsLeft > 0
                      ? t('casino.trial.summaryLeft', { count: trial.handsLeft })
                      : t('casino.trial.summaryDone', { hands: TRIAL_HANDS })}
                  </p>
                )}
                {anomalyCount > 0 && (
                  <p className="text-sm font-semibold text-warning" data-testid="anomaly-warning">
                    {'\u26A0'} {t('casino.summary.anomalies', { count: anomalyCount })}
                  </p>
                )}
              </div>
            )}
            <div className={`flex gap-3 lg:ml-auto ${trialDone ? 'max-sm:flex-col' : ''}`} data-testid="summary-actions">
              <button onClick={onPlayAgain} data-testid="play-again"
                className="lift-glow flex-[3] lg:flex-none lg:min-w-[15rem] h-12 px-4 sm:px-6 rounded-xl whitespace-nowrap font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50
                  shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer">
                {trialDone ? t('casino.trial.toPro') : t('casino.summary.playAgain')}
              </button>
              <button onClick={onHome} data-testid="go-home"
                className="flex-[2] lg:flex-none lg:min-w-[11rem] h-12 px-4 sm:px-6 rounded-xl whitespace-nowrap font-bold text-content bg-contrast/6 border border-contrast/15 hover:border-gold/45 transition-colors cursor-pointer">
                {t('casino.summary.home')}
              </button>
            </div>
          </footer>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-content/50 truncate">{label}</dt>
      <dd className="mt-0.5 font-semibold text-content tabular-nums">{value}</dd>
    </div>
  )
}

interface CategoryProps {
  id: string
  label: string
  /** 0–100, or null when the session had nothing to grade here. */
  value: number | null
  /** The answers behind it: right, and graded in all (a count check is two, running and true). */
  correct: number
  total: number
  detail: string
  /** What is said in place of the bar when there was nothing to grade. */
  empty: string
}

/**
 * One category: its name and score, a bar, and the count behind it.
 *
 * The bar grows from the left when the summary opens — 400ms on Carbon's
 * productive standard curve, 40ms apart, on transform only — once per
 * session, so it may be seen. With reduced motion it is drawn full at once.
 */
function Category({ id, label, value, correct, total, detail, empty, order }: CategoryProps & { order: number }) {
  const { i18n } = useTranslation()
  const reduced = useReducedMotion()
  return (
    <li data-testid={`summary-category-${id}`} data-empty={String(value === null)} data-correct={correct} data-total={total}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-content/85">{label}</span>
        <span className={`text-lg font-extrabold tabular-nums ${value === null ? 'text-content/30' : 'text-content'}`}>
          {value === null ? '—' : percent(value, i18n.language)}
        </span>
      </div>
      {value === null ? (
        <p className="mt-0.5 text-xs text-content/40">{empty}</p>
      ) : (
        <>
          <div className="mt-1 h-2 rounded-full bg-contrast/10 overflow-hidden" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)' }}>
            <motion.div
              className="h-full rounded-full origin-left"
              style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold-bright))' }}
              initial={reduced ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, delay: order * 0.04, ease: [0.2, 0, 0.38, 0.9] }}
            />
          </div>
          <p className="mt-0.5 text-xs text-content/45 tabular-nums">{detail}</p>
        </>
      )}
    </li>
  )
}

/** The hands played wrong, with the right play — or, without any, that there were none. */
function Misses({ misses, decisions }: { misses: SessionMiss[]; decisions: number }) {
  const { t, i18n } = useTranslation()
  if (misses.length === 0) {
    return (
      <p className="mt-4 flex items-start gap-2.5 text-sm text-content/70" data-testid="summary-perfect">
        {decisions > 0 && (
          <span className="grid place-items-center w-5 h-5 mt-px shrink-0 rounded-full bg-success/15 text-success" aria-hidden>
            <Check size={12} strokeWidth={3.5} />
          </span>
        )}
        {decisions > 0 ? t('try.end.perfect') : t('try.table.noDecisions')}
      </p>
    )
  }
  const shown = misses.slice(0, MISSES_SHOWN)
  const act = (a: string) => t(ACTION_KEY[a] ?? a)
  const say = (take: boolean) => (take ? t('actions.insurance') : t('try.table.noInsurance'))
  return (
    <>
      <table className="mt-3 w-full text-sm tabular-nums" data-testid="summary-misses">
        <thead>
          <tr className="text-[0.6875rem] text-content/45 text-left">
            <th scope="col" className="font-medium pb-2 pr-3">{t('try.end.colHand')}</th>
            <th scope="col" className="font-medium pb-2 pr-3">{t('try.end.colYou')}</th>
            <th scope="col" className="font-medium pb-2 text-right">{t('try.end.colRight')}</th>
          </tr>
        </thead>
        <tbody className="border-t border-contrast/10">
          {shown.map((m, i) => {
            let spot: ReactNode
            let you: string
            let right: string
            let tag: string | null = null
            if (m.row.kind === 'insurance') {
              spot = t('casino.summary.insurance')
              you = say(m.row.took)
              right = say(m.row.take)
            } else {
              const name = spotName(m.row.spot.hand)
              spot = t('try.end.hand', { hand: t(name.key, name.values), dealer: m.row.spot.dealer })
              you = act(m.row.chosen)
              right = act(m.row.correct)
              if (m.row.index && m.row.trueCount !== null) tag = `TC ${formatTrueCount(m.row.trueCount, i18n.language)}`
            }
            return (
              // The same spot can be missed twice; the position is the identity.
              <tr key={i} className="border-b border-contrast/8 last:border-b-0">
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-content">
                  <span className="whitespace-nowrap">{spot}</span>
                  {tag && <span className="ml-2 text-[0.6875rem] font-bold text-gold-bright/85 whitespace-nowrap">{tag}</span>}
                </th>
                <td className="py-2 pr-3"><s className="text-error/80">{you}</s></td>
                <td className="py-2 text-right font-semibold text-success whitespace-nowrap">{right}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {misses.length > shown.length && (
        <p className="mt-2 text-xs text-content/45" data-testid="summary-more-misses">
          {t('try.table.moreMisses', { count: misses.length - shown.length })}
        </p>
      )}
    </>
  )
}
