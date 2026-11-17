import { memo } from 'react'
import { isRedSuit, isCourt, cardImageUrl, COURT_FIGURE, SUIT_PATH, type CardSuitName } from './card-suits'

/**
 * The one drawing of a playing card.
 *
 * Until now the product drew its cards four different ways — the practice
 * table, the casino table, the bots' small cards and the landing page each had
 * their own, all of them a white box with a letter and a font's suit glyph in
 * it. A font's ♥ is not a drawing: it changes with the typeface, some systems
 * hand back an emoji, and at 50px it is a smudge.
 *
 * Two layouts share the frame:
 *
 * - `compact` — for cards under roughly 90px wide, which is every card on a
 *   table. A large index (rank over suit) and one large suit, drawn as paths
 *   so they stay sharp. At that size a reader needs the rank first, and nine
 *   real pips would be nine dots. A J, Q or K shows its picture where a number
 *   card shows the suit: a picture card is told by its picture.
 * - `full` — the standard deck's own card, for anything shown large: the
 *   classic pip layout and the court figures everybody knows
 *   (`cardImageUrl`). The first version drew its own, and its court cards
 *   were a letter in a frame.
 *
 * The component fills its parent; the parent decides the size and should keep
 * the 5:7 ratio.
 */

const RED = '#c8102e'
const BLACK = '#14161a'

/** One suit symbol, centred on (cx, cy), `size` units wide; `flip` turns it upside down. */
function Pip({ suit, cx, cy, size, flip = false }: { suit: CardSuitName; cx: number; cy: number; size: number; flip?: boolean }) {
  const s = size / 100
  return (
    <path
      d={SUIT_PATH[suit]}
      transform={`translate(${cx} ${cy}) ${flip ? 'rotate(180) ' : ''}scale(${s}) translate(-50 -50)`}
    />
  )
}

const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"

/** Props of {@link CardFace}. */
export interface CardFaceProps {
  /** Rank as the engine spells it: 'A', '2' … '10', 'J', 'Q', 'K'. */
  rank: string
  /** Suit as the engine spells it. */
  suit: string
  /** `compact` for table sizes, `full` for large cards. */
  variant?: 'compact' | 'full'
}

/** The face of a card, as an SVG that fills its parent. */
export const CardFace = memo(function CardFace({ rank, suit, variant = 'compact' }: CardFaceProps) {
  const s = suit as CardSuitName
  const ink = isRedSuit(suit) ? RED : BLACK
  const narrow = rank === '10'
  return (
    <svg
      viewBox="0 0 250 350"
      className="block w-full h-full"
      role="img"
      aria-label={`${rank} ${suit}`}
      data-card={`${rank}-${suit}`}
    >
      <rect x="1.5" y="1.5" width="247" height="347" rx="20" fill="#ffffff" stroke="#c9ced6" strokeWidth="3" />
      <g fill={ink} fontFamily={FONT} fontWeight={800}>
        {variant === 'compact' ? (
          <>
            <text
              x="22" y="100" fontSize="104"
              textLength={narrow ? 98 : undefined}
              lengthAdjust="spacingAndGlyphs"
            >{rank}</text>
            <Pip suit={s} cx={56} cy={150} size={62} />
            {isCourt(rank) ? (
              <>
                {/* The figure's upper half, from the same image the large card uses. */}
                <svg x="96" y="118" width="140" height="214" viewBox={`${COURT_FIGURE.x + 30} ${COURT_FIGURE.y} ${COURT_FIGURE.width - 60} ${COURT_FIGURE.height + 50}`} preserveAspectRatio="xMidYMid slice">
                  <image href={cardImageUrl(rank, suit)} width="250" height="350" preserveAspectRatio="none" />
                </svg>
                <rect x="96" y="118" width="140" height="214" rx="8" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="3" />
              </>
            ) : (
              <Pip suit={s} cx={160} cy={248} size={132} />
            )}
          </>
        ) : (
          <>
            <image href={cardImageUrl(rank, suit)} width="250" height="350" preserveAspectRatio="none" />
          </>
        )}
      </g>
    </svg>
  )
})

/**
 * The back of a card: deep red, a white border and a fine diamond lattice.
 * Red, because on green felt it is the colour a face-down card is found by.
 */
export const CardBack = memo(function CardBack() {
  return (
    <svg viewBox="0 0 250 350" className="block w-full h-full" role="img" aria-label="Face-down card" data-card="back">
      <defs>
        <pattern id="bjt-card-lattice" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="#8f1326" />
          <path d="M0 0H22M0 0V22" stroke="#c9364a" strokeWidth="2.5" />
          <circle cx="11" cy="11" r="2.2" fill="#c9364a" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="247" height="347" rx="20" fill="#ffffff" stroke="#c9ced6" strokeWidth="3" />
      <rect x="16" y="16" width="218" height="318" rx="10" fill="url(#bjt-card-lattice)" />
      <rect x="16" y="16" width="218" height="318" rx="10" fill="none" stroke="#6d0d1c" strokeWidth="3" />
    </svg>
  )
})
