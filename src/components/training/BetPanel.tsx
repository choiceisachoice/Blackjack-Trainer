import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BET_SPREAD } from './bet-spread-math'
import { money, num, rampStepOfBet, rampStepOfTc, signed, type BetAnswer, type BetQuestion } from './bet-model'

/**
 * The parts of the Bet Spread screen beside the felt: the spot in words, the
 * bet ramp the drill teaches, and the bets already placed this round. The
 * round's progress is Flashcards' own (`FlashProgress`), so the two drills
 * count the same way.
 */

/** Small caps heading of a panel block. */
function BlockLabel({ children, aside }: { children: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 truncate">{children}</span>
      {aside && <span className="text-[0.6875rem] font-semibold text-content/40 tabular-nums shrink-0">{aside}</span>}
    </div>
  )
}

// ─── The spot ──────────────────────────────────────────

/**
 * The question in words, large: "True count +3", or "RC +6 · 2 decks" when
 * the true count is the learner's to work out — and the table it is asked at.
 */
export function BetSpot({ question: q, className = '' }: { question: BetQuestion; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={className} data-testid="bet-spot">
      <p className="text-[1.75rem] xl:text-[2rem] [@media(max-height:760px)]:text-2xl leading-tight font-extrabold text-content tracking-tight tabular-nums">
        {q.type === 'B'
          ? `${t('training.flash.trueCount')} ${signed(q.tc)}`
          : t('training.bet.spotRc', { rc: signed(q.rc), decks: num(q.remainingDecks) })}
      </p>
      <p className="mt-0.5 text-sm text-content/60 tabular-nums">
        {t('training.bet.tableMinimum')} <b className="font-semibold text-gold">{money(q.tableMin)}</b>
        <span className="text-content/40"> · {t('training.bet.oneUnit')}</span>
      </p>
    </div>
  )
}

// ─── The ramp ──────────────────────────────────────────

/** Props of {@link BetRamp}. */
export interface BetRampProps {
  question: BetQuestion
  /** The bet placed, once it is; null while the question is open. */
  placed: number | null
  className?: string
}

/** "TC ≤ +1" → "≤ +1": the column heads say the count only. */
const stepHead = (label: string) => label.replace(/^TC\s*/, '')

/**
 * The bet ramp as one row: a column per step of true count, the units and
 * the dollars at this table under each.
 *
 * While the question is open the cells are blank — the drill asks for the
 * ramp, so it does not print it — and when the true count is given its
 * column holds a question mark, as Flashcards marks the chart cell. Placed,
 * the cells fill left to right, 20 ms apart (a 150 ms colour change each, an
 * effect, so no overshoot), the right step lit gold and a wrong bet that is a
 * step of the ramp ringed red.
 */
