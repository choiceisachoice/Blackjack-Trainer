import { Suit } from '../../engine/shoe/types'
import type { Card } from '../../engine/shoe/types'
import { getHandValue, isSoft, isBust, isBlackjack } from '../../engine/rules/hand-utils'

/**
 * Static card figures for the Learn page.
 *
 * Separate from `components/cards/PlayingCard`, which is built for the table:
 * 3D flips, deal timing, slide-in from the shoe. A lesson wants the opposite —
 * a still, quiet illustration you can read while thinking.
 *
 * Every total shown here is computed by the engine (`getHandValue`, `isSoft`,
 * …) rather than typed in. A tutorial that teaches "A + 6 is a soft 17" must
 * not be able to drift from the code that decides what a soft 17 is.
 */

const SUIT_SYMBOL: Record<Suit, string> = {
  [Suit.Hearts]: '♥',
  [Suit.Diamonds]: '♦',
  [Suit.Clubs]: '♣',
  [Suit.Spades]: '♠',
}

const isRed = (s: Suit) => s === Suit.Hearts || s === Suit.Diamonds

type CardSize = 'xs' | 'sm' | 'md'

/**
 * `xs` exists for the loading screen, where a card rides the head of the
 * progress bar and has to stand proud of a 22px slot without dwarfing it. It is
 * the smallest a card can be and still read as a card rather than as a white
 * block — below this the rank and the pip stop being separable.
 */
const SIZE: Record<CardSize, { box: string; rank: string; suit: string }> = {
  xs: { box: 'w-6 h-[34px] rounded-[3px]', rank: 'text-[0.62rem]', suit: 'text-[0.55rem]' },
  sm: { box: 'w-9 h-[52px] rounded-md', rank: 'text-[0.85rem]', suit: 'text-[0.75rem]' },
  md: { box: 'w-12 h-[68px] rounded-lg', rank: 'text-lg', suit: 'text-sm' },
}

/** One still playing card. */
export function TeachingCard({ card, size = 'md', faceDown = false }: {
  card: Card
  size?: CardSize
  faceDown?: boolean
}) {
  const s = SIZE[size]
  if (faceDown) {
    return (
      <div
        aria-hidden
        className={`${s.box} shrink-0 border border-white/12
          bg-[repeating-linear-gradient(45deg,#1e3a8a,#1e3a8a_4px,#16264d_4px,#16264d_8px)]`}
      />
    )
  }
  const red = isRed(card.suit)
  return (
    <div
      aria-hidden
      className={`${s.box} shrink-0 flex flex-col items-center justify-center leading-none select-none
        bg-[linear-gradient(160deg,#f4f2ec,#dcd9cf)] shadow-[0_6px_14px_-8px_rgba(0,0,0,.9)]`}
    >
      <span className={`${s.rank} font-bold ${red ? 'text-[#c41e3a]' : 'text-[#16181d]'}`}>
        {card.rank}
      </span>
      <span className={`${s.suit} ${red ? 'text-[#c41e3a]' : 'text-[#16181d]'}`}>
        {SUIT_SYMBOL[card.suit]}
      </span>
    </div>
  )
}

/**
 * A hand of cards with the total the engine computes for it.
 *
 * `label` names the situation ("You", "Dealer"); the total, the soft/hard
 * wording and the bust/blackjack call all come from the engine.
 */
export function HandFigure({ cards, label, size = 'md', hideSecond = false, note }: {
  cards: Card[]
  label?: string
  size?: CardSize
  /** Render the second card face down, the way a dealer's hole card sits. */
  hideSecond?: boolean
  note?: string
}) {
  const visible = hideSecond ? cards.slice(0, 1) : cards
  const { best } = getHandValue(visible)
  const soft = isSoft(visible)
  const bust = isBust(visible)
  const blackjack = !hideSecond && isBlackjack(cards)

  const total = blackjack
    ? 'Blackjack'
    : bust
      ? `${best} — bust`
      : soft
        ? `soft ${best}`
        : `${best}`

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">{label}</span>
      )}
      <div className="flex gap-1.5 items-end">
        {cards.map((card, i) => (
          <TeachingCard
            key={`${card.rank}${card.suit}${i}`}
            card={card}
            size={size}
            faceDown={hideSecond && i === 1}
          />
        ))}
        <span className={`ml-2 text-sm font-semibold tabular-nums self-center ${
          bust ? 'text-error' : blackjack ? 'text-gold' : 'text-content/80'
        }`}>
          {total}
        </span>
      </div>
      {note && <p className="text-xs text-content/50 leading-snug max-w-[34ch]">{note}</p>}
    </div>
  )
}

/** Hi-Lo tag for a card, shown under it — the counting lesson's core image. */
export function TaggedCard({ card, tag }: { card: Card; tag: number }) {
  const sign = tag > 0 ? `+${tag}` : `${tag}`
  return (
    <div className="flex flex-col items-center gap-1.5">
      <TeachingCard card={card} size="sm" />
      <span className={`text-xs font-bold tabular-nums ${
        tag > 0 ? 'text-[#37c46b]' : tag < 0 ? 'text-[#e5566b]' : 'text-content/40'
      }`}>
        {sign}
      </span>
    </div>
  )
}

