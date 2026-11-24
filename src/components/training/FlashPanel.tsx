import { Check, CornerDownLeft, Flame, X } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Trans, useTranslation } from 'react-i18next'
import { Action } from '../../engine/rules/types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'
import { ACTION_COLORS, ACTION_INK, DEALER_KEYS, formatTC } from '../strategy-chart/chart-primitives'
import { ACTION_KEY, formatPercent } from './deviation-utils'
import { handName } from './flash-scene'
import { basicReason, deviationRuleFor, type ChartRowExcerpt } from './flash-teach'

/**
 * The parts of the flashcard screen that are not the hand itself: how the
 * round is going, the spot in words, the chart row it belongs to and, once
 * answered, the verdict.
 *
 * On a wide screen they stack in a side panel beside the felt; on a phone the
 * same elements are placed around the felt by the screen's grid (the panel is
 * `display: contents` there), so nothing is drawn twice.
 */

// ─── Progress ──────────────────────────────────────────

/** Props of {@link FlashProgress}. */
export interface FlashProgressProps {
  /** The current question, from 0. */
  index: number
  /** Questions in the round. */
  total: number
  /** Right or wrong, for every question answered so far. */
  results: boolean[]
  /** Answers in a row that were right. */
  streak: number
  className?: string
}

/**
 * One segment per question: green right, red wrong, gold the one being asked.
 * The round at a glance — which a line of "Correct: 3/4 (75%)" is not.
 *
 * `null` is an item that is done but had nothing to grade (a casino hand that
 * was a blackjack): a lighter grey than the ones still to come.
 */
export function ResultTrail({ total, results, index, className = '' }: { total: number; results: readonly (boolean | null)[]; index: number | null; className?: string }) {
  return (
    <div className={`flex gap-[3px] ${className}`} aria-hidden data-testid="result-trail">
      {Array.from({ length: total }, (_, i) => {
        const r = results[i]
        const tone = r === true ? 'bg-success' : r === false ? 'bg-error'
          : r === null ? 'bg-contrast/35'
          : i === index ? 'bg-gold-bright/90' : 'bg-contrast/12'
        return <span key={i} className={`h-1.5 flex-1 min-w-0 rounded-full transition-colors duration-150 ${tone}`} />
      })}
    </div>
  )
}

/**
 * The round so far: question n of N, the trail, right answers and the streak.
 *
 * One element at every size: a single strip on a phone (label · trail ·
 * figures), two lines in the side panel (label and figures, then the trail).
 */
export function FlashProgress({ index, total, results, streak, className = '' }: FlashProgressProps) {
  const { t, i18n } = useTranslation()
  const correct = results.filter(Boolean).length
  const answered = results.length
  const pct = answered > 0 ? correct / answered : 0
  const hot = streak >= 3
  return (
    <div
      className={`min-w-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3
        lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-2.5 ${className}`}
      data-testid="flash-progress"
    >
      <span className="text-xs lg:text-sm font-semibold text-content/80 tabular-nums whitespace-nowrap" data-testid="question-progress">
        {t('training.common.questionProgress', { n: index + 1, total })}
      </span>
      <ResultTrail total={total} results={results} index={index} className="lg:col-span-2 lg:row-start-2" />
      <span className="inline-flex items-center gap-3 text-xs lg:text-sm tabular-nums lg:col-start-2 lg:row-start-1">
        <span className="font-semibold text-content/80" title={t('training.common.correctOf', { n: correct, total: answered, pct: Math.round(pct * 100) })}>
          <span className="hidden lg:inline text-content/50">{correct}/{answered} · </span>
          {formatPercent(pct, i18n.language)}
        </span>
        <span
          className={`inline-flex items-center gap-0.5 font-bold ${hot ? 'text-gold-bright' : streak > 0 ? 'text-content/80' : 'text-content/35'}`}
          title={t('training.common.streakOf', { n: streak })}
          aria-label={t('training.common.streakOf', { n: streak })}
          data-testid="streak"
        >
          <Flame size={15} aria-hidden className={hot ? 'fill-gold/40' : ''} />
          {streak}
        </span>
      </span>
    </div>
  )
}

// ─── Previous hands ────────────────────────────────────

