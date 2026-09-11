import type { LucideIcon } from 'lucide-react'
import {
  Award, Coins, Crown, Dices, Flame, Gem, Hourglass, Medal, ScrollText, Shield, Sparkles, Star, Target, Trophy, Zap,
} from 'lucide-react'
import {
  avatarDef, achievementAvatarTier,
  type AchievementAvatarSource, type AvatarId, type BaseAvatarId,
} from '../../services/avatar-catalog'
import { LEVELS } from '../../services/level-system'

/**
 * A profile picture drawn by the app.
 *
 * Three families, one canvas: the twelve base pictures (suits, chips, court
 * cards), the twenty-four level pictures (a numbered card per level up to
 * the ace, then a medallion in the level's colour), and the fifteen
 * achievement pictures (the award's mark on a tile in its tier's colour).
 * With no preset the tile shows the person's initial on gold.
 *
 * Everything is SVG at a 64-unit design size and scaled by `size`, so the
 * same mark serves the 22px nav button and the 64px profile header.
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

const RED = 'var(--color-chip-red)'
const GOLD = 'var(--color-gold)'
const INK = '#10100c'
const FACE = '#f8f6f0'
const DIAMOND = '#b9f2ff'

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'
const SUIT_GLYPH: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_ORDER: Suit[] = ['clubs', 'diamonds', 'spades', 'hearts']
const isRed = (s: Suit) => s === 'hearts' || s === 'diamonds'

/** The picture for one id, on a 64×64 canvas. */
function AvatarArt({ id }: { id: AvatarId }) {
  const { unlock } = avatarDef(id)
  if (unlock.kind === 'level') return <LevelArt level={unlock.level} />
  if (unlock.kind === 'achievement') return <AchievementArt source={unlock.achievementId} />
  return <BaseArt id={id as BaseAvatarId} />
}

function BaseArt({ id }: { id: BaseAvatarId }) {
  switch (id) {
    case 'spade':
    case 'heart':
    case 'diamond':
    case 'club': {
      const glyph = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' }[id]
      const red = id === 'heart' || id === 'diamond'
      return (
        <>
          <rect width="64" height="64" fill="var(--color-surface-2)" />
          <rect x="0.5" y="0.5" width="63" height="63" fill="none" stroke={GOLD} strokeOpacity="0.35" />
          <text x="32" y="46" textAnchor="middle" fontSize="40" fill={red ? RED : GOLD}>{glyph}</text>
        </>
      )
    }
    case 'chip-red':
    case 'chip-blue':
    case 'chip-green':
    case 'chip-black':
      return <Chip fill={`var(--color-${id})`} label="$" />
    case 'ace-spades':
    case 'king-hearts':
    case 'queen-diamonds':
    case 'jack-clubs': {
      const [rank, suit] = id.split('-') as [string, Suit]
      const letter = { ace: 'A', king: 'K', queen: 'Q', jack: 'J' }[rank] ?? '?'
      return <CardFace rank={letter} suit={suit} />
    }
  }
}

/** A casino chip: body, six edge spots, an inner ring, a label. */
function Chip({ fill, label, labelFill = '#ffffff' }: { fill: string; label: string; labelFill?: string }) {
  return (
    <>
      <rect width="64" height="64" fill="var(--color-surface-2)" />
      <circle cx="32" cy="32" r="28" fill={fill} />
      <circle cx="32" cy="32" r="25" fill="none" stroke="#ffffff" strokeWidth="6" strokeDasharray="8 18.2" strokeOpacity="0.9" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.7" />
      <circle cx="32" cy="32" r="15" fill={fill} />
      <text x="32" y="37" textAnchor="middle" fontSize={label.length > 1 ? 11 : 13} fontWeight="700" fill={labelFill} fillOpacity="0.92" fontFamily="var(--font-sans)">{label}</text>
    </>
  )
}

