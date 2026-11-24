import { Check, Flame, Timer, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { activeLocale } from '../../i18n'
import { ResultTrail } from './FlashPanel'
import { formatPercent } from './deviation-utils'
import { formatDecks, signedError, tcSkew } from './deck-estimation-model'

/**
 * Everything of Deck Estimation that is not the tray: the round so far, the
 * question, the verdict, the session's figures and the answers already given.
 *
 * As in Flashcards and the Speed Drill these stack in a side panel on a wide
 * screen; below that the screen's grid places them around the felt.
 */

/** One answered round. */
export interface DeckAnswer {
  /** Decks that were left, exactly. */
  actual: number
  /** The estimate; null when the clock ran out. */
  estimated: number | null
  correct: boolean
}

/** Small caps heading of a panel block. */
function BlockLabel({ children }: { children: string }) {
  return <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 mb-1.5">{children}</span>
}

// ─── Progress ──────────────────────────────────────────

/** Props of {@link DeckProgress}. */
export interface DeckProgressProps {
  /** The current round, from 1. */
  round: number
  total: number
  results: readonly boolean[]
  streak: number
  /** Mean error in decks, or null before the first answer. Shown on the strip only. */
  avgError: number | null
  className?: string
}

/**
 * Round n of N, one segment per round (green right, red wrong, gold the one
 * being asked) and the streak. On a phone one strip that also carries the
 * accuracy and the mean error, which the panel shows in its own block.
 */
export function DeckProgress({ round, total, results, streak, avgError, className = '' }: DeckProgressProps) {
  const { t } = useTranslation()
  const locale = activeLocale()
  const correct = results.filter(Boolean).length
  const hot = streak >= 3
  return (
    <div
      className={`min-w-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-y-2.5 ${className}`}
      data-testid="deck-progress"
    >
      <span className="text-xs lg:text-sm font-semibold text-content/80 tabular-nums whitespace-nowrap">
        {t('training.deck.round', { n: round, total })}
      </span>
      <ResultTrail total={total} results={results} index={round - 1} className="lg:col-span-2 lg:row-start-2" />
      <span className="inline-flex items-center gap-3 text-xs lg:text-sm tabular-nums lg:col-start-2 lg:row-start-1">
        {results.length > 0 && (
          <span className="lg:hidden font-semibold text-content/75 whitespace-nowrap">
            {formatPercent(correct / results.length, locale)}
            {avgError !== null && <span className="text-content/50">{` · ±${formatDecks(avgError, locale, true)}`}</span>}
          </span>
        )}
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

// ─── The question ──────────────────────────────────────

/** The question, with the Quick Fire clock beside it when there is one. */
export function DeckAsk({ seconds, className = '', style }: { seconds: number | null; className?: string; style?: CSSProperties }) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center justify-center lg:justify-between gap-3 ${className}`} style={style}>
      <p className="text-base lg:text-xl short:text-sm font-bold text-content/90 text-center lg:text-left leading-snug">{t('training.deck.howMany')}</p>
      {seconds !== null && (
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 h-9 short:h-8 px-3 rounded-full border text-lg font-extrabold tabular-nums
            ${seconds <= 1 ? 'text-error border-error/50 bg-error/10' : 'text-gold-bright border-gold/40 bg-gold/10'}`}
        >
          <Timer size={16} aria-hidden />
          <span data-testid="qf-timer">{seconds}</span>
        </span>
      )}
    </div>
  )
}

// ─── The session's figures ─────────────────────────────

/** Accuracy, mean error in decks and the best streak, as three figures in a row. */
export function DeckStats({ results, avgError, bestStreak, className = '' }: {
  results: readonly boolean[]
  avgError: number | null
  bestStreak: number
  className?: string
}) {
  const { t } = useTranslation()
  const locale = activeLocale()
  const correct = results.filter(Boolean).length
  const total = results.length
  return (
    <dl className={`grid grid-cols-3 gap-3 ${className}`} data-testid="deck-stats">
      <div className="min-w-0">
        <dt className="text-xs text-content/50 truncate">{t('training.common.accuracy')}</dt>
        <dd className="text-lg [@media(max-height:820px)]:lg:text-base font-bold tabular-nums text-content whitespace-nowrap">
          {total === 0 ? '–' : formatPercent(correct / total, locale)}
          {total > 0 && <span className="text-sm text-content/50 font-semibold"> · {correct}/{total}</span>}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-content/50 truncate">{t('training.deck.avgErrorTitle')}</dt>
        <dd
          className="text-lg [@media(max-height:820px)]:lg:text-base font-bold tabular-nums text-content whitespace-nowrap"
          title={avgError === null ? undefined : t('training.deck.avgErrorValue', { v: formatDecks(avgError, locale, true) })}
          data-testid="panel-avg-error"
        >
          {avgError === null ? '–' : `±${formatDecks(avgError, locale, true)}`}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-content/50 truncate">{t('training.common.bestStreak')}</dt>
        <dd className="text-lg [@media(max-height:820px)]:lg:text-base font-bold tabular-nums text-gold">{bestStreak}</dd>
      </div>
    </dl>
  )
}

// ─── Previous answers ──────────────────────────────────