export function BetRamp({ question: q, placed, className = '' }: BetRampProps) {
  const { t } = useTranslation()
  const revealed = placed !== null
  const right = rampStepOfTc(q.tc)
  const chosen = revealed ? rampStepOfBet(placed, q.tableMin) : -1
  const asked = !revealed && q.type === 'B' ? right : -1
  return (
    <div className={className} data-testid="bet-ramp" data-revealed={String(revealed)}>
      <BlockLabel aside={`× ${money(q.tableMin)}`}>{t('training.bet.reference')}</BlockLabel>
      <div className="grid grid-cols-5 gap-[3px]">
        {BET_SPREAD.map((step, i) => (
          <span key={`h${i}`} className={`text-center text-[0.6875rem] font-semibold tabular-nums whitespace-nowrap ${(revealed && i === right) || i === asked ? 'text-gold-bright' : 'text-content/45'}`}>
            {stepHead(step.label)}
          </span>
        ))}
        {BET_SPREAD.map((step, i) => {
          const lit = revealed && i === right
          const miss = revealed && i === chosen && chosen !== right
          return (
            <span
              key={`c${i}`}
              data-step={i}
              data-lit={lit ? 'true' : undefined}
              data-chosen={miss ? 'true' : undefined}
              className={`relative flex flex-col items-center justify-center h-11 [@media(max-height:760px)]:h-10 rounded-[6px] tabular-nums
                transition-[background-color,color,opacity,box-shadow] duration-150
                ${lit ? 'bg-gold text-on-gold shadow-[0_0_0_2px_#fff,0_4px_12px_rgba(0,0,0,0.5)] z-10' : ''}
                ${revealed && !lit ? 'bg-contrast/10 text-content/75' : ''}
                ${miss ? 'shadow-[inset_0_0_0_2px_var(--color-error)]' : ''}
                ${!revealed && i === asked ? 'border border-dashed border-gold-bright/80 text-gold-bright bg-gold/10' : ''}
                ${!revealed && i !== asked ? 'bg-contrast/7' : ''}`}
              style={{ transitionDelay: revealed ? `${i * 20}ms` : '0ms' }}
            >
              {revealed ? (
                <>
                  <b className="text-sm font-extrabold leading-none">{step.multiplier}×</b>
                  <span className={`text-[0.6875rem] font-semibold leading-tight ${lit ? '' : 'text-content/55'}`}>{money(step.multiplier * q.tableMin)}</span>
                </>
              ) : i === asked ? <b className="text-sm">?</b> : null}
            </span>
          )
        })}
      </div>
      <p className="mt-1.5 text-[0.6875rem] text-content/45 leading-snug">
        {revealed ? t('training.bet.betEquals') : t('training.bet.rampHint')}
      </p>
    </div>
  )
}

// ─── Previous bets ─────────────────────────────────────

/**
 * The bets already placed this round, newest first: right or wrong, the
 * count and the table, the bet struck through where it was wrong, and the
 * right one. Clipped with a fade rather than scrolled, as in Flashcards.
 */
export function BetHistory({ answers, className = '' }: { answers: readonly BetAnswer[]; className?: string }) {
  const { t } = useTranslation()
  const newestFirst = [...answers].reverse()
  return (
    <div className={`min-h-0 flex flex-col ${className}`} data-testid="bet-history">
      <span className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 mb-1.5">{t('training.bet.previous')}</span>
      {newestFirst.length === 0 ? (
        <p className="text-xs text-content/40">{t('training.flash.previousEmpty')}</p>
      ) : (
        <ul
          className="min-h-0 overflow-hidden divide-y divide-contrast/8"
          style={{ maskImage: 'linear-gradient(to bottom, black 75%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, black 75%, transparent)' }}
        >
          {newestFirst.map((a, i) => (
            <li key={answers.length - i} className="flex items-center gap-2.5 py-2 text-sm">
              <span className={`grid place-items-center w-5 h-5 rounded-full shrink-0 ${a.correct ? 'bg-success/15 text-success' : 'bg-error/15 text-error'}`}>
                {a.correct ? <Check size={12} strokeWidth={3.5} aria-hidden /> : <X size={12} strokeWidth={3.5} aria-hidden />}
              </span>
              <span className="min-w-0 truncate font-semibold text-content/85 tabular-nums">
                {t('training.bet.historySpot', { tc: signed(a.question.tc), min: money(a.question.tableMin) })}
              </span>
              <span className="ml-auto shrink-0 inline-flex items-baseline gap-1.5 text-xs tabular-nums">
                {a.bet !== a.question.correctBet && <s className="text-error/75">{money(a.bet)}</s>}
                {a.bet === a.question.correctBet && !a.correct && a.tcAnswer !== null && (
                  <s className="text-error/75">{'TC'} {signed(a.tcAnswer)}</s>
                )}
                <span className="font-semibold text-content/75">{money(a.question.correctBet)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Keys ──────────────────────────────────────────────

/** The keyboard path in one quiet line, where there is a keyboard. */
export function BetKeys({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <p className={`hidden [@media(hover:hover)_and_(pointer:fine)]:block text-xs text-content/45 ${className}`} data-testid="bet-keys">
      {t('training.bet.keysHint')}
    </p>
  )
}
