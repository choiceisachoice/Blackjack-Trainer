import { useId } from 'react'
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
 * cards), the twenty-four level pictures (four stages, from a plain numbered
 * card to the grandmaster's crown — see `LevelArt`), and the fifteen
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
 * The level ladder — four stages, each with its own look, so a picture from
 * the top of the ladder is unmistakably not one from the bottom.
 *
 * - **2–5** — plain numbered cards, white face. The beginner's deck.
 * - **6–10** — the night deck: black face, pips in the level's colour.
 * - **11–14** — the court on black with a foil rim: jack, queen, king, ace.
 * - **15–25** — no longer cards. Coin, laurel, star, shield, gem, the
 *   blazing 21, and from 22 the crowns — each one carrying more than the
 *   last, and 25 carrying everything.
 *
 * Every colour comes from the level table, so the picture agrees with the
 * badge in the nav bar and the level-up screen.
 */
function LevelArt({ level }: { level: number }) {
  const suit = SUIT_ORDER[(level - 2) % SUIT_ORDER.length]
  const color = LEVELS[level - 1]?.color ?? GOLD
  if (level <= 5) return <CardFace rank={String(level)} suit={suit} />
  if (level <= 10) return <NightCard rank={String(level)} suit={suit} color={color} />
  if (level <= 14) {
    const rank = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[level] ?? '?'
    return <NightCard rank={rank} suit={suit} color={color} court />
  }
  return <Regalia level={level} color={color} />
}

/** The night deck: black face, pips in the level's colour, a coloured rim. */
function NightCard({ rank, suit, color, court = false }: { rank: string; suit: Suit; color: string; court?: boolean }) {
  const glyph = SUIT_GLYPH[suit]
  const wide = rank.length > 1
  return (
    <>
      <rect width="64" height="64" fill="#101214" />
      <rect x="2" y="2" width="60" height="60" fill="none" stroke={color} strokeWidth={court ? 3 : 1.5} strokeOpacity={court ? 1 : 0.8} />
      {court && <rect x="6.5" y="6.5" width="51" height="51" fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.5" />}
      <text x={wide ? 6 : 8} y="22" fontSize={wide ? 15 : 17} fontWeight="800" fill={color} fontFamily="var(--font-sans)">{rank}</text>
      <text x="8" y="36" fontSize="13" fill={color}>{glyph}</text>
      {court
        ? <text x="38" y="52" textAnchor="middle" fontSize="30" fontWeight="800" fill={color} fontFamily="var(--font-sans)">{rank}</text>
        : <text x="46" y="52" textAnchor="middle" fontSize="26" fill={color}>{glyph}</text>}
    </>
  )
}

/** Thin rays out from the centre, behind whatever sits on top. */
function Rays({ color, count = 12, opacity = 0.28 }: { color: string; count?: number; opacity?: number }) {
  return (
    <g stroke={color} strokeOpacity={opacity} strokeWidth="2" strokeLinecap="round">
      {Array.from({ length: count }, (_, i) => (
        <line key={i} x1="32" y1="32" x2="32" y2="1" transform={`rotate(${(360 / count) * i} 32 32)`} />
      ))}
    </g>
  )
}

/** Two branches of leaves, cupping whatever sits between them. */
function Laurel({ color }: { color: string }) {
  const leaves = [200, 222, 244, 266, 288, 310]
  const leaf = (deg: number, mirror: boolean) => {
    const a = ((mirror ? 360 - deg : deg) * Math.PI) / 180
    const cx = 32 + 27 * Math.cos(a)
    const cy = 32 + 27 * Math.sin(a)
    const tangent = (mirror ? 360 - deg : deg) + 90
    return (
      <ellipse key={`${deg}-${mirror}`} cx={cx} cy={cy} rx="4" ry="1.9" fill={color} transform={`rotate(${tangent} ${cx} ${cy})`} />
    )
  }
  return <g>{leaves.map(d => leaf(d, false))}{leaves.map(d => leaf(d, true))}</g>
}

/** A four-point sparkle. */
function Sparkle({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <path
      d={`M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`}
      fill={color}
    />
  )
}

/** A five-point star centred at (x, y). */
function StarShape({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const rad = i % 2 === 0 ? r : r * 0.42
    const a = (-90 + i * 36) * (Math.PI / 180)
    return `${x + rad * Math.cos(a)},${y + rad * Math.sin(a)}`
  }).join(' ')
  return <polygon points={pts} fill={color} />
}

/** A crown, with gems on its points. */
function CrownShape({ color, gem, y = 0, scale = 1 }: { color: string; gem: string; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${32 - 32 * scale} ${y}) scale(${scale})`}>
      <path d="M11 44 L14 20 L24 32 L32 14 L40 32 L50 20 L53 44 Z" fill={color} />
      <rect x="11" y="44" width="42" height="6" rx="1.5" fill={color} />
      <rect x="11" y="44" width="42" height="6" rx="1.5" fill="none" stroke={INK} strokeOpacity="0.25" />
      <circle cx="14" cy="20" r="2.6" fill={gem} />
      <circle cx="32" cy="14" r="3" fill={gem} />
      <circle cx="50" cy="20" r="2.6" fill={gem} />
      <circle cx="32" cy="40" r="2.4" fill={gem} />
    </g>
  )
}

/** The number, set in the tile's own display face. `plinth` lays a dark pad under it so it reads over a busy ground. */
function Numeral({ level, y, size, color, weight = 800, plinth = false }: {
  level: number; y: number; size: number; color: string; weight?: number; plinth?: boolean
}) {
  return (
    <>
      {plinth && <rect x="21" y={y - size + 1} width="22" height={size + 3} rx="3" fill="#07080a" fillOpacity="0.8" />}
      <text x="32" y={y} textAnchor="middle" fontSize={size} fontWeight={weight} fill={color} fontFamily="var(--font-sans)">
        {level}
      </text>
    </>
  )
}

/**
 * Levels 15 to 25: regalia, not cards. Each one carries more than the last.
 */
function Regalia({ level, color }: { level: number; color: string }) {
  const uid = useId()
  const glowId = `g${uid}`
  const bg = <rect width="64" height="64" fill="var(--color-surface-2)" />
  const glow = (
    <defs>
      <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={color} stopOpacity="0.55" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </radialGradient>
    </defs>
  )

  switch (level) {
    case 15: // the coin
      return (
        <>
          {bg}
          <circle cx="32" cy="32" r="27" fill={color} />
          <circle cx="32" cy="32" r="26" fill="none" stroke={INK} strokeOpacity="0.28" strokeWidth="2.5" strokeDasharray="2 11.6" />
          <circle cx="32" cy="32" r="22" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
          <Numeral level={level} y={40} size={22} color={INK} />
        </>
      )
    case 16: // the coin, wreathed
      return (
        <>
          {bg}
          <Laurel color={color} />
          <circle cx="32" cy="32" r="20" fill={color} />
          <circle cx="32" cy="32" r="17" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
          <Numeral level={level} y={39} size={19} color={INK} />
        </>
      )
    case 17: // the star
      return (
        <>
          {bg}
          {glow}
          <circle cx="32" cy="32" r="30" fill={`url(#${glowId})`} />
          <StarShape x={32} y={33} r={29} color={color} />
          <StarShape x={32} y={33} r={22} color={INK} />
          <StarShape x={32} y={33} r={20} color={color} />
          <Numeral level={level} y={40} size={17} color={INK} />
        </>
      )
    case 18: // the shield
      return (
        <>
          {bg}
          <path d="M32 5 L55 13 V31 C55 45 45 54 32 59 C19 54 9 45 9 31 V13 Z" fill={color} />
          <path d="M32 10 L50 16.5 V31 C50 42 42 49 32 53.5 C22 49 14 42 14 31 V16.5 Z" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
          <Numeral level={level} y={40} size={22} color={INK} />
        </>
      )
    case 19: // the shield, wreathed, rayed
      return (
        <>
          {bg}
          <Rays color={color} opacity={0.22} />
          <Laurel color={color} />
          <path d="M32 11 L48 17 V31 C48 41 41 48 32 52 C23 48 16 41 16 31 V17 Z" fill={color} />
          <path d="M32 15 L44.5 19.5 V31 C44.5 39 39 44.5 32 47.5 C25 44.5 19.5 39 19.5 31 V19.5 Z" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.2" />
          <Numeral level={level} y={38} size={16} color={INK} />
        </>
      )
    case 20: // the gem
      return (
        <>
          {bg}
          {glow}
          <circle cx="32" cy="32" r="31" fill={`url(#${glowId})`} />
          <polygon points="32,5 54,20 46,56 18,56 10,20" fill={color} />
          <g stroke={INK} strokeOpacity="0.35" strokeWidth="1.2" fill="none">
            <polyline points="10,20 22,24 32,5 42,24 54,20" />
            <polyline points="22,24 18,56 32,32 46,56 42,24 32,32 22,24" />
          </g>
          <Numeral level={level} y={44} size={17} color={INK} />
        </>
      )
    case 21: // twenty-one — the blazing hand
      return (
        <>
          {bg}
          {glow}
          <circle cx="32" cy="32" r="32" fill={`url(#${glowId})`} />
          <Rays color={color} count={16} opacity={0.45} />
          <circle cx="32" cy="32" r="22" fill="#101214" />
          <circle cx="32" cy="32" r="22" fill="none" stroke={color} strokeWidth="2.5" />
          <Numeral level={level} y={41} size={25} color={color} weight={900} />
          <Sparkle x={9} y={12} r={4} color={color} />
          <Sparkle x={55} y={52} r={4} color={color} />
        </>
      )
    case 22: // the crown
      return (
        <>
          {bg}
          <CrownShape color={color} gem={INK} y={2} />
          <Numeral level={level} y={62} size={11} color={color} />
        </>
      )
    case 23: // the crown, wreathed
      return (
        <>
          {bg}
          <Laurel color={color} />
          <CrownShape color={color} gem="#101214" y={6} scale={0.72} />
          <Numeral level={level} y={58} size={11} color={color} plinth />
        </>
      )
    case 24: // the crown, wreathed and rayed
      return (
        <>
          {bg}
          {glow}
          <circle cx="32" cy="32" r="32" fill={`url(#${glowId})`} />
          <Rays color={color} opacity={0.3} />
          <Laurel color={color} />
          <CrownShape color={color} gem="#101214" y={6} scale={0.72} />
          <Numeral level={level} y={58} size={11} color={color} plinth />
        </>
      )
    default: { // 25 — the grandmaster: everything, in gold and ice
      const ice = color
      return (
        <>
          <rect width="64" height="64" fill="#07080a" />
          {glow}
          <circle cx="32" cy="32" r="32" fill={`url(#${glowId})`} />
          <Rays color={ice} count={24} opacity={0.4} />
          <circle cx="32" cy="32" r="30" fill="none" stroke={GOLD} strokeWidth="1.5" strokeOpacity="0.9" />
          <circle cx="32" cy="32" r="27.5" fill="none" stroke={ice} strokeWidth="1" strokeOpacity="0.8" />
          <Laurel color={GOLD} />
          <CrownShape color={GOLD} gem={ice} y={7} scale={0.7} />
          <Numeral level={level} y={59} size={12} color={GOLD} weight={900} plinth />
          <Sparkle x={10} y={10} r={4.5} color={ice} />
          <Sparkle x={54} y={9} r={3.5} color={GOLD} />
          <Sparkle x={55} y={55} r={4.5} color={ice} />
          <Sparkle x={9} y={54} r={3.5} color={GOLD} />
        </>
      )
    }
  }
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
