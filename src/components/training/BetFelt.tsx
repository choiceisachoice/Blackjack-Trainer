import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Trans, useTranslation } from 'react-i18next'
import { Check, CornerDownLeft, Minus, Plus, RotateCcw, Undo2, X } from 'lucide-react'
import { Chip, ChipStack } from '../casino-session/Chip'
import { DiscardTray, ShoeHousing } from '../table/ShoeProgress'
import { SpeedFelt } from './SpeedFelt'
import { FlashNext } from './FlashPanel'
import { BET_CHIPS, BET_CAP, betReason, money, num, signed, type BetAnswer, type BetQuestion } from './bet-model'

/**
 * The Bet Spread question as a table: the shoe and the discard tray, the
 * count the question gives, the table minimum printed on the cloth, the
 * betting circle and a rack of chips to build the bet with.
 *
 * Once the bet is placed the same felt answers: the bet stays in its circle,
 * the right bet is put down beside it when it differs, and one line under
 * them says why — true count, units on the ramp, times the minimum.
 *
 * ## Motion
 *
 * Productive throughout: a question every few seconds, chips clicked dozens
 * of times a round. A chip placed simply joins the stack (its sound says it
 * landed); the right bet rises into its circle with the casino table's own
 * stack entrance (`ChipStack`, 280 ms); the verdict rises 8 px over 200 ms
 * (Carbon's productive entrance, transform only, as in Flashcards); the line
 * round the felt is a 150 ms opacity change. With reduced motion nothing
 * travels — everything is simply in its place.
 */

/** Props of {@link BetFelt}. */
export interface BetFeltProps {
  question: BetQuestion
  /** The bet being built, in dollars. */
  bet: number
  /** Chips placed so far, in order (for undo). */
  placed: readonly number[]
  onChip: (value: number) => void
  onUndo: () => void
  onClear: () => void
  onPlace: () => void
  /** The true count entered (type C). */
  tcAnswer: number
  onTcAnswer: (tc: number) => void
  /** The answer, once the bet is placed; null while the question is open. */
  answer: BetAnswer | null
  onNext: () => void
  /** The last question of the round: Next leads to the results. */
  last: boolean
}

/** A figure the question gives, set on the cloth in a dark plaque: the first thing to read. */
function Plaque({ label, value, testId, tone = 'gold' }: { label: string; value: string; testId?: string; tone?: 'gold' | 'plain' | 'success' }) {
  const ink = tone === 'gold' ? 'text-gold-bright' : tone === 'success' ? 'text-success' : 'text-content'
  return (
    <div className={`flex flex-col items-start min-w-0 rounded-xl sm:rounded-2xl bg-black/45 border px-2.5 py-1.5 sm:px-4 sm:py-2 short:px-2.5 short:py-1
      shadow-[0_8px_24px_-10px_rgba(0,0,0,0.8)] ${tone === 'success' ? 'border-success/45' : 'border-gold/45'}`}>
      <span className="text-[0.5625rem] sm:text-[0.6875rem] font-bold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-gold-bright/80 whitespace-nowrap">{label}</span>
      <span className={`text-2xl sm:text-3xl lg:text-4xl short:text-xl font-extrabold leading-none tabular-nums whitespace-nowrap ${ink}`} data-testid={testId}>
        {value}
      </span>
    </div>
  )
}

/**
 * A betting circle printed on the felt, with the chips in it and the amount
 * under it. `ring` colours the circle once the answer is in.
 */
function BetCircle({ amount, caption, ring = 'plain', testId, children }: {
  amount: number
  caption: ReactNode
  ring?: 'plain' | 'right' | 'wrong'
  testId?: string
  children?: ReactNode
}) {
  const border = ring === 'right' ? 'border-success/80' : ring === 'wrong' ? 'border-error/80' : 'border-gold-bright/45'
  return (
    <div className="flex flex-col items-center gap-1 min-w-0" data-testid={testId}>
      <div
        className={`relative grid place-items-end justify-center rounded-full border-2 ${border}
          w-[6.5rem] h-[6.5rem] compact:w-[5.5rem] compact:h-[5.5rem] sm:w-32 sm:h-32 short:w-[5.25rem] short:h-[5.25rem]
          [@media(max-height:820px)]:lg:w-28 [@media(max-height:820px)]:lg:h-28 pb-3 short:pb-2
          bg-[radial-gradient(circle,rgba(0,0,0,0.18)_0%,rgba(0,0,0,0)_70%)] transition-colors duration-150`}
      >
        {/* The stack stands on the circle's lower half, as on a table seen from the seat. */}
        <div className="[zoom:0.85] compact:[zoom:0.72] sm:[zoom:1] short:[zoom:0.72]">
          <ChipStack amount={amount} size={52} bare />
        </div>
        {children}
      </div>
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-gold-bright/70 whitespace-nowrap">{caption}</span>
    </div>
  )
}

