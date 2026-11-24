import type { CSSProperties, ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, CornerDownLeft, Minus, X } from 'lucide-react'
import type { Action } from '../../engine/rules/types'
import { ACTION_KEY } from '../training/deviation-utils'
import { FlashChartRow, ResultTrail } from '../training/FlashPanel'
import { formatDollar } from './helpers'
import { formatTrueCount, spotName, type HandReviewModel, type ReviewRow, type Verdict } from './hand-review-model'
import type { ReviewPlacement } from './review-placement'

/**
 * The review after a hand at the casino table.
 *
 * Every player at the full table meets it after every hand — the free trial
 * ten times — and it used to be two 12px lines under the felt. It is now a
 * panel: the verdict, one row per decision (the bet, insurance, every play,
 * the count check), the hand's row of the strategy chart, and the session's
 * hands so far as a trail.
 *
 * Where it goes depends on the screen (`review-placement.ts`): beside the felt
 * on a desktop, a sheet over the controls on an upright phone — below the
 * player's cards, never over them — and in the controls column on a phone
 * held sideways. The felt never resizes for it: the table keeps one size for
 * the whole session.
 */

// ─── Pieces ────────────────────────────────────────────

function Mark({ ok, size = 'sm' }: { ok: boolean | null; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  const icon = size === 'lg' ? 18 : 12
  const tone = ok === null ? 'bg-contrast/8 text-content/55' : ok ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
  return (
    <span className={`grid place-items-center shrink-0 rounded-full ${box} ${tone}`} aria-hidden>
      {ok === null ? <Minus size={icon} strokeWidth={3} /> : ok ? <Check size={icon} strokeWidth={3.5} /> : <X size={icon} strokeWidth={3.5} />}
    </span>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block mr-1.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] px-1.5 py-px rounded text-gold-bright bg-gold/12 border border-gold/25 whitespace-nowrap">
      {children}
    </span>
  )
}

/**
 * One decision: the mark, what it was about, then the player's answer and the
 * right one, each with its label — "You Stand · Basic strategy Stand". A
 * wrong answer is struck through in red and the right one is green; where
 * both agree, both are plain.
 *
 * Two lines rather than table columns: the panel is 350–440px wide, and
 * "Verdoppeln" twice beside a spot did not fit in one row of it.
 */