/** One answered question, for the list of previous hands. */
export interface AnsweredHand {
  question: FlashQuestion
  /** What was chosen. */
  chosen: Action
  /** Whether it was right. */
  correct: boolean
}

/**
 * The hands already answered this round, newest first, each with the right
 * play — and the wrong one struck through where there was one.
 *
 * A drill moves on every few seconds, and the verdict leaves with the hand.
 * This keeps the round reviewable while it runs, in the space beside the
 * felt that the question itself does not need.
 */
export function FlashHistory({ answers, className = '' }: { answers: AnsweredHand[]; className?: string }) {
  const { t } = useTranslation()
  const newestFirst = [...answers].reverse()
  return (
    <div className={`min-h-0 flex flex-col ${className}`} data-testid="flash-history">
      <span className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 mb-1.5">
        {t('training.flash.previous')}
      </span>
      {newestFirst.length === 0 ? (
        <p className="text-xs text-content/40">{t('training.flash.previousEmpty')}</p>
      ) : (
        // Clipped, not scrolled: the newest hands are the ones that matter,
        // and the fade says there is more without asking for a scrollbar.
        <ul
          className="min-h-0 overflow-hidden divide-y divide-contrast/8"
          style={{ maskImage: 'linear-gradient(to bottom, black 75%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 75%, transparent)' }}
        >
          {newestFirst.map((a, i) => <HandRow key={answers.length - i} answer={a} />)}
        </ul>
      )}
    </div>
  )
}

