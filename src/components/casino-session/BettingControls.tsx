import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { soundEngine } from '../../services/sound-engine'
import { chipFace, formatDollar, getChipDenominations } from './helpers'

interface BettingControlsProps {
  currentBet: number
  minBet: number
  maxBet: number
  bankroll: number
  onBetChange: (newBet: number) => void
  onConfirm: () => void
}

/**
 * The bet for the next hand: a typed amount, chips that add to it, and Deal.
 *
 * The amount is typeable because a bet spread is the drill — $20, $40, $80,
 * $160 as the count climbs — and with chips alone $160 took four clicks. What
 * is typed is a draft, clamped to the table limits and the bankroll only when
 * the field is left; a draft that is already a legal bet is passed on at once,
 * so Deal and the Enter shortcut both see it.
 */
export function BettingControls({ currentBet, minBet, maxBet, bankroll, onBetChange, onConfirm }: BettingControlsProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  const cap = Math.min(maxBet, bankroll)
  const legal = (n: number) => !Number.isNaN(n) && n >= minBet && n <= cap
  const commit = (raw: string) => {
    const n = parseInt(raw, 10)
    onBetChange(Number.isNaN(n) ? 0 : Math.min(Math.max(n, minBet), cap))
    setDraft(null)
  }
  return (
    // Three rows, never four: the prompt, the range and the bet placed share
    // one line, so placing a bet does not add a row. The controls area under
    // the table has one fixed height for every phase, and this panel is the
    // tallest of them — it has to fit, or the table resizes on every click.
    <div className="flex flex-col items-center gap-2" data-testid="betting-controls">
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <span className="text-sm text-content/60">{t('casino.table.placeYourBet')}</span>
        <span className="text-xs text-content/40" data-testid="bet-range">
          {t('casino.hud.betRange', { min: formatDollar(minBet), max: formatDollar(maxBet) })}
        </span>
        {/* The bet placed, typeable — it is the display as well as the input,
            so placing a bet still adds no row. */}
        <span className="flex items-center gap-2">
          <span className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-gold/70">$</span>
            <input
              type="number"
              inputMode="numeric"
              aria-label={t('casino.table.betAmount')}
              data-testid="current-bet-display"
              min={minBet}
              max={cap}
              step={1}
              placeholder={String(minBet)}
              value={draft ?? (currentBet > 0 ? currentBet : '')}
              onChange={e => {
                const raw = e.target.value
                setDraft(raw)
                const n = parseInt(raw, 10)
                if (legal(n)) onBetChange(n)
              }}
              onBlur={e => commit(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter' || draft === null || legal(parseInt(draft, 10))) return
                // Not a legal bet yet: settle it first, and keep this Enter from
                // also dealing — the table's shortcut would deal the old amount.
                e.stopPropagation()
                commit(draft)
              }}
              className="w-24 pl-6 pr-1.5 py-1 rounded-lg bg-contrast/5 border border-contrast/15 text-right text-lg font-bold text-gold
                placeholder:text-content/25 focus:outline-none focus:border-gold/60 [&::-webkit-inner-spin-button]:ml-1.5"
            />
          </span>
          {currentBet > 0 && (
            <button
              onClick={() => { setDraft(null); onBetChange(0) }}
              data-testid="clear-bet"
              className="text-xs text-content/50 hover:text-error px-2 py-0.5 rounded bg-contrast/10 hover:bg-contrast/20 cursor-pointer transition-colors"
            >
              {t('casino.table.clear')}
            </button>
          )}
        </span>
      </div>
      {/*
        Chips, drawn as chips.

        These were grey rectangles reading "+$25" while four `--color-chip-*`
        tokens sat unused in `index.css` and `soundEngine.chipPlace()` fired on
        every click with nothing to look at. The sound was describing something
        that was not on screen.

        The whole face is painted with two background layers and a box-shadow,
        so the button has **no child elements**: a radial gradient holds the
        centre disc in the chip colour and goes transparent past 64%, letting a
        repeating conic gradient show through as the edge notches only at the
        rim. That matters beyond tidiness — `getByText('+$25')` in
        `CasinoSession.test.tsx` resolves against direct text children, so
        wrapping the label in a span would make the button and the span both
        candidates. Keeping the value a direct text node keeps that test
        matching exactly one node.
      */}
      <div className="flex gap-2.5 flex-wrap justify-center">
        {getChipDenominations(minBet, maxBet).map(b => {
          const face = chipFace(b)
          return (
            <button key={b}
              onClick={() => {
                const newBet = Math.min(currentBet + b, maxBet, bankroll)
                setDraft(null)
                onBetChange(newBet)
                soundEngine.chipPlace()
              }}
              disabled={b > bankroll || currentBet >= Math.min(maxBet, bankroll)}
              data-testid={`chip-${b}`}
              style={{
                backgroundColor: face.fill,
                backgroundImage:
                  `radial-gradient(circle, ${face.fill} 0 64%, transparent 64%),` +
                  ' repeating-conic-gradient(rgba(255,255,255,0.34) 0deg 9deg, transparent 9deg 45deg)',
                boxShadow:
                  'inset 0 0 0 1px rgba(255,255,255,0.22),' +
                  ' inset 0 -2px 5px rgba(0,0,0,0.35),' +
                  ' 0 2px 4px rgba(0,0,0,0.45)',
              }}
              className={`w-12 h-12 rounded-full grid place-items-center cursor-pointer
                text-[10px] font-bold tracking-tight ${face.ink}
                transition-[transform,filter,opacity] duration-150 ease-out
                hover:-translate-y-0.5 hover:brightness-110
                active:translate-y-0 active:brightness-95 active:scale-[0.96]
                disabled:opacity-30 disabled:cursor-not-allowed
                disabled:hover:translate-y-0 disabled:hover:brightness-100`}>
              +${b}
            </button>
          )
        })}
      </div>
      <button onClick={onConfirm} data-testid="confirm-bet"
        disabled={currentBet < minBet && bankroll >= minBet}
        className="px-8 py-1.5 bg-gold text-on-gold rounded-xl font-bold hover:bg-gold/90 cursor-pointer
          transition-[background-color,transform,box-shadow,opacity] duration-150 ease-out
          shadow-[0_1px_2px_rgba(0,0,0,0.35)] hover:shadow-[0_3px_12px_-3px_var(--color-gold)]
          active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100
          disabled:hover:shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        {t('casino.table.deal', { amount: formatDollar(currentBet > 0 ? currentBet : minBet) })}
      </button>
    </div>
  )
}
