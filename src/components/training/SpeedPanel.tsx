import { Check, ChevronsLeft, ChevronsRight, CornerDownLeft, Flame, Layers, RotateCcw, Trophy, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { Card } from '../../types'
import { formatTC } from '../strategy-chart/chart-primitives'
import { ResultTrail } from './FlashPanel'
import { formatPercent } from './deviation-utils'
import { secondsPerCard, speedLabelKey, type MissHint, type NextStep, type SpeedBest } from './speed-drill-model'

/**
 * Everything of the Speed Drill that is not the felt: how far the round is,
 * what it was set to, the personal best at its speed, and — once answered —
 * the verdict, the pointer, the session so far and the way on.
 *
 * On a wide screen these stack in a side panel beside the felt, as in
 * Flashcards; below that the screen's grid places them around the felt.
 */

const SUIT_GLYPH: Record<string, string> = { Hearts: '♥', Diamonds: '♦', Clubs: '♣', Spades: '♠' }

/** Small caps heading of a panel block. */
function BlockLabel({ children }: { children: ReactNode }) {
  return <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 mb-1.5">{children}</span>
}

// ─── Progress ──────────────────────────────────────────

/** Props of {@link SpeedProgress}. */
export interface SpeedProgressProps {
  /** The card on the felt, from 0. */
  index: number
  /** Cards in the round. */
  total: number
  /** True once every card has been shown. */
  done: boolean
  /** Ends the round and the session; shown only while cards are running. */
  onStop?: () => void
  className?: string
}

/**
 * Card n of N and the cards left as a bar. On a phone one slim strip with
 * the stop button at its end; in the side panel two lines.
 *
 * The bar's width moves by one card's share each time a card is dealt (the
 * shared bar eases it over 300 ms) — a measure of the round, not of the
 * count, which is nowhere on screen while the cards run.
 */
export function SpeedProgress({ index, total, done, onStop, className = '' }: SpeedProgressProps) {
  const { t } = useTranslation()
  const shown = done ? total : index + 1
  const pct = total > 0 ? (shown / total) * 100 : 0
  return (
    <div
      className={`min-w-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-2.5 ${className}`}
      data-testid="speed-progress"
    >
      <span className="text-xs lg:text-sm font-semibold text-content/80 tabular-nums whitespace-nowrap">
        {done ? t('training.speed.allDealt', { total }) : t('training.speed.cardProgress', { n: index + 1, total })}
      </span>
      <div
        className="h-1.5 rounded-full bg-contrast/12 overflow-hidden lg:col-span-2 lg:row-start-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={shown}
        aria-label={t('training.speed.cardProgress', { n: shown, total })}
      >
        <div className="h-full rounded-full bg-gold-bright/90 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <span className="inline-flex items-center gap-3 lg:col-start-2 lg:row-start-1">
        {!done && (
          <span className="hidden lg:inline text-sm text-content/50 tabular-nums">{t('training.speed.toGo', { n: total - shown })}</span>
        )}
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="lg:hidden inline-flex items-center justify-center min-h-8 px-2.5 rounded-lg text-xs text-content/60 hover:text-content border border-contrast/12 cursor-pointer"
            data-testid="stop-drill-strip"
          >
            {t('training.speed.stop')}
          </button>
        )}
      </span>
    </div>
  )
}

// ─── The round's settings ──────────────────────────────

/** The round as it was set: speed (with its seconds per card) and cards. */
export function SpeedRoundInfo({ speedMs, cards, className = '' }: { speedMs: number; cards: number; className?: string }) {
  const { t, i18n } = useTranslation()
  const key = speedLabelKey(speedMs)
  return (
    <div className={className} data-testid="speed-round-info">
      <BlockLabel>{t('training.speed.thisRound')}</BlockLabel>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        <dt className="text-content/55">{t('training.speed.speed')}</dt>
        <dd className="text-right font-semibold text-content tabular-nums">
          {key ? t(key) : null}
          <span className="font-normal text-content/55"> · {t('training.speed.perCard', { s: secondsPerCard(speedMs, i18n.language) })}</span>
        </dd>
        <dt className="text-content/55">{t('training.speed.cards')}</dt>
        <dd className="text-right font-semibold text-content tabular-nums">{cards}</dd>
      </dl>
    </div>
  )
}

// ─── Personal best ─────────────────────────────────────

/** Props of {@link SpeedBestBlock}. */
export interface SpeedBestBlockProps {
  best: SpeedBest
  speedMs: number
  /** This round set it. */
  isNew?: boolean
  className?: string
}