/** One answered hand: right or wrong, the spot, the count if any, the plays. */
function HandRow({ answer: a }: { answer: AnsweredHand }) {
  const { t } = useTranslation()
  const name = handName(a.question)
  return (
    <li className="flex items-center gap-2.5 py-2 text-sm">
      <span className={`grid place-items-center w-5 h-5 rounded-full shrink-0 ${a.correct ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
        {a.correct ? <Check size={12} strokeWidth={3.5} aria-hidden /> : <X size={12} strokeWidth={3.5} aria-hidden />}
      </span>
      <span className="min-w-0 truncate font-semibold text-content/85 tabular-nums">
        {t('try.end.hand', { hand: t(name.key, name.values), dealer: a.question.dealer })}
      </span>
      {a.question.trueCount !== null && (
        <span className="max-sm:hidden shrink-0 text-[0.6875rem] font-bold text-gold-bright/80 tabular-nums">{'TC'} {formatTC(a.question.trueCount)}</span>
      )}
      <span className="ml-auto shrink-0 inline-flex items-baseline gap-1.5 text-xs">
        {!a.correct && <s className="text-error/75">{t(ACTION_KEY[a.chosen])}</s>}
        <span className="font-semibold text-content/75">{t(ACTION_KEY[a.question.correctAction])}</span>
      </span>
    </li>
  )
}

/** How many missed hands the summary lists before it says "and N more". */
const MISSES_SHOWN = 5

/**
 * The hands a round got wrong, for its summary: each with the play chosen,
 * struck through, and the right one. What to drill next, in the order it
 * happened. Nothing is drawn for a round without a miss.
 */
export function FlashMisses({ answers, className = '' }: { answers: AnsweredHand[]; className?: string }) {
  const { t } = useTranslation()
  const misses = answers.filter(a => !a.correct)
  if (misses.length === 0) return null
  const more = misses.length - MISSES_SHOWN
  return (
    <div className={className} data-testid="flash-misses">
      <span className="block text-xs font-semibold tracking-widest uppercase text-content/40 mb-2">{t('try.end.missedTitle')}</span>
      <ul className="divide-y divide-contrast/10 rounded-xl border border-contrast/10 px-3">
        {misses.slice(0, MISSES_SHOWN).map((a, i) => <HandRow key={i} answer={a} />)}
      </ul>
      {more > 0 && <p className="mt-2 text-xs text-content/45">{t('try.table.moreMisses', { count: more })}</p>}
    </div>
  )
}

// ─── The spot ──────────────────────────────────────────

/** The spot in words, large: "Hard 15 vs. 6". */
export function FlashSituation({ question, className = '' }: { question: FlashQuestion; className?: string }) {
  const { t } = useTranslation()
  const name = handName(question)
  return (
    <p
      className={`text-[1.75rem] xl:text-[2rem] [@media(max-height:760px)]:text-2xl leading-tight font-extrabold text-content tracking-tight ${className}`}
      data-testid="spot"
    >
      {t('try.end.hand', { hand: t(name.key, name.values), dealer: question.dealer })}
    </p>
  )
}

// ─── The chart row ─────────────────────────────────────

/** Props of {@link FlashChartRow}. */
export interface FlashChartRowProps {
  /** The row, from `chartRowFor`. */
  row: ChartRowExcerpt
  /** False while the question is open: the cells are blank and the dealer's column asks. */
  revealed: boolean
  /** "S17" or "H17", as the chart names its two tables. */
  rules: string
  /** Marks the cell as one the count can change (a deviation question). */
  deviation: boolean
  className?: string
}

/**
 * The hand's row of the strategy chart, the dealer's column marked.
 *
 * While the question is open the row is blank and the marked cell holds a
 * question mark: the learner sees where the answer lives on the chart without
 * seeing it. Answered, the cells take the chart's colours left to right, 20 ms
 * apart (a 150 ms colour change each — an effect, so no overshoot), and the
 * marked cell stands out of the row.
 */
export function FlashChartRow({ row, revealed, rules, deviation, className = '' }: FlashChartRowProps) {
  const { t } = useTranslation()
  const cols = { gridTemplateColumns: '2.6rem repeat(10, minmax(0, 1fr))' }
  return (
    <div className={className} data-testid="chart-row" data-revealed={String(revealed)}>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 truncate">{t('chart.title')}</span>
        <span className="text-[0.6875rem] font-semibold text-content/40 tabular-nums">{rules}</span>
      </div>
      <div className="grid gap-[3px]" style={cols}>
        <span />
        {DEALER_KEYS.map((d, i) => (
          <span
            key={d}
            className={`text-center text-[0.6875rem] font-semibold tabular-nums ${i === row.column ? 'text-gold-bright' : 'text-content/45'}`}
          >
            {d}
          </span>
        ))}
        <span className="self-center text-xs font-bold text-content/80 tabular-nums">{row.hand}</span>
        {row.cells.map((a, i) => {
          const mine = i === row.column
          return (
            <span
              key={i}
              className={`relative grid place-items-center h-7 [@media(max-height:760px)]:h-6 rounded-[5px] text-[0.6875rem] font-bold
                transition-[background-color,color,opacity,transform,box-shadow] duration-150
                ${mine && revealed ? 'z-10 scale-110 shadow-[0_0_0_2px_#fff,0_4px_12px_rgba(0,0,0,0.5)]' : ''}
                ${!mine && revealed ? 'opacity-55' : ''}
                ${mine && !revealed ? 'border border-dashed border-gold-bright/80 text-gold-bright' : ''}`}
              style={{
                backgroundColor: revealed ? ACTION_COLORS[a] : mine ? 'rgba(212,168,71,0.12)' : 'rgba(255,255,255,0.07)',
                color: revealed ? ACTION_INK : undefined,
                transitionDelay: revealed ? `${i * 20}ms` : '0ms',
              }}
            >
              {revealed ? a : mine ? '?' : ''}
              {deviation && mine && revealed && (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-gold-bright ring-2 ring-casino-bg"
                />
              )}
            </span>
          )
        })}
      </div>
      <p className="mt-1.5 text-[0.6875rem] text-content/45 leading-snug">
        {!revealed ? t('training.flash.chartHint') : row.noSurrender ? t('chart.withoutSurrender') : deviation ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-2 h-2 rounded-full bg-gold-bright" />
            {t('chart.countDeviation')}
          </span>
        ) : ' '}
      </p>
    </div>
  )
}

// ─── The verdict ───────────────────────────────────────

/** Props of {@link FlashVerdict}. */
export interface FlashVerdictProps {
  question: FlashQuestion
  /** Whether the answer was right. */
  isCorrect: boolean
  /** The play the learner chose. */
  selected: Action
  className?: string
}

/**
 * Right or wrong, the right play and one reason.
 *
 * For a basic-strategy hand the reason names the pattern (`basicReason`); for
 * a count question it is the count and the index, in the chart's own words.
 */
export function FlashVerdict({ question, isCorrect, selected, className = '' }: FlashVerdictProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const rule = deviationRuleFor(question)
  const deviated = question.correctAction !== question.basicAction
  const reason = question.trueCount === null ? basicReason(question) : null
  const tone = isCorrect ? 'text-success' : 'text-error'
  return (
    <motion.div
      className={`min-w-0 ${className}`}
      data-feedback={isCorrect ? 'right' : 'wrong'}
      // An 8 px rise over 200 ms (productive entrance), transform only. A
      // fade was tried and measured: framer's accelerated opacity dropped back
      // to 0 for a few frames at its end, a flicker on every answer. With
      // reduced motion the verdict simply appears where it stays.
      initial={reduced ? false : { y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.38, 0.9] }}
    >
      <div className="flex items-center gap-3">
        <span className={`grid place-items-center w-9 h-9 lg:w-10 lg:h-10 rounded-full border shrink-0
          ${isCorrect ? 'bg-success/12 border-success/40' : 'bg-error/12 border-error/40'} ${tone}`}>
          {isCorrect ? <Check size={20} strokeWidth={3} aria-hidden /> : <X size={20} strokeWidth={3} aria-hidden />}
        </span>
        <h3 className={`text-xl lg:text-2xl font-extrabold ${tone}`} data-testid="feedback-result">
          {isCorrect ? t('training.common.correctBang') : t('training.common.wrongBang')}
        </h3>
        {/* The right play, in neutral ink: its button and its chart cell
            wear different colours (the table's and the chart's), and a badge
            in either would contradict the other on the same screen. */}
        <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-bold
          bg-contrast/8 border border-contrast/15 text-content"
          data-testid="right-play"
        >
          <Check size={14} strokeWidth={3} aria-hidden className="text-success" />
          {t(ACTION_KEY[question.correctAction])}
        </span>
      </div>

      {!isCorrect && (
        <p className="mt-2 text-sm text-content/75">
          <Trans
            i18nKey="training.flash.youChose"
            values={{ chosen: t(ACTION_KEY[selected]), right: t(ACTION_KEY[question.correctAction]) }}
            components={{
              w: <span className="text-error font-semibold" />,
              r: <span className="text-success font-semibold" />,
            }}
          />
        </p>
      )}

      <p className="mt-2 text-sm text-content/85 leading-relaxed" data-testid="feedback-explanation">
        {reason ? t(reason.key, reason.values) : (
          <Trans
            i18nKey={deviated ? 'training.flash.deviation' : 'training.flash.noDeviation'}
            values={{
              action: t(ACTION_KEY[question.correctAction]),
              basic: t(ACTION_KEY[question.basicAction]),
              tc: question.trueCount === null ? '' : formatTC(question.trueCount),
            }}
            components={{ h: <span className="text-gold-bright font-semibold" /> }}
          />
        )}
      </p>

      {rule && (
        <p className="mt-1.5 text-xs text-content/60 leading-relaxed" data-testid="deviation-rule">
          <Trans
            i18nKey="chart.deviationRule"
            values={{ tc: formatTC(rule.threshold), action: t(ACTION_KEY[rule.above]) }}
            components={{ b: <b className="text-content font-semibold" /> }}
          />
          <span className="text-content/45"> {t('chart.belowThat', { action: t(ACTION_KEY[rule.below]) })}</span>
        </p>
      )}
    </motion.div>
  )
}

/** Props of {@link FlashNext}. */
export interface FlashNextProps {
  onNext: () => void
  /** The last question: the button leads to the results. */
  last: boolean
  className?: string
}

/** The way on, large, with its key where there is a keyboard. */
export function FlashNext({ onNext, last, className = '' }: FlashNextProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onNext}
      data-testid="next-question"
      className={`lift-glow w-full h-12 lg:h-14 [@media(max-height:820px)]:lg:h-12 short:h-11 rounded-xl inline-flex items-center justify-center gap-2.5
        text-base font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50
        shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer ${className}`}
    >
      {last ? t('training.common.seeResults') : t('training.common.next')}
      <kbd aria-hidden className="hidden [@media(hover:hover)]:inline-grid place-items-center h-6 px-1.5 rounded-md bg-black/15 border border-black/20">
        <CornerDownLeft size={14} strokeWidth={2.5} />
      </kbd>
    </button>
  )
}
