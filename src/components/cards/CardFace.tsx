import { memo } from 'react'
import { isRedSuit, type CardSuitName } from './card-suits'

/**
 * The one drawing of a playing card.
 *
 * Until now the product drew its cards four different ways — the practice
 * table, the casino table, the bots' small cards and the landing page each had
 * their own, all of them a white box with a letter and a font's suit glyph in
 * it. A font's ♥ is not a drawing: it changes with the typeface, some systems
 * hand back an emoji, and at 50px it is a smudge.
 *
 * This is a vector card. Suits are paths, so they are the same heart on every
 * machine and stay sharp at any size. Two layouts share the frame:
 *
 * - `compact` — for cards under roughly 90px wide, which is every card on a
 *   table. A large index (rank over suit) and one large suit. At that size a
 *   reader needs the rank first, and nine real pips would be nine dots.
 * - `full` — the traditional pip layout, with framed court cards, for anything
 *   shown large.
 *
 * The component fills its parent; the parent decides the size and should keep
 * the 5:7 ratio.
 */

const RED = '#c8102e'
const BLACK = '#14161a'

/** Each suit drawn in a 100 × 100 box. */
const SUIT_PATH: Record<CardSuitName, string> = {
  Hearts:
    'M50 90C22 66 8 49 8 31 8 17 19 8 31 8c8 0 15 5 19 12 4-7 11-12 19-12 12 0 23 9 23 23 0 18-14 35-42 59z',
  Diamonds: 'M50 4Q69 30 90 50 69 70 50 96 31 70 10 50 31 30 50 4z',
  Spades:
    'M50 5C62 27 92 42 92 63c0 12-9 20-20 20-8 0-14-4-18-10 1 9 5 16 13 22H33c8-6 12-13 13-22-4 6-10 10-18 10C17 83 8 75 8 63 8 42 38 27 50 5z',
  Clubs:
    'M50 6a21 21 0 0 1 17 33 21 21 0 1 1-13 34c1 9 5 17 13 23H33c8-6 12-14 13-23a21 21 0 1 1-13-34A21 21 0 0 1 50 6z',
}

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

/** Pip positions on a 250 × 350 card: [x, y, upside-down]. */
const L = 82, C = 125, R = 168
const T = 78, B = 272, M = 175
const U = 142.7, D = 207.3
type Spot = [number, number, boolean]
const PIPS: Record<string, Spot[]> = {
  '2': [[C, T, false], [C, B, true]],
  '3': [[C, T, false], [C, M, false], [C, B, true]],
  '4': [[L, T, false], [R, T, false], [L, B, true], [R, B, true]],
  '5': [[L, T, false], [R, T, false], [C, M, false], [L, B, true], [R, B, true]],
  '6': [[L, T, false], [R, T, false], [L, M, false], [R, M, false], [L, B, true], [R, B, true]],
  '7': [[L, T, false], [R, T, false], [C, 126, false], [L, M, false], [R, M, false], [L, B, true], [R, B, true]],
  '8': [[L, T, false], [R, T, false], [C, 126, false], [L, M, false], [R, M, false], [C, 224, true], [L, B, true], [R, B, true]],
  '9': [[L, T, false], [R, T, false], [L, U, false], [R, U, false], [C, M, false], [L, D, true], [R, D, true], [L, B, true], [R, B, true]],
  '10': [[L, T, false], [R, T, false], [C, 110, false], [L, U, false], [R, U, false], [L, D, true], [R, D, true], [C, 240, true], [L, B, true], [R, B, true]],
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
            <Pip suit={s} cx={160} cy={248} size={132} />
          </>
        ) : (
          <>
            <Index rank={rank} suit={s} narrow={narrow} />
            <g transform="rotate(180 125 175)"><Index rank={rank} suit={s} narrow={narrow} /></g>
            {PIPS[rank]
              ? PIPS[rank].map(([x, y, flip], i) => <Pip key={i} suit={s} cx={x} cy={y} size={46} flip={flip} />)
              : rank === 'A'
                ? <Pip suit={s} cx={C} cy={M} size={118} />
                : <Court rank={rank} suit={s} ink={ink} />}
          </>
        )}
      </g>
    </svg>
  )
})

/** Corner index of the full layout: rank over a small suit. */
function Index({ rank, suit, narrow }: { rank: string; suit: CardSuitName; narrow: boolean }) {
  return (
    <>
      <text
        x="31" y="52" fontSize="44" textAnchor="middle"
        textLength={narrow ? 40 : undefined} lengthAdjust="spacingAndGlyphs"
      >{rank}</text>
      <Pip suit={suit} cx={31} cy={78} size={30} />
    </>
  )
}

/** J, Q, K of the full layout: a framed panel with the letter and two suits. */
function Court({ rank, suit, ink }: { rank: string; suit: CardSuitName; ink: string }) {
  return (
    <>
      <rect x="58" y="44" width="134" height="262" rx="10" fill={ink} fillOpacity="0.06" stroke={ink} strokeOpacity="0.55" strokeWidth="2.5" />
      <rect x="66" y="52" width="118" height="246" rx="6" fill="none" stroke={ink} strokeOpacity="0.25" strokeWidth="1.5" />
      <text x="125" y="212" fontSize="128" textAnchor="middle">{rank}</text>
      <Pip suit={suit} cx={88} cy={80} size={34} />
      <Pip suit={suit} cx={162} cy={270} size={34} flip />
    </>
  )
}

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
