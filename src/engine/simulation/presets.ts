import type { SimulationConfig } from './types';

/** Beginner: Small bankroll, conservative spread, learning deviations */
export const beginnerPreset: SimulationConfig = {
  bankroll: 5000,
  minBet: 10,
  numShoes: 1000,
  numDecks: 6,
  penetration: 0.75,
  betSpread: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  countingSystem: 'Hi-Lo',
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  surrenderAllowed: false,
  blackjackPays: 1.5,
  deviationAccuracy: 0.5,
  countingAccuracy: 0.80,
};

/** Intermediate: Medium bankroll, wider spread, better deviation play */
export const intermediatePreset: SimulationConfig = {
  bankroll: 20000,
  minBet: 50,
  numShoes: 5000,
  numDecks: 6,
  penetration: 0.75,
  betSpread: { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
  countingSystem: 'Hi-Lo',
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  surrenderAllowed: true,
  blackjackPays: 1.5,
  deviationAccuracy: 0.85,
  countingAccuracy: 0.90,
};

/** Professional: Large bankroll, aggressive spread, near-perfect deviations */
export const professionalPreset: SimulationConfig = {
  bankroll: 100000,
  minBet: 100,
  numShoes: 10000,
  numDecks: 6,
  penetration: 0.80,
  betSpread: { 1: 2, 2: 4, 3: 8, 4: 12, 5: 16 },
  countingSystem: 'Hi-Lo',
  dealerHitsSoft17: false,
  doubleAfterSplit: true,
  surrenderAllowed: true,
  blackjackPays: 1.5,
  deviationAccuracy: 0.95,
  countingAccuracy: 0.95,
};

/** Worst Case: Hostile rules, shallow penetration, 8 decks, 6:5 BJ */
export const worstCasePreset: SimulationConfig = {
  bankroll: 10000,
  minBet: 15,
  numShoes: 5000,
  numDecks: 8,
  penetration: 0.65,
  betSpread: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  countingSystem: 'Hi-Lo',
  dealerHitsSoft17: true,
  doubleAfterSplit: false,
  surrenderAllowed: false,
  blackjackPays: 1.2,
  deviationAccuracy: 0.5,
  countingAccuracy: 0.85,
};

/** All simulation presets indexed by name */
export const simulationPresets = {
  beginner: beginnerPreset,
  intermediate: intermediatePreset,
  professional: professionalPreset,
  worstCase: worstCasePreset,
} as const;

/** Valid preset names */
export type PresetName = keyof typeof simulationPresets;