/** A card face: rank and pip in the corner, the pip large in the body. */
function CardFace({ rank, suit, foil = false }: { rank: string; suit: Suit; foil?: boolean }) {
  const ink = isRed(suit) ? '#c41e3a' : INK
  const glyph = SUIT_GLYPH[suit]
  const wide = rank.length > 1
  return (
    <>
      <rect width="64" height="64" fill={FACE} />
      {/* A gold rim for the court cards of the level ladder — the same face,
          visibly a rank above the plain ones. */}
      {foil
        ? <rect x="2" y="2" width="60" height="60" fill="none" stroke={GOLD} strokeWidth="3" />
        : <rect x="0.5" y="0.5" width="63" height="63" fill="none" stroke={INK} strokeOpacity="0.15" />}
      <text x={wide ? 6 : 8} y="22" fontSize={wide ? 15 : 17} fontWeight="800" fill={ink} fontFamily="var(--font-sans)">{rank}</text>
      <text x="8" y="36" fontSize="13" fill={ink}>{glyph}</text>
      <text x="46" y="52" textAnchor="middle" fontSize="26" fill={ink}>{glyph}</text>
    </>
  )
}

/**
 * The level ladder. 2–10 are the numbered cards, suits cycling so the run
 * reads as a deck rather than a single suit; 11–14 are the jack, queen,
 * king and ace with a gold rim; 15–25 are medallions in the level's own
 * colour from the level table, carrying the number.
 */
function LevelArt({ level }: { level: number }) {
  const suit = SUIT_ORDER[(level - 2) % SUIT_ORDER.length]
  if (level <= 10) return <CardFace rank={String(level)} suit={suit} />
  if (level <= 14) {
    const rank = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[level] ?? '?'
    return <CardFace rank={rank} suit={suit} foil />
  }
  const color = LEVELS[level - 1]?.color ?? GOLD
  return (
    <>
      <rect width="64" height="64" fill="var(--color-surface-2)" />
      <circle cx="32" cy="32" r="27" fill={color} />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
      {/* Twelve notches round the rim, like the milling on a coin. */}
      <circle cx="32" cy="32" r="26" fill="none" stroke={INK} strokeOpacity="0.28" strokeWidth="2.5" strokeDasharray="2 11.6" />
      <text x="32" y="40" textAnchor="middle" fontSize="22" fontWeight="800" fill={INK} fillOpacity="0.85" fontFamily="var(--font-sans)">{level}</text>
    </>
  )
}

/** The mark for each achievement picture. Lucide, the app's own icon set. */
const ACHIEVEMENT_MARK: Record<AchievementAvatarSource, LucideIcon> = {
  legendary: Flame,
  six_systems: Zap,
  casino_triple_threat: Target,
  casino_pro: Trophy,
  five_hundred_sessions: Medal,
  ten_perfects: Star,
  mega_profit: Gem,
  unbreakable: Shield,
  deviation_sage: ScrollText,
  tracker_100_sessions: Crown,
  tracker_profit_10000: Coins,
  platinum_collector: Sparkles,
  master_collector: Award,
  hundred_hours: Hourglass,
  ten_thousand_hands: Dices,
}

/**
 * An award's mark on a tile in its tier's colour: gold for gold, the ice
 * blue the level table uses for its top rung for diamond.
 */
function AchievementArt({ source }: { source: AchievementAvatarSource }) {
  const Mark = ACHIEVEMENT_MARK[source]
  const tint = achievementAvatarTier(source) === 'diamond' ? DIAMOND : GOLD
  return (
    <>
      <rect width="64" height="64" fill="var(--color-surface-2)" />
      <circle cx="32" cy="32" r="27" fill={tint} fillOpacity="0.2" />
      <circle cx="32" cy="32" r="27" fill="none" stroke={tint} strokeOpacity="0.8" strokeWidth="2" />
      <Mark x={17} y={17} width={30} height={30} color={tint} strokeWidth={2} />
    </>
  )
}