/** The type-C question on the felt: the true count, typed or stepped in halves. */
function TcEntry({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation()
  const step = `grid place-items-center shrink-0 w-10 h-10 sm:w-11 sm:h-11 short:w-9 short:h-9 rounded-full
    bg-black/35 border border-white/15 text-content hover:bg-black/50 hover:border-gold/50 transition-colors duration-150 cursor-pointer`
  return (
    <div className="flex flex-col items-center gap-1.5 short:gap-1" data-testid="tc-entry">
      <p className="text-sm sm:text-base short:text-xs font-semibold text-content/90 text-center">{t('training.bet.whatIsTc')}</p>
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => onChange(value - 0.5)} aria-label={t('training.bet.decreaseTc')} className={step}>
          <Minus size={18} aria-hidden />
        </button>
        <input
          type="number"
          step="0.5"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(Number(e.target.value) || 0)}
          aria-label={t('training.bet.whatIsTc')}
          data-testid="tc-input"
          className="w-20 h-11 short:h-9 rounded-xl text-center text-xl short:text-lg font-extrabold tabular-nums text-content
            bg-black/40 border-2 border-gold/55 hover:border-gold/80 focus:border-gold-bright focus:outline-none
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => onChange(value + 0.5)} aria-label={t('training.bet.increaseTc')} className={step}>
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}

/** The chip rack, the two corrections and the button that places the bet. */
function Rack({ bet, placed, onChip, onUndo, onClear, onPlace }: Pick<BetFeltProps, 'bet' | 'placed' | 'onChip' | 'onUndo' | 'onClear' | 'onPlace'>) {
  const { t } = useTranslation()
  const cap = BET_CAP
  const icon = `grid place-items-center shrink-0 w-10 h-10 sm:w-11 sm:h-11 short:w-9 short:h-9 rounded-xl border border-white/12 bg-black/30
    text-content/70 hover:text-content hover:border-gold/45 transition-colors duration-150 cursor-pointer
    disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-content/70 disabled:hover:border-white/12`
  return (
    <div className="flex flex-col sm:flex-row short:flex-col items-center justify-center gap-2.5 sm:gap-4 short:gap-2 min-w-0" data-testid="bet-rack">
      {/* The tray: chips lie in a recess along the table's edge, as at the casino table. */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 rounded-2xl bg-black/35 border border-white/10 px-2 py-1.5 sm:px-3 sm:py-2
        shadow-[inset_0_3px_10px_rgba(0,0,0,0.55)]" role="group" aria-label={t('casino.table.placeYourBet')}>
        {BET_CHIPS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onChip(c)}
            disabled={bet + c > cap}
            data-testid={`chip-${c}`}
            title={`${money(c)} · ${i + 1}`}
            className="relative rounded-full cursor-pointer shadow-[0_3px_0_rgba(0,0,0,.5),0_5px_10px_rgba(0,0,0,.4)]
              transition-[transform,filter,opacity] duration-150 ease-out
              hover:-translate-y-1 hover:brightness-110 active:translate-y-0 active:brightness-95 active:scale-[0.96]
              disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
          >
            <span className="block [zoom:0.82] sm:[zoom:1] short:[zoom:0.74]">
              <Chip value={c} size={54} label={money(c)} />
            </span>
            <span className="sr-only">+{money(c)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" onClick={onUndo} disabled={placed.length === 0} aria-label={t('training.bet.undo')} title={`${t('training.bet.undo')} · ⌫`} className={icon} data-testid="undo-chip">
          <Undo2 size={17} aria-hidden />
        </button>
        <button type="button" onClick={onClear} disabled={placed.length === 0} aria-label={t('casino.table.clear')} title={t('casino.table.clear')} className={icon} data-testid="clear-bet">
          <RotateCcw size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onPlace}
          disabled={bet <= 0}
          data-testid="place-bet"
          className="lift-glow min-w-[9.5rem] h-11 sm:h-12 short:h-10 px-5 rounded-xl inline-flex items-center justify-center gap-2.5 whitespace-nowrap
            text-base font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50
            shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer
            disabled:from-contrast/15 disabled:to-contrast/10 disabled:text-content/45 disabled:border-contrast/15 disabled:shadow-none disabled:cursor-not-allowed"
        >
          <span className="tabular-nums">{bet > 0 ? t('training.bet.placeBet', { amount: money(bet) }) : t('training.bet.placeEmpty')}</span>
          <kbd aria-hidden className="hidden [@media(hover:hover)]:inline-grid place-items-center h-6 px-1.5 rounded-md bg-black/15 border border-black/20">
            <CornerDownLeft size={14} strokeWidth={2.5} />
          </kbd>
        </button>
      </div>
    </div>
  )
}

/** Right or wrong, and the reason in one line: TC → units on the ramp × the minimum. */
function Verdict({ answer, onNext, last }: { answer: BetAnswer; onNext: () => void; last: boolean }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const reason = betReason(answer.question)
  const tone = answer.correct ? 'text-success' : 'text-error'
  return (
    <motion.div
      className="w-full max-w-3xl mx-auto flex flex-col sm:flex-row short:flex-col items-stretch sm:items-center short:items-stretch gap-3 sm:gap-6 short:gap-2 min-w-0"
      data-feedback={answer.correct ? 'right' : 'wrong'}
      initial={reduced ? false : { y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.38, 0.9] }}
    >
      <div className="flex-1 min-w-0 flex items-start gap-3 rounded-2xl bg-black/35 border border-white/10 px-3 py-2.5 sm:px-4 short:py-1.5">
        <span className={`grid place-items-center w-9 h-9 short:w-7 short:h-7 rounded-full border shrink-0
          ${answer.correct ? 'bg-success/12 border-success/40' : 'bg-error/12 border-error/40'} ${tone}`}>
          {answer.correct ? <Check size={19} strokeWidth={3} aria-hidden /> : <X size={19} strokeWidth={3} aria-hidden />}
        </span>
        <div className="min-w-0">
          <h3 className={`text-lg sm:text-xl short:text-base font-extrabold leading-tight ${tone}`} data-testid="feedback-result">
            {answer.correct ? t('training.common.correctBang') : t('training.common.wrongBang')}
          </h3>
          <p className="text-sm short:text-xs text-content/85 tabular-nums leading-snug" data-testid="feedback-explanation">
            <Trans
              i18nKey={reason.key}
              values={reason.values}
              count={reason.values.count}
              components={{ h: <span className="text-gold-bright font-bold" /> }}
            />
          </p>
        </div>
      </div>
      <FlashNext onNext={onNext} last={last} className="sm:w-auto sm:min-w-[11rem] sm:px-6 short:w-full shrink-0" />
    </motion.div>
  )
}

