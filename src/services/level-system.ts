import type { TrainingSessionResult } from './stats-types'

const STORAGE_KEY = 'bjt_level_xp'

/** Tier categories for level groups. */
export type LevelTier = 'beginner' | 'mid' | 'advanced' | 'elite'

/** A single level definition. */
export interface LevelDefinition {
  /** Level number (1-25). */
  level: number
  /** Unique display title. */
  title: string
  /** Total XP needed to reach this level. */
  xpRequired: number
  /** Tier category. */
  tier: LevelTier
  /** Primary color for this level title. */
  color: string
  /** Glow/shadow color for effects. */
  glowColor: string
}

/** All 25 level definitions, ordered by ascending xpRequired. */
export const LEVELS: LevelDefinition[] = [
  // Beginner (grey tones) — levels 1-5
  { level: 1,  title: 'Rookie',                   xpRequired: 0,        tier: 'beginner', color: '#6b7280', glowColor: 'rgba(107,114,128,0.3)' },
  { level: 2,  title: 'Beginner',                  xpRequired: 50,       tier: 'beginner', color: '#9ca3af', glowColor: 'rgba(156,163,175,0.3)' },
  { level: 3,  title: 'Card Player',               xpRequired: 200,      tier: 'beginner', color: '#a8a29e', glowColor: 'rgba(168,162,158,0.3)' },
  { level: 4,  title: 'Table Newcomer',             xpRequired: 500,      tier: 'beginner', color: '#b8b8b8', glowColor: 'rgba(184,184,184,0.3)' },
  { level: 5,  title: 'Lucky Starter',              xpRequired: 1_000,    tier: 'beginner', color: '#d4d4d4', glowColor: 'rgba(212,212,212,0.3)' },

  // Mid (green → blue) — levels 6-10
  { level: 6,  title: 'Card Enthusiast',            xpRequired: 1_800,    tier: 'mid', color: '#22c55e', glowColor: 'rgba(34,197,94,0.3)' },
  { level: 7,  title: 'Chip Collector',             xpRequired: 3_000,    tier: 'mid', color: '#16a34a', glowColor: 'rgba(22,163,74,0.3)' },
  { level: 8,  title: 'Blackjack Player',           xpRequired: 5_000,    tier: 'mid', color: '#0ea5e9', glowColor: 'rgba(14,165,233,0.3)' },
  { level: 9,  title: "Dealer's Favorite",          xpRequired: 8_000,    tier: 'mid', color: '#3b82f6', glowColor: 'rgba(59,130,246,0.3)' },
  { level: 10, title: 'Table Pro',                  xpRequired: 12_000,   tier: 'mid', color: '#2563eb', glowColor: 'rgba(37,99,235,0.4)' },

  // Advanced (purple → gold) — levels 11-17
  { level: 11, title: 'Card Strategist',            xpRequired: 18_000,   tier: 'advanced', color: '#8b5cf6', glowColor: 'rgba(139,92,246,0.3)' },
  { level: 12, title: 'Fortune Seeker',             xpRequired: 26_000,   tier: 'advanced', color: '#7c3aed', glowColor: 'rgba(124,58,237,0.3)' },
  { level: 13, title: 'Blackjack Pro',              xpRequired: 36_000,   tier: 'advanced', color: '#a855f7', glowColor: 'rgba(168,85,247,0.4)' },
  { level: 14, title: 'All-In Champion',            xpRequired: 50_000,   tier: 'advanced', color: '#c084fc', glowColor: 'rgba(192,132,252,0.4)' },
  { level: 15, title: 'Card Counter',               xpRequired: 68_000,   tier: 'advanced', color: '#d4a843', glowColor: 'rgba(212,168,67,0.4)' },
  { level: 16, title: 'VIP Player',                 xpRequired: 90_000,   tier: 'advanced', color: '#eab308', glowColor: 'rgba(234,179,8,0.4)' },
  { level: 17, title: 'High Roller',                xpRequired: 120_000,  tier: 'advanced', color: '#f59e0b', glowColor: 'rgba(245,158,11,0.5)' },

  // Elite (gold → diamond) — levels 18-25
  { level: 18, title: 'Ace Whisperer',              xpRequired: 160_000,  tier: 'elite', color: '#fbbf24', glowColor: 'rgba(251,191,36,0.4)' },
  { level: 19, title: 'House Breaker',              xpRequired: 210_000,  tier: 'elite', color: '#fcd34d', glowColor: 'rgba(252,211,77,0.5)' },
  { level: 20, title: 'Mastermind',                 xpRequired: 275_000,  tier: 'elite', color: '#fde68a', glowColor: 'rgba(253,230,138,0.5)' },
  { level: 21, title: 'Blackjack Master',           xpRequired: 350_000,  tier: 'elite', color: '#ffd700', glowColor: 'rgba(255,215,0,0.5)' },
  { level: 22, title: 'King of the Table',          xpRequired: 450_000,  tier: 'elite', color: '#ffec80', glowColor: 'rgba(255,236,128,0.5)' },
  { level: 23, title: 'Lord of Luck',               xpRequired: 575_000,  tier: 'elite', color: '#e0f2fe', glowColor: 'rgba(224,242,254,0.4)' },
  { level: 24, title: 'Casino Legend',               xpRequired: 750_000,  tier: 'elite', color: '#bae6fd', glowColor: 'rgba(186,230,253,0.5)' },
  { level: 25, title: 'Grandmaster of Blackjack',    xpRequired: 1_000_000, tier: 'elite', color: '#b9f2ff', glowColor: 'rgba(185,242,255,0.6)' },
]