/** A signed difference in decks: "+0.5", "−2.2". */
function signedDecks(n: number, locale: string): string {
  const v = formatDecks(Math.abs(n), locale, true)
  return n > 0 ? `+${v}` : n < 0 ? `−${v}` : `±${v}`
}

/**
 * The answers so far, newest first: right or wrong, what was left, what was
 * said and the signed difference — so a learner who always guesses low can
 * see it in the column of minus signs.
 */
export function DeckHistory({ answers, className = '' }: { answers: readonly DeckAnswer[]; className?: string }) {
  const { t } = useTranslation()
  const locale = activeLocale()
  const newestFirst = [...answers].reverse()
  return (
    <div className={`min-h-0 flex flex-col ${className}`} data-testid="deck-history">
      <BlockLabel>{t('training.deck.previous')}</BlockLabel>
      {newestFirst.length === 0 ? (
        <p className="text-xs text-content/40">{t('training.deck.previousEmpty')}</p>
      ) : (
        <ul
          className="min-h-0 overflow-hidden divide-y divide-contrast/8"
          style={{ maskImage: 'linear-gradient(to bottom, black 75%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 75%, transparent)' }}
        >
          {newestFirst.map((a, i) => (
            <li key={answers.length - i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2.5 py-1.5 text-sm tabular-nums">
              <span className={`grid place-items-center w-5 h-5 rounded-full shrink-0 ${a.correct ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                {a.correct ? <Check size={12} strokeWidth={3.5} aria-hidden /> : <X size={12} strokeWidth={3.5} aria-hidden />}
              </span>
              <span className="truncate font-semibold text-content/85">{t('training.deck.markTrue', { v: formatDecks(a.actual, locale, true) })}</span>
              <span className="truncate text-content/60">{t('training.deck.markYou', { v: a.estimated === null ? '–' : formatDecks(a.estimated, locale) })}</span>
              <span className={`text-xs font-bold ${a.correct ? 'text-success/85' : 'text-error/85'}`}>
                {a.estimated === null ? '' : signedDecks(signedError(a.estimated, a.actual), locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── The verdict ───────────────────────────────────────

/** Props of {@link DeckVerdict}. */
export interface DeckVerdictProps {
  /** Decks that were left. */
  actual: number
  /** The estimate; null when the clock ran out. */
  guess: number | null
  correct: boolean
  className?: string
}

/**
 * Right, close enough, wrong or out of time; what was left and what was said;
 * and what that estimate would do to a true count. The drill keeps no running
 * count, so the last line says it as a share — every true count divided by the
 * guess is off by the same factor (`tcSkew`).
 *
 * Rises 8 px over 200 ms, transform only, as the other drills' verdicts do.
 */
export function DeckVerdict({ actual, guess, correct, className = '' }: DeckVerdictProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const locale = activeLocale()
  const tone = correct ? 'text-success' : 'text-error'
  const error = guess === null ? actual : Math.abs(guess - actual)
  const closeEnough = correct && guess !== null && error > 0.01
  const skew = guess === null ? null : tcSkew(guess, actual)
  const title = correct
    ? (closeEnough ? t('training.deck.closeEnough') : t('training.common.correctBang'))
    : (guess === null ? t('training.deck.timesUp') : t('training.common.wrongBang'))
  return (
    <motion.div
      className={`min-w-0 ${className}`}
      data-feedback={correct ? 'right' : 'wrong'}
      initial={reduced ? false : { y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.38, 0.9] }}
    >
      <div className="flex items-center gap-3">
        <span className={`grid place-items-center w-9 h-9 lg:w-10 lg:h-10 short:w-8 short:h-8 rounded-full border shrink-0
          ${correct ? 'bg-success/12 border-success/40' : 'bg-error/12 border-error/40'} ${tone}`}>
          {correct ? <Check size={20} strokeWidth={3} aria-hidden /> : <X size={20} strokeWidth={3} aria-hidden />}
        </span>
        <h3 className={`text-xl lg:text-2xl short:text-lg font-extrabold ${tone}`} data-testid="feedback-result">{title}</h3>
      </div>
      <p className="mt-2 short:mt-1 text-sm text-content/85 tabular-nums" data-testid="feedback-explanation">
        <b className="font-semibold text-content">{t('training.deck.remaining', { n: formatDecks(actual, locale, true) })}</b>
        {guess !== null && <span className="text-content/70 whitespace-nowrap">{t('training.deck.youSaid', { v: formatDecks(guess, locale) })}</span>}
      </p>
      {skew && (
        <p className="mt-1.5 short:mt-1 text-sm short:text-xs text-content/70 leading-snug" data-testid="tc-line">
          {error > 0.01 && (
            <span className={`font-semibold whitespace-nowrap ${correct ? 'text-success/90' : 'text-error/90'}`}>
              {t('training.deck.offBy', { v: formatDecks(error, locale, true) })}{' → '}
            </span>
          )}
          {skew.kind === 'exact'
            ? t('training.deck.tcExact')
            : t(skew.kind === 'high' ? 'training.deck.tcHigh' : 'training.deck.tcLow', {
              pct: formatPercent(skew.fraction, locale),
              guess: formatDecks(guess ?? 0, locale),
              actual: formatDecks(actual, locale, true),
            })}
        </p>
      )}
    </motion.div>
  )
}
