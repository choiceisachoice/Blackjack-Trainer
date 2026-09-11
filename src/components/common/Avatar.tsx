import type { AvatarId } from '../../services/supabase/profile-avatar'

/**
 * A profile picture drawn by the app.
 *
 * Twelve presets in the app's own vocabulary: the four suits on a dark tile,
 * four chips in the table's colours, and four court cards on a white face.
 * With no preset the tile shows the person's initial on gold, which is what
 * the account page showed before pictures existed.
 *
 * Everything is SVG at a 64-unit design size and scaled by `size`, so the
 * same mark serves the 16px nav button and the 64px profile header.
 */
export function Avatar({ id, initial, size = 64, className = '' }: {
  id: AvatarId | null
  /** Shown when there is no preset. One character; anything longer is cut. */
  initial: string
  size?: number
  className?: string
}) {
  const box = { width: size, height: size }
  const radius = Math.round(size * 0.28)

  if (id === null) {
    return (
      <span
        aria-hidden
        className={`grid place-items-center font-extrabold text-on-gold bg-gradient-to-b from-gold-bright to-gold shrink-0 ${className}`}
        style={{ ...box, borderRadius: radius, fontSize: size * 0.42 }}
      >
        {initial.trim().charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ borderRadius: radius }}
    >
      <AvatarArt id={id} />
    </svg>
  )
}

const SUIT_GLYPH = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' } as const
const RED = 'var(--color-chip-red)'
const GOLD = 'var(--color-gold)'

/** The picture for one preset, on a 64×64 canvas. */
function AvatarArt({ id }: { id: AvatarId }) {
  switch (id) {
    case 'spade':
    case 'heart':
    case 'diamond':
    case 'club': {
      const red = id === 'heart' || id === 'diamond'
      return (
        <>
          <rect width="64" height="64" fill="var(--color-surface-2)" />
          <rect x="0.5" y="0.5" width="63" height="63" fill="none" stroke={GOLD} strokeOpacity="0.35" />
          <text x="32" y="46" textAnchor="middle" fontSize="40" fill={red ? RED : GOLD}>{SUIT_GLYPH[id]}</text>
        </>
      )
    }
    case 'chip-red':
    case 'chip-blue':
    case 'chip-green':
    case 'chip-black': {
      const fill = `var(--color-${id})`
      return (
        <>
          <rect width="64" height="64" fill="var(--color-surface-2)" />
          <circle cx="32" cy="32" r="28" fill={fill} />
          {/* Edge spots, the six white marks a real chip carries. */}
          <circle cx="32" cy="32" r="25" fill="none" stroke="#ffffff" strokeWidth="6" strokeDasharray="8 18.2" strokeOpacity="0.9" />
          <circle cx="32" cy="32" r="17" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.7" />
          <circle cx="32" cy="32" r="15" fill={fill} />
          <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff" fillOpacity="0.9">$</text>
        </>
      )
    }
    case 'ace-spades':
    case 'king-hearts':
    case 'queen-diamonds':
    case 'jack-clubs': {
      const [rank, suit] = id.split('-') as [string, 'spades' | 'hearts' | 'diamonds' | 'clubs']
      const letter = { ace: 'A', king: 'K', queen: 'Q', jack: 'J' }[rank] ?? '?'
      const glyph = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[suit]
      const red = suit === 'hearts' || suit === 'diamonds'
      const ink = red ? '#c41e3a' : '#10100c'
      return (
        <>
          <rect width="64" height="64" fill="#f8f6f0" />
          <rect x="0.5" y="0.5" width="63" height="63" fill="none" stroke="#10100c" strokeOpacity="0.15" />
          <text x="8" y="22" fontSize="17" fontWeight="800" fill={ink} fontFamily="var(--font-sans)">{letter}</text>
          <text x="8" y="36" fontSize="13" fill={ink}>{glyph}</text>
          <text x="46" y="52" textAnchor="middle" fontSize="26" fill={ink}>{glyph}</text>
        </>
      )
    }
  }
}