/** XP reward constants for various activities. */
export const XP_REWARDS = {
  sessionBase: 10,
  sessionAccuracyBonus70: 5,
  sessionAccuracyBonus85: 10,
  sessionAccuracyBonus95: 25,
  sessionPerfect100: 50,
  casinoSessionBase: 20,
  casinoSessionProfitPer500: 5,
  handsBonus50: 5,
  handsBonus100: 10,
  achievementBronze: 25,
  achievementSilver: 50,
  achievementGold: 100,
  achievementDiamond: 200,
} as const

/** Result of an addXP operation. */
export interface AddXPResult {
  /** Whether the player leveled up. */
  leveledUp: boolean
  /** The new level (only set if leveledUp). */
  newLevel?: LevelDefinition
  /** The previous level (only set if leveledUp). */
  oldLevel?: LevelDefinition
}

/** Progress toward the next level. */
export interface LevelProgress {
  /** XP earned within the current level. */
  current: number
  /** XP required to reach the next level. */
  required: number
  /** Percentage (0-100) toward the next level. */
  percent: number
}

/**
 * Calculate XP earned from a training session.
 *
 * XP = base + accuracy bonus + hands bonus + casino profit bonus.
 */
export function calculateSessionXP(session: TrainingSessionResult): number {
  let xp = 0

  // Base XP
  if (session.mode === 'casinoSession') {
    xp += XP_REWARDS.casinoSessionBase

    // Profit bonus for casino sessions
    if (session.details.type === 'casinoSession' && session.details.netProfit > 0) {
      xp += Math.floor(session.details.netProfit / 500) * XP_REWARDS.casinoSessionProfitPer500
    }
  } else {
    xp += XP_REWARDS.sessionBase
  }

  // Accuracy bonus (highest applicable tier, not stacked)
  const accPct = Math.round(session.accuracy * 100)
  if (accPct >= 100) {
    xp += XP_REWARDS.sessionPerfect100
  } else if (accPct >= 95) {
    xp += XP_REWARDS.sessionAccuracyBonus95
  } else if (accPct >= 85) {
    xp += XP_REWARDS.sessionAccuracyBonus85
  } else if (accPct >= 70) {
    xp += XP_REWARDS.sessionAccuracyBonus70
  }

  // Hands bonus (stacks)
  if (session.totalQuestions >= 100) {
    xp += XP_REWARDS.handsBonus50 + XP_REWARDS.handsBonus100
  } else if (session.totalQuestions >= 50) {
    xp += XP_REWARDS.handsBonus50
  }

  return xp
}

/**
 * Core level system engine.
 *
 * Tracks total XP, computes the current level, and detects level-ups.
 * Persists total XP to localStorage.
 */
export class LevelSystem {
  private totalXP: number = 0

  constructor() {
    this.load()
  }

  /** Get the current level definition based on total XP. */
  getLevel(): LevelDefinition {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (this.totalXP >= LEVELS[i].xpRequired) {
        return LEVELS[i]
      }
    }
    return LEVELS[0]
  }

  /** Get progress toward the next level. */
  getProgressToNext(): LevelProgress {
    const currentLevel = this.getLevel()
    const nextLevel = LEVELS.find(l => l.level === currentLevel.level + 1)

    if (!nextLevel) {
      return { current: 0, required: 0, percent: 100 }
    }

    const xpInCurrentLevel = this.totalXP - currentLevel.xpRequired
    const xpNeededForNext = nextLevel.xpRequired - currentLevel.xpRequired

    return {
      current: xpInCurrentLevel,
      required: xpNeededForNext,
      percent: Math.floor((xpInCurrentLevel / xpNeededForNext) * 100),
    }
  }

  /**
   * Add XP and detect level-up.
   *
   * @returns Info about whether a level-up occurred.
   */
  addXP(amount: number): AddXPResult {
    const oldLevel = this.getLevel()
    this.totalXP += amount
    this.save()
    const newLevel = this.getLevel()

    if (newLevel.level > oldLevel.level) {
      return { leveledUp: true, newLevel, oldLevel }
    }
    return { leveledUp: false }
  }

  /** Get the total accumulated XP. */
  getTotalXP(): number {
    return this.totalXP
  }

  /** Clear all level data. */
  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY)
    this.totalXP = 0
  }

  /** Reload XP from localStorage. */
  reload(): void {
    this.load()
  }

  // ── Private ─────────────────────────────────────────────

  private save(): void {
    localStorage.setItem(STORAGE_KEY, String(this.totalXP))
  }

  private load(): void {
    const saved = localStorage.getItem(STORAGE_KEY)
    this.totalXP = saved ? (parseInt(saved, 10) || 0) : 0
  }
}

/** Singleton instance for app-wide use. */
export const levelSystem = new LevelSystem()
