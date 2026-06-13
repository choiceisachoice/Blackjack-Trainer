import type { Card } from '../../engine/shoe/types'
import { AnimatedTableCard } from './CardComponents'
import { ShoeHousing, DiscardTray } from '../table/ShoeProgress'
import { handValueStr } from './helpers'

interface DealerViewProps {
  dealerCards: Card[]
  dealerHoleRevealed: boolean
  isDealPhase: boolean
  cardsRemaining: number
  cardsDealt: number
  totalCards: number
  penetration: number
}

export function DealerView({
  dealerCards,
  dealerHoleRevealed,
  isDealPhase,
  cardsRemaining,
  cardsDealt,
  totalCards,
  penetration,
}: DealerViewProps) {
  return (
    <div className="relative flex flex-col items-center gap-1 z-10 mb-4 md:mb-6">
      {/* Discard Tray — absolute left */}
      <div className="absolute left-2 md:left-4 top-0 z-20 origin-top-left">
        <DiscardTray cardCount={cardsDealt} />
      </div>

      {/* Shoe — absolute right */}
      <div className="absolute right-2 md:right-4 top-0 z-20 origin-top-right">
        <ShoeHousing
          cardCount={cardsRemaining}
          totalCards={totalCards}
          penetration={penetration}
        />
      </div>

      <span className="text-xs md:text-sm text-white/50 uppercase tracking-widest font-semibold">Dealer</span>
      {dealerCards.length > 0 ? (
        <>
          <div className="flex -space-x-4 md:-space-x-5 mt-1">
            {dealerCards.map((c, i) => (
              <div key={`dealer-${i}`} className="relative" style={{ zIndex: i }}>
                <AnimatedTableCard
                  card={c}
                  faceDown={i === 1 && !dealerHoleRevealed}
                  animateIn
                  delay={0}
                  size="dealer"
                />
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
