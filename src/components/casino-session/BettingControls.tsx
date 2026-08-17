import { useTranslation } from 'react-i18next'
import { soundEngine } from '../../services/sound-engine'
import { formatDollar, getChipDenominations } from './helpers'

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
      <div className="flex gap-2 flex-wrap justify-center">
        {getChipDenominations(minBet, maxBet).map(b => (
          <button key={b}
            onClick={() => {
              const newBet = Math.min(currentBet + b, maxBet, bankroll)
              onBetChange(newBet)
              soundEngine.chipPlace()
            }}
            disabled={b > bankroll || currentBet >= Math.min(maxBet, bankroll)}
            data-testid={`chip-${b}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer
              bg-contrast/10 text-content hover:bg-contrast/20
              disabled:opacity-30 disabled:cursor-not-allowed`}>
            +${b}
          </button>
        ))}
      </div>
      <button onClick={onConfirm} data-testid="confirm-bet"
        disabled={currentBet < minBet && bankroll >= minBet}
        className="px-8 py-2 bg-gold text-black rounded-xl font-bold hover:bg-gold/90 cursor-pointer disabled:opacity-50">
        {currentBet > 0 ? `Deal - ${formatDollar(currentBet)}` : `Deal - ${formatDollar(minBet)}`}
      </button>
    </div>
  )
}
