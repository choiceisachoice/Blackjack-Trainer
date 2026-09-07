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

export function BettingControls({ currentBet, minBet, maxBet, bankroll, onBetChange, onConfirm }: BettingControlsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3" data-testid="betting-controls">
      <span className="text-sm text-content/60">{t('casino.table.placeYourBet')}</span>
      <span className="text-xs text-content/40" data-testid="bet-range">
        {t('casino.hud.betRange', { min: formatDollar(minBet), max: formatDollar(maxBet) })}
      </span>
      {/* Current bet display */}
      {currentBet > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gold" data-testid="current-bet-display">
            {formatDollar(currentBet)}
          </span>
          <button
            onClick={() => onBetChange(0)}
            data-testid="clear-bet"
            className="text-xs text-content/50 hover:text-error px-2 py-0.5 rounded bg-contrast/10 hover:bg-contrast/20 cursor-pointer transition-colors"
          >
            {t('casino.table.clear')}
          </button>
        </div>
      )}
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
              className={`w-16 h-16 rounded-full grid place-items-center cursor-pointer
                text-[11px] font-bold tracking-tight ${face.ink}
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
        className="px-8 py-2 bg-gold text-on-gold rounded-xl font-bold hover:bg-gold/90 cursor-pointer
          transition-[background-color,transform,box-shadow,opacity] duration-150 ease-out
          shadow-[0_1px_2px_rgba(0,0,0,0.35)] hover:shadow-[0_3px_12px_-3px_var(--color-gold)]
          active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100
          disabled:hover:shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        {t('casino.table.deal', { amount: formatDollar(currentBet > 0 ? currentBet : minBet) })}
      </button>
    </div>
  )
}
