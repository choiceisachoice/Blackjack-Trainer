import type { Card } from '../../engine/shoe/types'
import { AnimatedTableCard, FlipCard } from './CardComponents'
import { handValueStr } from './helpers'

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
  return (
    <div className="relative flex flex-col items-center gap-1">
      <span className="text-xs md:text-sm text-white/50 uppercase tracking-widest font-semibold">Dealer</span>
      {dealerCards.length > 0 ? (
        <>
          <div className="flex -space-x-6 md:-space-x-7 mt-1">
            {dealerCards.map((c, i) => (
              <div key={`dealer-${i}`} className="relative" style={{ zIndex: i }}>
                {i === 1 ? (
                  <FlipCard card={c} revealed={dealerHoleRevealed} size="dealer" />
                ) : (
                  <AnimatedTableCard card={c} animateIn delay={0} size="dealer" />
                )}
              </div>
            ))}
          </div>
          <span className="text-sm md:text-base text-white/80 font-bold mt-1">
            {dealerHoleRevealed ? handValueStr(dealerCards) : handValueStr([dealerCards[0]])}
          </span>
        </>
      ) : (
        <div className="h-24 md:h-28 flex items-center">
          <span className="text-white/15 text-sm italic">Place your bet to deal</span>
        </div>
      )}
    </div>
  )
}
