import type { Card } from '../shoe/types'
import { Rank, Suit } from '../shoe/types'
import type { CountingSystemConfig } from './types'
import { CountingSystemId } from './types'

/**
 * Hi-Lo counting system (balanced, Level 1).
 * Most popular system. Betting Correlation: 0.97, Playing Efficiency: 0.51.
 */
export const HI_LO: CountingSystemConfig = {
  id: CountingSystemId.HiLo,
  name: 'Hi-Lo',
  level: 1,
  isBalanced: true,
  bettingCorrelation: 0.97,
  playingEfficiency: 0.51,
  values: {
    '2': 1, '3': 1, '4': 1, '5': 1, '6': 1,
    '7': 0, '8': 0, '9': 0,
    '10': -1, 'J': -1, 'Q': -1, 'K': -1, 'A': -1,
  },
  colorDependent: false,
  initialRunningCount: 0,
}

/**
 * KO (Knock-Out) counting system (unbalanced, Level 1).
 * No true count conversion needed. IRC = -4 × (numDecks - 1).
 */
export const KO: CountingSystemConfig = {
  id: CountingSystemId.KO,
  name: 'KO',
  level: 1,
  isBalanced: false,
  bettingCorrelation: 0.98,
  playingEfficiency: 0.55,
  values: {
    '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1,
    '8': 0, '9': 0,
    '10': -1, 'J': -1, 'Q': -1, 'K': -1, 'A': -1,
  },
  colorDependent: false,
  initialRunningCount: 0,
}

/**
 * Omega II counting system (balanced, Level 2).
 * Higher playing efficiency than Hi-Lo.
 */
export const OMEGA_II: CountingSystemConfig = {
  id: CountingSystemId.OmegaII,
  name: 'Omega II',
  level: 2,
  isBalanced: true,
  bettingCorrelation: 0.92,
  playingEfficiency: 0.67,
  values: {
    '2': 1, '3': 1, '4': 2, '5': 2, '6': 2, '7': 1,
    '8': 0, '9': -1,
    '10': -2, 'J': -2, 'Q': -2, 'K': -2, 'A': 0,
  },
  colorDependent: false,
  initialRunningCount: 0,
}

/**
 * Zen Count counting system (balanced, Level 2).
 * Good balance of betting correlation and playing efficiency.
 */
export const ZEN_COUNT: CountingSystemConfig = {
  id: CountingSystemId.ZenCount,
  name: 'Zen Count',
  level: 2,
  isBalanced: true,
  bettingCorrelation: 0.96,
  playingEfficiency: 0.63,
  values: {
    '2': 1, '3': 1, '4': 2, '5': 2, '6': 2, '7': 1,
    '8': 0, '9': 0,
    '10': -2, 'J': -2, 'Q': -2, 'K': -2, 'A': -1,
  },
  colorDependent: false,
  initialRunningCount: 0,
}

/**
 * Wong Halves counting system (balanced, Level 3).
 * Uses fractional values. Highest betting correlation.
 */
export const WONG_HALVES: CountingSystemConfig = {
  id: CountingSystemId.WongHalves,
  name: 'Wong Halves',
  level: 3,
  isBalanced: true,
  bettingCorrelation: 0.99,
  playingEfficiency: 0.56,
  values: {
    '2': 0.5, '3': 1, '4': 1, '5': 1.5, '6': 1, '7': 0.5,
    '8': 0, '9': -0.5,
    '10': -1, 'J': -1, 'Q': -1, 'K': -1, 'A': -1,
  },
  colorDependent: false,
  initialRunningCount: 0,
}

/**
 * Red 7 counting system (unbalanced, Level 1).
 * Like Hi-Lo but red 7s count +1, black 7s count 0.
 * IRC = -2 × numDecks.
 */
export const RED_7: CountingSystemConfig = {
  id: CountingSystemId.Red7,
  name: 'Red 7',
  level: 1,
  isBalanced: false,
  bettingCorrelation: 0.98,
  playingEfficiency: 0.54,
  values: {
    '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 0,
    '8': 0, '9': 0,
    '10': -1, 'J': -1, 'Q': -1, 'K': -1, 'A': -1,
  },
  colorDependent: true,
  initialRunningCount: 0,
}

/** All available counting system configurations. */
const ALL_SYSTEMS: CountingSystemConfig[] = [
  HI_LO, KO, OMEGA_II, ZEN_COUNT, WONG_HALVES, RED_7,
]

/**
 * Returns the count value for a specific card in a given counting system.
 *
 * For the Red 7 system, red 7s (Hearts/Diamonds) count +1 and
 * black 7s (Clubs/Spades) count 0. All other cards use the values table.
 *
 * @param card - The card to evaluate
 * @param system - The counting system configuration
 * @returns The count value for the card
 */
export function getCountValue(card: Card, system: CountingSystemConfig): number {
  if (system.colorDependent && card.rank === Rank.Seven) {
    return (card.suit === Suit.Hearts || card.suit === Suit.Diamonds) ? 1 : 0
  }
  return system.values[card.rank] ?? 0
}

/**
 * Returns all available counting system configurations.
 */
export function getAllSystems(): CountingSystemConfig[] {
  return [...ALL_SYSTEMS]
}

/**
 * Returns the counting system configuration for a given system ID.
 * @throws Error if the system ID is not found
 */
export function getSystemById(id: CountingSystemId): CountingSystemConfig {
  const system = ALL_SYSTEMS.find(s => s.id === id)
  if (!system) {
    throw new Error(`Unknown counting system: ${id}`)
  }
  return system
}

/**
 * Computes the initial running count for a system given the number of decks.
 *
 * - Balanced systems: always 0
 * - KO: -4 × (numDecks - 1)
 * - Red 7: -2 × numDecks
 *
 * @param system - The counting system configuration
 * @param numDecks - Number of decks in the shoe
 * @returns The initial running count
 */
export function getInitialRunningCount(system: CountingSystemConfig, numDecks: number): number {
  if (system.isBalanced) {
    return 0
  }
  switch (system.id) {
    case CountingSystemId.KO:
      return -4 * (numDecks - 1) || 0
    case CountingSystemId.Red7:
      return -2 * numDecks
    default:
      return 0
  }
}
