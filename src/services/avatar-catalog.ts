import { getAchievementById } from './achievements/achievement-list'

/**
 * Every profile picture the app can draw, and what it takes to use it.
 *
 * Three families:
 *
 * - **Base** — the twelve everyone has from the first minute: the four suits,
 *   four chips, four court cards.
 * - **Level** — one per level-up, levels 2 to 25. The picture follows the
 *   ladder the levels already are: numbered cards climb from the 2 to the 10,
 *   the court and the ace carry 11 to 14, and from 15 the medallions take
 *   over in each level's own colour.
 * - **Achievement** — fifteen, one for each of the hardest awards in the
 *   game: every diamond-tier award that a person can actually reach, plus the
 *   two gold ones that take the longest. Cheap awards would make a picture a
 *   participation ribbon; these are the ones worth wearing.
 *
 * The ids are stored verbatim in the auth metadata of every account that
 * chose one, so they are stable by contract: a rename here orphans accounts.
 */

/** The twelve pictures everyone has. */
export const BASE_AVATAR_IDS = [
  'spade', 'heart', 'diamond', 'club',
  'chip-red', 'chip-blue', 'chip-green', 'chip-black',
  'ace-spades', 'king-hearts', 'queen-diamonds', 'jack-clubs',
] as const

export type BaseAvatarId = (typeof BASE_AVATAR_IDS)[number]

/** Levels that hand out a picture: every level-up there is. */
export const LEVEL_AVATAR_LEVELS: readonly number[] = Array.from({ length: 24 }, (_, i) => i + 2)

export type LevelAvatarId = `level-${number}`

/**
 * The awards that hand out a picture. Only ones a person can reach: every
 * diamond award except `level_25`, which the level family already covers,
 * plus the two longest gold grinds.
 */
export const ACHIEVEMENT_AVATAR_SOURCES = [
  'legendary',            // 30-day streak
  'six_systems',          // 95% sustained speed-drill accuracy
  'casino_triple_threat', // 90% on bet, play and count in one session
  'casino_pro',           // three casino sessions graded
  'five_hundred_sessions',
  'ten_perfects',         // ten perfect sessions
  'mega_profit',          // 10,000 casino profit
  'unbreakable',          // 50-answer streak
  'deviation_sage',       // Illustrious 18 mastered
  'tracker_100_sessions', // 100 real sessions logged
  'tracker_profit_10000', // 10,000 real profit
  'platinum_collector',   // 75 awards
  'master_collector',     // 50 awards
  'hundred_hours',        // gold — 100 hours trained
  'ten_thousand_hands',   // gold — 10,000 hands
] as const

export type AchievementAvatarSource = (typeof ACHIEVEMENT_AVATAR_SOURCES)[number]
export type AchievementAvatarId = `ach-${AchievementAvatarSource}`

export type AvatarId = BaseAvatarId | LevelAvatarId | AchievementAvatarId

/** What it takes to use a picture. */
export type AvatarUnlock =
  | { kind: 'base' }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; achievementId: AchievementAvatarSource }

export interface AvatarDef {
  id: AvatarId
  unlock: AvatarUnlock
}

/** The id of the picture a level hands out. */
export function levelAvatarId(level: number): LevelAvatarId {
  return `level-${level}`
}

/** The id of the picture an award hands out. */
export function achievementAvatarId(achievementId: AchievementAvatarSource): AchievementAvatarId {
  return `ach-${achievementId}`
}

/** Every picture, in the order the picker shows them. */
export const AVATAR_CATALOG: readonly AvatarDef[] = [
  ...BASE_AVATAR_IDS.map((id): AvatarDef => ({ id, unlock: { kind: 'base' } })),
  ...LEVEL_AVATAR_LEVELS.map((level): AvatarDef => ({ id: levelAvatarId(level), unlock: { kind: 'level', level } })),
  ...ACHIEVEMENT_AVATAR_SOURCES.map((achievementId): AvatarDef => ({
    id: achievementAvatarId(achievementId),
    unlock: { kind: 'achievement', achievementId },
  })),
]

/** Every id, base first. */
export const AVATAR_IDS: readonly AvatarId[] = AVATAR_CATALOG.map(d => d.id)

const BY_ID = new Map<string, AvatarDef>(AVATAR_CATALOG.map(d => [d.id, d]))

/**
 * Whether a stored value names a picture in the catalogue.
 *
 * @param value - Whatever the metadata holds
 */
export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && BY_ID.has(value)
}

/** The definition behind an id. */
export function avatarDef(id: AvatarId): AvatarDef {
  const def = BY_ID.get(id)
  if (!def) throw new Error(`unknown avatar ${id}`)
  return def
}

/** What the unlock check needs to know about a person. */
export interface AvatarProgress {
  /** Current level, 1-based. */
  level: number
  /** Ids of unlocked achievements. */
  unlockedAchievementIds: readonly string[]
}

/**
 * Whether a person may use a picture.
 *
 * @param id - The picture
 * @param progress - Their level and awards
 */
export function isAvatarUnlocked(id: AvatarId, progress: AvatarProgress): boolean {
  const { unlock } = avatarDef(id)
  switch (unlock.kind) {
    case 'base': return true
    case 'level': return progress.level >= unlock.level
    case 'achievement': return progress.unlockedAchievementIds.includes(unlock.achievementId)
  }
}

/**
 * The picture to actually show: the chosen one if it is unlocked, else none.
 *
 * The metadata is client-writable, so a stored id proves nothing about
 * whether it was earned. The check runs at display time against the
 * stores — the same place the awards page reads from — so a picture that
 * was not earned is never drawn, whatever the metadata says.
 *
 * @param id - The stored choice, or null
 * @param progress - The person's level and awards
 */
export function resolveAvatar(id: AvatarId | null, progress: AvatarProgress): AvatarId | null {
  if (id === null) return null
  return isAvatarUnlocked(id, progress) ? id : null
}

/** How many of the catalogue a person has unlocked. */
export function countUnlocked(progress: AvatarProgress): number {
  return AVATAR_CATALOG.filter(d => isAvatarUnlocked(d.id, progress)).length
}

/** The tier of the award behind an achievement picture — for its colour. */
export function achievementAvatarTier(achievementId: AchievementAvatarSource): 'gold' | 'diamond' {
  return getAchievementById(achievementId)?.tier === 'diamond' ? 'diamond' : 'gold'
}