/**
 * The personal best at this speed: the longest round counted exactly, and
 * how many rounds at this speed were exact. Derived from the recorded
 * sessions (`speedBest`), so it needs no store of its own.
 */
export function SpeedBestBlock({ best, speedMs, isNew = false, className = '' }: SpeedBestBlockProps) {
  const { t } = useTranslation()
  const key = speedLabelKey(speedMs)
  return (
    <div className={className} data-testid="speed-best">
      <BlockLabel>{t('training.speed.bestTitle', { speed: key ? t(key) : '' })}</BlockLabel>
      {best.bestCards === null ? (
        <p className="text-sm text-content/60">{t('training.speed.bestNone')}</p>
      ) : (
        <div className="flex items-center gap-3">
          <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 border ${isNew ? 'bg-gold/20 border-gold/60 text-gold-bright' : 'bg-gold/10 border-gold/25 text-gold'}`}>
            <Trophy size={17} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-extrabold text-content tabular-nums" data-testid="speed-best-cards">
                {t('training.speed.bestCards', { n: best.bestCards })}
              </span>
              <span className="text-xs text-content/55">{t('training.speed.bestCaption')}</span>
              {isNew && (
                <span className="px-2 py-0.5 rounded-full text-[0.6875rem] font-bold bg-gold text-on-gold" data-testid="speed-best-new">
                  {t('training.speed.bestNew')}
                </span>
              )}
            </p>
            <p className="text-xs text-content/50 tabular-nums">{t('training.speed.bestRounds', { exact: best.exact, rounds: best.rounds })}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The personal best in one line, for a phone, where the result has no room
 * for the panel's block: "Your best · Normal: 20 cards · 65 of 82 rounds exact".
 */
export function SpeedBestLine({ best, speedMs, className = '' }: { best: SpeedBest; speedMs: number; className?: string }) {
  const { t } = useTranslation()
  const key = speedLabelKey(speedMs)
  return (
    <p className={`text-xs text-content/55 tabular-nums ${className}`} data-testid="speed-best-line">
      <Trophy size={12} aria-hidden className="inline -mt-0.5 mr-1.5 text-gold" />
      {t('training.speed.bestTitle', { speed: key ? t(key) : '' })}:{' '}
      {best.bestCards === null ? t('training.speed.bestNone') : (
        <>
          <b className="font-semibold text-content/80">{t('training.speed.bestCards', { n: best.bestCards })}</b>
          {' · '}<span className="whitespace-nowrap">{t('training.speed.bestRounds', { exact: best.exact, rounds: best.rounds })}</span>
        </>
      )}
    </p>
  )
}

// ─── The Hi-Lo values ──────────────────────────────────

const LEGEND = [
  { cards: '2–6', value: '+1', tone: 'text-success' },
  { cards: '7–9', value: '0', tone: 'text-content/60' },
  { cards: '10–A', value: '−1', tone: 'text-error' },
] as const

/** The three Hi-Lo values in one line: the rule, never the count. */
export function HiLoLegend({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={className} data-testid="hilo-legend">
      <BlockLabel>{t('training.primer.title')}</BlockLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {LEGEND.map(g => (
          <span key={g.cards} className="flex items-baseline justify-center gap-1.5 rounded-lg bg-contrast/5 border border-contrast/10 py-1.5 text-sm tabular-nums">
            <span className="text-content/75">{g.cards}</span>
            <b className={`font-bold ${g.tone}`}>{g.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── The verdict ───────────────────────────────────────

/** Props of {@link SpeedVerdict}. */
export interface SpeedVerdictProps {
  correct: boolean
  /** The true running count. */
  count: number
  /** What was answered. */
  answer: number
  /** The session's rounds; below lg they ride on the verdict's line, where the session block is not shown. */
  results?: boolean[]
  /** This round set a new personal best; below lg the badge rides on the verdict's line. */
  isNewBest?: boolean
  className?: string
}

/**
 * Right or wrong, the true count, and the answer beside it with how far off
 * it was. Rises 8 px over 200 ms (Carbon's productive entrance), transform
 * only — as the Flashcards verdict does.
 */
export function SpeedVerdict({ correct, count, answer, results, isNewBest = false, className = '' }: SpeedVerdictProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const tone = correct ? 'text-success' : 'text-error'
  const diff = answer - count
  return (
    <motion.div
      className={`min-w-0 ${className}`}
      data-feedback={correct ? 'right' : 'wrong'}
      initial={reduced ? false : { y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.38, 0.9] }}
    >
      <div className="flex items-center gap-3">
        <span className={`grid place-items-center w-9 h-9 lg:w-11 lg:h-11 [@media(max-height:820px)]:lg:w-9 [@media(max-height:820px)]:lg:h-9 rounded-full border shrink-0
          ${correct ? 'bg-success/12 border-success/40' : 'bg-error/12 border-error/40'} ${tone}`}>
          {correct ? <Check size={22} strokeWidth={3} aria-hidden /> : <X size={22} strokeWidth={3} aria-hidden />}
        </span>
        <h2 className={`text-xl lg:text-2xl [@media(max-height:820px)]:lg:text-xl font-extrabold tabular-nums whitespace-nowrap ${tone}`} data-testid="speed-verdict">
          {correct ? t('training.speed.correctRc', { rc: formatTC(count) }) : t('training.speed.wrongRc', { rc: formatTC(count) })}
        </h2>
        {results && results.length > 0 && (
          <span
            className="lg:hidden ml-auto shrink-0 flex items-center gap-2 text-xs font-semibold text-content/60 tabular-nums"
            aria-label={t('training.speed.sitting')}
          >
            <SittingTrail results={results} unit={12} max={72} />
            {results.filter(Boolean).length}/{results.length}
          </span>
        )}
      </div>
      {isNewBest && (
        <p className="lg:hidden mt-1.5">
          <span className="px-2 py-0.5 rounded-full text-[0.6875rem] font-bold bg-gold text-on-gold" data-testid="speed-best-new-strip">
            {t('training.speed.bestNew')}
          </span>
        </p>
      )}
      {!correct && (
        <p className="mt-1.5 [@media(max-height:820px)]:lg:mt-1 text-sm text-content/75 tabular-nums">
          {t('training.speed.youSaid', { value: formatTC(answer) })}
          <span className="text-content/50"> · {diff > 0 ? t('training.speed.tooHigh', { n: diff }) : t('training.speed.tooLow', { n: -diff })}</span>
        </p>
      )}
    </motion.div>
  )
}

// ─── The pointer ───────────────────────────────────────

/** Props of {@link SpeedHint}. */
export interface SpeedHintProps {
  hint: MissHint
  /** The round's last card, for the last-card pointer. */
  lastCard: Card | null
  /** The last card's tag. */
  lastTag: number
  className?: string
}

/**
 * Where to look after a wrong answer — said as a direction, never as a
 * finding, because only the final number reached the drill (`missHint`).
 */
export function SpeedHint({ hint, lastCard, lastTag, className = '' }: SpeedHintProps) {
  const { t } = useTranslation()
  const card = lastCard ? `${lastCard.rank}${SUIT_GLYPH[lastCard.suit] ?? ''}` : ''
  const text = t(`training.speed.hint.${hint.kind}`, { card, tag: formatTC(lastTag), n: Math.abs(hint.diff) })
  return (
    <p className={`text-sm text-content/85 leading-relaxed [@media(max-height:820px)]:lg:leading-normal ${className}`} data-testid="speed-hint" data-hint={hint.kind}>
      {text}
    </p>
  )
}

// ─── The session so far ────────────────────────────────

/** Props of {@link SpeedSitting}. */
export interface SpeedSittingProps {
  /** Right or wrong, every round of the session so far. */
  results: boolean[]
  streak: number
  bestStreak: number
  className?: string
}

/** The session's rounds as segments, one per round, `unit` px each up to `max`: a first round is a dot, not a bar. */
function SittingTrail({ results, unit = 22, max = 180 }: { results: boolean[]; unit?: number; max?: number }) {
  return (
    <div className="shrink-0" style={{ width: Math.min(max, Math.max(1, results.length) * unit) }}>
      <ResultTrail total={results.length} results={results} index={null} />
    </div>
  )
}

/**
 * The session's rounds as the Flashcards trail draws a round's questions —
 * green exact, red off — with the streak, the best streak and the accuracy,
 * as three figures in one row.
 */
export function SpeedSitting({ results, streak, bestStreak, className = '' }: SpeedSittingProps) {
  const { t, i18n } = useTranslation()
  const correct = results.filter(Boolean).length
  const total = results.length
  const pct = total > 0 ? correct / total : 0
  return (
    <div className={`min-w-0 ${className}`} data-testid="speed-sitting">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50">{t('training.speed.sitting')}</span>
        {total > 0 && (
          <span title={t('training.common.correctOf', { n: correct, total, pct: Math.round(pct * 100) })}>
            <SittingTrail results={results} />
          </span>
        )}
      </div>
      {total === 0 ? (
        <p className="text-xs text-content/45" data-testid="speed-sitting-empty">{t('training.speed.sittingEmpty')}</p>
      ) : (
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-content/50">{t('training.common.streak')}</dt>
          <dd className={`inline-flex items-center gap-1 text-lg [@media(max-height:820px)]:lg:text-base font-bold tabular-nums ${streak >= 3 ? 'text-gold-bright' : 'text-content'}`}>
            <Flame size={15} aria-hidden className={streak >= 3 ? 'fill-gold/40' : 'text-content/40'} />
            {streak}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-content/50">{t('training.common.bestStreak')}</dt>
          <dd className="text-lg [@media(max-height:820px)]:lg:text-base font-bold tabular-nums text-gold">{bestStreak}</dd>
        </div>
        <div>
          <dt className="text-xs text-content/50">{t('training.common.accuracy')}</dt>
          <dd className="text-lg [@media(max-height:820px)]:lg:text-base font-bold tabular-nums text-content whitespace-nowrap" title={t('training.common.correctOf', { n: correct, total, pct: Math.round(pct * 100) })}>
            {correct}/{total} <span className="text-sm text-content/50 font-semibold">· {formatPercent(pct, i18n.language)}</span>
          </dd>
        </div>
      </dl>
      )}
    </div>
  )
}

// ─── The way on ────────────────────────────────────────

/** Props of {@link SpeedNext}. */
export interface SpeedNextProps {
  /** Another round, same settings. */
  onAgain: () => void
  /** The step up (`nextStep`), or null at the top of both scales. */
  step: NextStep
  onStep: () => void
  /** Back to the setup; ends the session. */
  onSettings: () => void
  className?: string
}

const STEP_TEST_ID = { faster: 'speed-faster', slower: 'speed-slower', moreCards: 'speed-more-cards' } as const
const STEP_LABEL = { faster: 'training.speed.faster', slower: 'training.speed.slower', moreCards: 'training.speed.moreCards' } as const

/**
 * Two clear ways on — the same round again (Enter), or the step `nextStep`
 * chose: faster (or more cards) after an exact round, slower after a miss —
 * and a quiet way back to the setup.
 */
export function SpeedNext({ onAgain, step, onStep, onSettings, className = '' }: SpeedNextProps) {
  const { t, i18n } = useTranslation()
  return (
    <div className={`flex flex-col gap-2 [@media(max-height:820px)]:lg:gap-1.5 ${className}`}>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onAgain}
          data-testid="try-again"
          className="lift-glow flex-[1.25] min-w-0 h-12 lg:h-14 [@media(max-height:820px)]:lg:h-12 short:h-11 rounded-xl inline-flex items-center justify-center gap-2
            text-base font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50 whitespace-nowrap
            shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer"
        >
          <RotateCcw size={17} aria-hidden className="shrink-0" />
          <span className="truncate">{t('training.common.tryAgain')}</span>
          {/* The key, where there is a keyboard and the button is wide enough to carry it. */}
          <kbd aria-hidden className="hidden max-lg:[@media(hover:hover)]:inline-grid min-[1600px]:[@media(hover:hover)]:inline-grid shrink-0 place-items-center h-6 px-1.5 rounded-md bg-black/15 border border-black/20">
            <CornerDownLeft size={14} strokeWidth={2.5} />
          </kbd>
        </button>
        {step && (
          <button
            type="button"
            onClick={onStep}
            data-testid={STEP_TEST_ID[step.kind]}
            className="flex-1 min-w-0 h-12 lg:h-14 [@media(max-height:820px)]:lg:h-12 short:h-11 rounded-xl inline-flex items-center justify-center gap-2 whitespace-nowrap
              text-base font-semibold text-content bg-contrast/10 hover:bg-contrast/15 border border-contrast/15 transition-colors duration-150 cursor-pointer"
          >
            {step.kind === 'faster' && <ChevronsRight size={18} aria-hidden className="shrink-0" />}
            {step.kind === 'slower' && <ChevronsLeft size={18} aria-hidden className="shrink-0" />}
            {step.kind === 'moreCards' && <Layers size={17} aria-hidden className="shrink-0" />}
            <span className="truncate">{t(STEP_LABEL[step.kind])}</span>
            <span className="shrink-0 text-xs font-medium text-content/50 tabular-nums lg:max-[1599px]:hidden max-lg:short:hidden">
              {step.kind === 'moreCards' ? step.cards : t('training.speed.secondsShort', { s: secondsPerCard(step.speedMs, i18n.language) })}
            </span>
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onSettings}
        data-testid="back-to-settings"
        className="self-center min-h-9 [@media(max-height:820px)]:lg:min-h-7 px-3 text-sm text-content/50 hover:text-content transition-colors duration-150 cursor-pointer"
      >
        {t('training.common.backToSettings')}
      </button>
    </div>
  )
}
