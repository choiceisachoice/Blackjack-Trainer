import { useTranslation } from 'react-i18next'
import type { Card } from '../../engine/shoe/types'
import { AnimatedTableCard, FlipCard } from './CardComponents'
import { handValueStr, DEALER_CARD } from './helpers'

interface DealerViewProps {
  dealerCards: Card[]
  dealerHoleRevealed: boolean
}

/**
 * The dealer's area: label, cards (equal size, hole card face-down until
 * revealed) and running total. The shoe and discard tray live in the table's
 * top rail, not here, so a long dealer hand never collides with them.
 */
export function DealerView({ dealerCards, dealerHoleRevealed }: DealerViewProps) {
  const { t } = useTranslation()
  return (
    <div className="relative flex flex-col items-center gap-1">
      <span className="text-sm text-white/50 uppercase tracking-widest font-semibold">{t('casino.table.dealer')}</span>
      {/* One box for the whole session: the room for the cards and the total is
          there before the first card, and a card is placed at a fixed step from
          the first, so a dealer who draws moves nothing that is already down.
          The hand used to be a centred row that re-centred on every draw. */}
      <div className="flex flex-col items-center mt-1">
        <div className="relative" style={{ width: DEALER_CARD.width + DEALER_CARD.step, height: DEALER_CARD.height }}>
          {dealerCards.length === 0 && (
            <span className="absolute inset-0 grid place-items-center text-center text-white/25 text-sm italic whitespace-nowrap">{t('casino.table.placeBetToDeal')}</span>
          )}
          {dealerCards.map((c, i) => (
            <div key={`dealer-${i}`} className="absolute top-0" style={{ zIndex: i, left: i * DEALER_CARD.step }}>
              {i === 1 ? (
                <FlipCard card={c} revealed={dealerHoleRevealed} size="dealer" />
              ) : (
                <AnimatedTableCard card={c} animateIn delay={0} size="dealer" />
              )}
            </div>
          ))}
        </div>
        <span className={`text-base text-white/85 font-bold mt-1 ${dealerCards.length === 0 ? 'invisible' : ''}`}>
          {dealerCards.length === 0 ? '0' : dealerHoleRevealed ? handValueStr(dealerCards) : handValueStr([dealerCards[0]])}
        </span>
      </div>
    </div>
  )
}
