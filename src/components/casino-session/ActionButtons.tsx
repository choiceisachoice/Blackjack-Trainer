import { useTranslation } from 'react-i18next'
import { Action } from '../../engine/rules/types'

interface ActionButtonsProps {
  onAction: (action: Action) => void
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
  humanBusted: boolean
}

export function ActionButtons({ onAction, canDouble, canSplit, canSurrender, humanBusted }: ActionButtonsProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-2" data-testid="action-controls">
      <div className="flex gap-2 flex-wrap justify-center">
        <button onClick={() => onAction(Action.Hit)} data-testid="action-hit"
          disabled={humanBusted}
          className="px-5 py-2 bg-success text-white rounded-lg font-semibold hover:bg-success/80 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          {t('casino.act.hit')}
        </button>
        <button onClick={() => onAction(Action.Stand)} data-testid="action-stand"
          disabled={humanBusted}
          className="px-5 py-2 bg-error text-white rounded-lg font-semibold hover:bg-error/80 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          {t('casino.act.stand')}
        </button>
        <button onClick={() => onAction(Action.Double)} data-testid="action-double"
          disabled={!canDouble || humanBusted}
          className="px-5 py-2 bg-gold text-black rounded-lg font-semibold hover:bg-gold/80 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          {t('casino.act.double')}
        </button>
        <button onClick={() => onAction(Action.Split)} data-testid="action-split"
          disabled={!canSplit || humanBusted}
          className="px-5 py-2 bg-chip-blue text-white rounded-lg font-semibold hover:bg-chip-blue/80 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          {t('casino.act.split')}
        </button>
        <button onClick={() => onAction(Action.Surrender)} data-testid="action-surrender"
          disabled={!canSurrender || humanBusted}
          className="px-5 py-2 bg-contrast/10 text-content rounded-lg font-semibold hover:bg-contrast/20 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
          {t('casino.act.surrender')}
        </button>
      </div>
    </div>
  )
}