/**
 * What became of the type-C count: right, or what was said against what it
 * was and how it is worked out.
 */
function TcResult({ answer }: { answer: BetAnswer }) {
  const { t } = useTranslation()
  const q = answer.question
  const right = answer.tcAnswer === q.tc
  return (
    <p className={`text-center text-sm short:text-xs tabular-nums leading-snug rounded-2xl bg-black/35 border px-4 py-1.5 text-content/85 ${right ? 'border-success/35' : 'border-error/35'}`} data-testid="tc-result">
      {right ? (
        <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={3} className="text-success" aria-hidden />{t('training.bet.tcRight', { tc: signed(q.tc) })}</span>
      ) : (
        <Trans
          i18nKey="training.bet.tcWorked"
          values={{ said: signed(answer.tcAnswer ?? 0), right: signed(q.tc), rc: signed(q.rc), decks: num(q.remainingDecks) }}
          components={{ h: <span className="text-gold-bright font-bold" /> }}
        />
      )}
    </p>
  )
}

/** The felt of the Bet Spread drill, for the open question and its answer. */
export function BetFelt(props: BetFeltProps) {
  const { question: q, bet, tcAnswer, onTcAnswer, answer, onNext, last } = props
  const { t } = useTranslation()
  const answered = answer !== null
  const fromRc = q.type !== 'B'
  const totalCards = 312
  const inShoe = Math.round(q.shoeDecks * 52)
  // The cut card stays inside the cards that are left: at 1 deck the shoe is
  // past a 75% cut, and a marker drawn outside the block reads as a fault.
  const penetration = q.shoeDecks <= 1.5 ? 1 - (q.shoeDecks * 0.5) / 6 : 0.75

  return (
    <SpeedFelt verdict={answered ? answer.correct : null} testId="bet-felt">
      <div
        className="relative flex-1 min-h-0 grid gap-x-3 sm:gap-x-6 gap-y-2 sm:gap-y-3 [@media(max-height:820px)]:lg:gap-y-2
          grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto]
          [grid-template-areas:'discard_._shoe'_'count_count_count'_'entry_entry_entry'_'bet_bet_bet'_'rack_rack_rack']
          sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-rows-[auto_auto_minmax(0,1fr)_auto]
          sm:[grid-template-areas:'discard_count_shoe'_'entry_entry_entry'_'bet_bet_bet'_'rack_rack_rack']
          lg:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]
          lg:[grid-template-areas:'discard_count_entry_shoe'_'bet_bet_bet_bet'_'rack_rack_rack_rack']
          max-lg:short:gap-y-1.5 max-lg:short:gap-x-4 max-lg:short:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] max-lg:short:grid-rows-[auto_minmax(0,1fr)_auto]
          max-lg:short:[grid-template-areas:'count_bet'_'entry_bet'_'rack_bet']"
        data-question-type={q.type}
      >
        {/* The rail: discard tray left, shoe right, as at the casino table. On a
            phone their captions would be six-pixel type, so they go. */}
        <div className={`${answered ? 'compact:hidden' : ''} [grid-area:discard] self-start justify-self-start [zoom:0.5] sm:[zoom:0.7] lg:[zoom:0.8] [@media(max-height:820px)]:lg:[zoom:0.7] max-sm:[&_span]:hidden max-lg:short:hidden`} aria-hidden>
          <DiscardTray cardCount={totalCards - inShoe} totalCards={totalCards} pxPerCard={0.3} width={72} />
        </div>
        <div className={`${answered ? 'compact:hidden' : ''} [grid-area:shoe] self-start justify-self-end [zoom:0.5] sm:[zoom:0.7] lg:[zoom:0.8] [@media(max-height:820px)]:lg:[zoom:0.7] max-sm:[&_span]:hidden max-lg:short:hidden`} aria-hidden>
          <ShoeHousing cardCount={inShoe} totalCards={totalCards} penetration={penetration} />
        </div>

        {/* What the question gives. */}
        <div className="[grid-area:count] self-start flex flex-row flex-wrap items-start justify-center gap-2 sm:gap-3 short:gap-1.5 min-w-0" data-testid="bet-count">
          {fromRc ? (
            <>
              <Plaque label={t('training.bet.runningCount')} value={signed(q.rc)} testId="running-count" />
              <Plaque label={t('training.bet.remainingDecks')} value={`~${num(q.remainingDecks)}`} testId="remaining-decks" tone="plain" />
              {answered && <Plaque label={t('training.flash.trueCount')} value={signed(q.tc)} testId="tc-revealed" tone="success" />}
            </>
          ) : (
            <Plaque label={t('training.flash.trueCount')} value={signed(q.tc)} testId="true-count" />
          )}
        </div>

        {/* The type-C count, asked on the felt; answered, what became of it. */}
        {q.type === 'C' && (
          <div className="[grid-area:entry] self-center lg:self-start justify-self-center min-w-0 lg:max-w-[19rem]">
            {answered ? <TcResult answer={answer} /> : <TcEntry value={tcAnswer} onChange={onTcAnswer} />}
          </div>
        )}

        {/* The betting area: the table minimum printed on the cloth, the circle. */}
        <div className="[grid-area:bet] min-h-0 flex flex-col items-center justify-center gap-2 short:gap-1">
          <p className={`${answered ? 'compact:hidden' : ''} flex items-baseline gap-2 text-gold-bright/80 whitespace-nowrap`}>
            <span className="text-[0.6875rem] sm:text-xs font-bold uppercase tracking-[0.22em]">{t('training.bet.tableMinimum')}</span>
            <span className="text-xl sm:text-2xl short:text-lg font-extrabold tabular-nums text-gold-bright" data-testid="table-min">{money(q.tableMin)}</span>
          </p>
          <div className="flex items-end justify-center gap-6 sm:gap-12 short:gap-4">
            <BetCircle
              amount={answered ? answer.bet : bet}
              ring={answered ? (answer.correct ? 'right' : 'wrong') : 'plain'}
              testId="your-bet"
              caption={
                answered || bet > 0
                  ? <><span className="text-content/70">{t('training.bet.yourBet')}</span> <b className={`text-sm tabular-nums tracking-normal ${answered ? (answer.correct ? 'text-success' : 'text-error') : 'text-content'}`}>{money(answered ? answer.bet : bet)}</b></>
                  : <span className="text-content/55">{t('training.bet.chipsBelow')}</span>
              }
            />
            {answered && !answer.correct && (
              <BetCircle
                amount={q.correctBet}
                ring="right"
                testId="right-bet"
                caption={<><span className="text-content/70">{t('training.bet.rightBet')}</span> <b className="text-sm tabular-nums tracking-normal text-success">{money(q.correctBet)}</b></>}
              />
            )}
          </div>
        </div>

        <div className="[grid-area:rack] self-end min-w-0">
          {answered
            ? <Verdict answer={answer} onNext={onNext} last={last} />
            : <Rack {...props} />}
        </div>
      </div>
    </SpeedFelt>
  )
}