function DecisionRow({ ok, label, sub, you, right, rightLabel, note, testId }: {
  ok: boolean
  label: ReactNode
  /** A short tag at the right of the label: the hand's number after a split. */
  sub?: ReactNode
  you: ReactNode
  right: ReactNode
  /** What the right answer is: basic strategy, the bet spread, the actual count. */
  rightLabel: string
  note?: ReactNode
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <li className="flex gap-2.5 py-1.5 border-b border-contrast/8 last:border-b-0" data-testid={testId} data-correct={String(ok)}>
      <span className="pt-px"><Mark ok={ok} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[0.875rem] font-semibold text-content/90 tabular-nums">{label}</span>
          {sub && <span className="shrink-0 text-[0.6875rem] font-medium text-content/45">{sub}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-[0.8125rem] tabular-nums">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[0.6875rem] text-content/45">{t('casino.review.you')}</span>
            <span className={ok ? 'text-content/80' : 'text-error/90'}>{ok ? you : <s>{you}</s>}</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[0.6875rem] text-content/45">{rightLabel}</span>
            <span className={`font-semibold ${ok ? 'text-content/90' : 'text-success'}`}>{right}</span>
          </span>
        </div>
        {note && <p className="mt-1 text-xs text-content/55 leading-snug">{note}</p>}
      </div>
    </li>
  )
}

function ReviewRowView({ row }: { row: ReviewRow }) {
  const { t, i18n } = useTranslation()
  const tc = (n: number) => formatTrueCount(n, i18n.language)
  const act = (a: Action) => t(ACTION_KEY[a])

  if (row.kind === 'insurance') {
    const say = (take: boolean) => (take ? t('casino.review.yes') : t('casino.review.no'))
    return (
      <DecisionRow
        ok={row.isCorrect}
        label={row.trueCount === null ? t('casino.summary.insurance') : `${t('casino.summary.insurance')} · TC ${tc(row.trueCount)}`}
        you={say(row.took)}
        right={say(row.take)}
        rightLabel={row.trueCount === null ? t('casino.review.basic') : t('casino.review.right')}
      />
    )
  }

  if (row.kind === 'count') {
    const both = (rc: number, tcv: number) => `RC ${rc} · TC ${tc(tcv)}`
    return (
      <DecisionRow
        ok={row.isCorrect}
        label={t('casino.setup.countCheck')}
        you={both(row.rc.you, row.tc.you)}
        right={both(row.rc.actual, row.tc.actual)}
        rightLabel={t('casino.review.actual')}
      />
    )
  }

  const name = spotName(row.spot.hand)
  const index = row.index
  return (
    <DecisionRow
      ok={row.isCorrect}
      label={t('try.end.hand', { hand: t(name.key, name.values), dealer: row.spot.dealer })}
      sub={row.hand !== null ? t('casino.table.handNo', { n: row.hand }) : undefined}
      you={act(row.chosen)}
      right={act(row.correct)}
      rightLabel={index ? t('casino.review.deviation') : t('casino.review.basic')}
      note={index && (
        <>
          {row.trueCount !== null && <Tag>{`TC ${tc(row.trueCount)}`}</Tag>}
          {t('casino.review.chartSays', { action: act(index.basic) })}
          {index.rule && (
            <>
              {' · '}
              <Trans
                i18nKey="chart.deviationRule"
                values={{ tc: tc(index.rule.threshold), action: act(index.rule.above) }}
                components={{ b: <b className="text-content/85 font-semibold" /> }}
              />
              {' '}{t('chart.belowThat', { action: act(index.rule.below) })}
            </>
          )}
        </>
      )}
    />
  )
}

function BetRowView({ bet }: { bet: NonNullable<HandReviewModel['bet']> }) {
  const { t, i18n } = useTranslation()
  return (
    <DecisionRow
      ok={bet.isCorrect}
      label={t('casino.review.betAt', { tc: formatTrueCount(bet.trueCount, i18n.language) })}
      you={formatDollar(bet.amount)}
      right={formatDollar(bet.right)}
      rightLabel={t('training.bet.title')}
      testId="review-bet"
    />
  )
}

const NOTHING_KEY: Record<NonNullable<HandReviewModel['nothing']>, string> = {
  blackjack: 'try.table.noneBlackjack',
  dealerBlackjack: 'try.table.noneDealer',
  other: 'try.table.none',
}

/** How many hands the trail shows at most: beyond that, the latest ones. */
const TRAIL_MAX = 20
/** Fewest segments it draws, so the first hands of a session are not one wide bar each. */
const TRAIL_MIN = 10

/**
 * The session's hands so far, right and wrong, and how many were right — the
 * small trail under the verdict, in sight without scrolling however long the
 * hand's list is. A session with a target in hands shows the hands still to
 * come as empty segments, so the trail is also how far the session has got.
 */
export function SessionTrail({ trail, target, className = '' }: {
  trail: readonly Verdict[]
  /** The session's target in hands, when it has one. */
  target?: number
  className?: string
}) {
  const { t } = useTranslation()
  const graded = trail.filter(v => v !== 'none')
  const right = graded.filter(v => v === 'right').length
  const total = target && target >= trail.length && target <= TRAIL_MAX
    ? target
    : Math.min(Math.max(trail.length, TRAIL_MIN), TRAIL_MAX)
  const results = trail.slice(-total).map(v => (v === 'right' ? true : v === 'wrong' ? false : null))
  const said = t('casino.review.handsRight', { right, count: graded.length })
  return (
    <div className={className} data-testid="review-trail">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/45">{t('casino.review.session')}</span>
        <span className="text-[0.6875rem] font-semibold text-content/70 tabular-nums whitespace-nowrap" data-testid="review-trail-count">
          <span aria-hidden>{t('casino.review.handsRightShort', { right, count: graded.length })}</span>
          <span className="sr-only">{said}</span>
        </span>
      </div>
      <ResultTrail total={total} results={results} index={null} />
    </div>
  )
}

// ─── The panel ─────────────────────────────────────────

/** Props of {@link HandReview}. */
export interface HandReviewProps {
  review: HandReviewModel
  /** "S17" or "H17": which chart the row is from. */
  rules: string
  /** Every hand settled this session, this one included. */
  trail: readonly Verdict[]
  /** The session's target in hands, when it has one: the trail shows the hands still to come. */
  target?: number
  placement: ReviewPlacement
  /** For `side`: the edge it docks to, which is the side it slides in from. */
  side?: 'left' | 'right'
  /** The way on, drawn at the foot of the panel (the sheet and the column hold their own button). */
  next?: ReactNode
  className?: string
  style?: CSSProperties
}

/**
 * The review of one hand: the verdict, the session's trail under it, the
 * decisions, the chart row — and, on a phone, the way on.
 *
 * The decisions are one list, in the order they were made: the bet, the
 * insurance answer, every play, the count check. A hand with no play (a
 * blackjack, the dealer's) says why instead of an empty list.
 */
export function HandReview({ review, rules, trail, target, placement, side = 'right', next, className = '', style }: HandReviewProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const verdictText = review.verdict === 'none'
    ? t('casino.review.nothingGraded')
    : review.verdict === 'right' ? t('casino.review.allRight') : t('casino.review.mistakes', { count: review.mistakes })
  const verdictTone = review.verdict === 'none' ? 'text-content' : review.verdict === 'right' ? 'text-success' : 'text-error'
  const plays = review.rows.filter(r => r.kind === 'play')
  const allPlaysRight = plays.every(r => r.isCorrect)
  const compact = placement !== 'side'

  /*
    Arrival only, on transform: a short slide in from the side it docks to
    (or up, for the sheet) — 16px over 200ms on Carbon's productive entrance
    curve. It is seen after every hand, so it stays small and quick; it never
    fades in (a stalled fade would leave an invisible panel holding the way
    on), and it leaves instantly when the next hand starts. With reduced
    motion it simply appears where it stays.
  */
  const from = placement === 'side' ? { x: side === 'left' ? -16 : 16 } : placement === 'sheet' ? { y: 16 } : null
  const pad = compact ? 'px-4 py-3.5' : 'p-4 xl:p-[1.125rem]'

  return (
    <motion.section
      className={`min-h-0 flex flex-col ${className}`}
      style={style}
      initial={reduced || !from ? false : from}
      animate={{ x: 0, y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.38, 0.9] }}
      aria-label={t('casino.review.title', { n: review.handNumber })}
      data-testid="hand-review"
      data-verdict={review.verdict}
      data-split={String(review.split)}
      data-deviation={String(review.deviation)}
      data-placement={placement}
    >
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${pad}`}
        // A long hand can make the panel taller than its room: the fade at its
        // foot says there is more to scroll to, without a scrollbar. (Where it
        // fits, the fade lies over the panel's own bottom padding.)
        style={{ maskImage: 'linear-gradient(to bottom, black calc(100% - 18px), transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black calc(100% - 18px), transparent)' }}
      >
        {/* The verdict, first and largest. */}
        <header className="flex items-center gap-3">
          <Mark ok={review.verdict === 'none' ? null : review.verdict === 'right'} size="lg" />
          <div className="min-w-0">
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-content/50">
              {t('casino.review.title', { n: review.handNumber })}
            </div>
            <h3 className={`text-lg font-extrabold leading-tight ${verdictTone}`} data-testid="review-verdict">{verdictText}</h3>
          </div>
        </header>
        {/* The session's progress, under the verdict: in sight without scrolling, however long the hand. */}
        <SessionTrail trail={trail} target={target} className="mt-3" />

        {/* The decisions, in the order they were made. */}
        {(review.bet || review.rows.length > 0) && (
          <ul className="mt-3 border-t border-contrast/10" data-testid="review-play" data-correct={String(allPlaysRight)}>
            {review.bet && <BetRowView bet={review.bet} />}
            {review.rows.map((row, i) => <ReviewRowView key={i} row={row} />)}
          </ul>
        )}
        {review.nothing && (
          <p className="mt-3 text-sm text-content/65" data-testid="review-nothing">{t(NOTHING_KEY[review.nothing])}</p>
        )}

        {/* Where the hand as dealt sits on the chart. */}
        {review.chart && (
          <FlashChartRow
            className="mt-4 pt-3.5 border-t border-contrast/8"
            row={review.chart.row}
            revealed
            rules={rules}
            deviation={review.chart.deviation}
          />
        )}
      </div>
      {next && <div className={`shrink-0 ${compact ? 'px-4 pb-3 pt-1' : 'px-5 pb-5'}`}>{next}</div>}
    </motion.section>
  )
}

/** Props of {@link ReviewNext}. */
export interface ReviewNextProps {
  onNext: () => void
  className?: string
}

/** The way on from the review, large, with its key where there is a keyboard. */
export function ReviewNext({ onNext, className = '' }: ReviewNextProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onNext}
      data-testid="next-hand"
      className={`lift-glow w-full h-12 rounded-xl inline-flex items-center justify-center gap-2.5
        text-base font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50
        shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer ${className}`}
    >
      {t('casino.review.next')}
      <kbd aria-hidden className="hidden [@media(hover:hover)]:inline-grid place-items-center h-6 px-1.5 rounded-md bg-black/15 border border-black/20">
        <CornerDownLeft size={14} strokeWidth={2.5} />
      </kbd>
    </button>
  )
}
