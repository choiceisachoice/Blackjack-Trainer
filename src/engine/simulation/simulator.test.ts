import { describe, it, expect } from 'vitest';
import {
  normalRandom,
  calculateHouseEdge,
  kellyOptimalBet,
  calculateN0,
  EDGE_PER_TC,
  DEVIATION_TC_BONUS,
} from './math-utils';
import { runSimulation, getBetMultiplier } from './simulator';
import {
  beginnerPreset,
  intermediatePreset,
  professionalPreset,
  worstCasePreset,
  simulationPresets,
} from './presets';
import type { SimulationConfig } from './types';

// ---------------------------------------------------------------------------
// math-utils
// ---------------------------------------------------------------------------

describe('math-utils', () => {
  describe('normalRandom', () => {
    it('generates values with approximately correct mean', () => {
      const samples = 10000;
      let sum = 0;
      for (let i = 0; i < samples; i++) {
        sum += normalRandom(5, 1);
      }
      const mean = sum / samples;
      expect(mean).toBeCloseTo(5, 0); // within ±0.5
    });

    it('generates values with approximately correct standard deviation', () => {
      const samples = 10000;
      const expectedMean = 0;
      const expectedSd = 2;
      const values: number[] = [];
      for (let i = 0; i < samples; i++) {
        values.push(normalRandom(expectedMean, expectedSd));
      }
      const actualMean = values.reduce((a, b) => a + b, 0) / samples;
      const variance = values.reduce((a, b) => a + (b - actualMean) ** 2, 0) / samples;
      const sd = Math.sqrt(variance);
      expect(sd).toBeCloseTo(expectedSd, 0); // within ±0.5
    });

    it('defaults to standard normal (mean=0, sd=1)', () => {
      const samples = 5000;
      let sum = 0;
      for (let i = 0; i < samples; i++) {
        sum += normalRandom();
      }
      const mean = sum / samples;
      expect(Math.abs(mean)).toBeLessThan(0.1);
    });
  });

  describe('calculateHouseEdge', () => {
    it('returns approximately -0.22% for 6-deck S17 DAS surrender 3:2', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: false,
        doubleAfterSplit: true,
        surrenderAllowed: true,
        blackjackPays: 1.5,
        numDecks: 6,
      });
      // Base -0.64% + S17 +0.22% + DAS +0.13% + Surrender +0.07% = -0.22%
      expect(edge).toBeCloseTo(-0.0022, 4);
    });

    it('returns approximately -0.42% for 6-deck H17 DAS surrender 3:2', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: true,
        doubleAfterSplit: true,
        surrenderAllowed: true,
        blackjackPays: 1.5,
        numDecks: 6,
      });
      // Base -0.64% + DAS +0.13% + Surrender +0.07% = -0.44%
      expect(edge).toBeCloseTo(-0.0044, 3);
    });

    it('returns correct edge for 6:5 unfavorable (H17, no DAS, no surrender, 8 deck)', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: true,
        doubleAfterSplit: false,
        surrenderAllowed: false,
        blackjackPays: 1.2,
        numDecks: 8,
      });
      // Base -0.64% + 6:5 -1.36% + 8-deck -0.03% = -2.03%
      expect(edge).toBeCloseTo(-0.0203, 4);
    });

    it('returns base edge with all default rules (H17, no DAS, no surrender, 3:2, 6 deck)', () => {
      const edge = calculateHouseEdge({
        dealerHitsSoft17: true,
        doubleAfterSplit: false,
        surrenderAllowed: false,
        blackjackPays: 1.5,
        numDecks: 6,
      });
      expect(edge).toBeCloseTo(-0.0064, 4);
    });

    it('6:5 blackjack is at least 1.3% worse than 3:2', () => {
      const threeTwo = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.5, numDecks: 6,
      });
      const sixFive = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.2, numDecks: 6,
      });
      expect(threeTwo - sixFive).toBeGreaterThan(0.013);
    });

    it('edge at TC 0 is negative for all standard rule sets', () => {
      // Best standard rules: S17, DAS, Surrender, 3:2, 6-deck
      const bestEdge = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.5, numDecks: 6,
      });
      // Even with best rules, TC=0 edge is negative
      const edgeAtTC0 = bestEdge + 0 * EDGE_PER_TC;
      expect(edgeAtTC0).toBeLessThan(0);
    });

    it('edge at TC +2 is positive for 6-deck S17 DAS surrender', () => {
      const baseEdge = calculateHouseEdge({
        dealerHitsSoft17: false, doubleAfterSplit: true,
        surrenderAllowed: true, blackjackPays: 1.5, numDecks: 6,
      });
      const tcGain = EDGE_PER_TC + DEVIATION_TC_BONUS * 0.95;
      const edgeAtTC2 = baseEdge + 2 * tcGain;
      expect(edgeAtTC2).toBeGreaterThan(0);
    });

    it('handles 2-deck bonus', () => {
      const twoDeck = calculateHouseEdge({
        dealerHitsSoft17: true, doubleAfterSplit: false,
        surrenderAllowed: false, blackjackPays: 1.5, numDecks: 2,
      });
      const sixDeck = calculateHouseEdge({
        dealerHitsSoft17: true, doubleAfterSplit: false,
        surrenderAllowed: false, blackjackPays: 1.5, numDecks: 6,
      });
      expect(twoDeck).toBeGreaterThan(sixDeck);
    });
  });

  describe('kellyOptimalBet', () => {
    it('returns positive value for positive edge', () => {
      const bet = kellyOptimalBet(0.01, 1.3225, 50000);
      expect(bet).toBeGreaterThan(0);
      expect(bet).toBeCloseTo(0.01 / 1.3225 * 50000, 0);
    });

    it('returns 0 for zero edge', () => {
      expect(kellyOptimalBet(0, 1.3225, 50000)).toBe(0);
    });

    it('returns 0 for negative edge', () => {
      expect(kellyOptimalBet(-0.005, 1.3225, 50000)).toBe(0);
    });
  });

  describe('calculateN0', () => {
    it('returns correct N0 for positive EV', () => {
      const n0 = calculateN0(0.5, 50);
      expect(n0).toBe(10000);
    });

    it('returns Infinity for zero EV', () => {
      expect(calculateN0(0, 50)).toBe(Infinity);
    });

    it('returns Infinity for negative EV', () => {
      expect(calculateN0(-0.5, 50)).toBe(Infinity);
    });
  });
});

// ---------------------------------------------------------------------------
// getBetMultiplier
// ---------------------------------------------------------------------------

describe('getBetMultiplier', () => {
  const spread: Record<number, number> = { 1: 2, 2: 4, 3: 8, 5: 16 };

  it('returns matching multiplier for exact TC', () => {
    expect(getBetMultiplier(spread, 3)).toBe(8);
  });

  it('returns highest matching key for TC between keys', () => {
    expect(getBetMultiplier(spread, 4)).toBe(8);
  });

  it('returns max multiplier for TC above highest key', () => {
    expect(getBetMultiplier(spread, 10)).toBe(16);
  });

  it('returns default 1 for TC below all keys', () => {
    expect(getBetMultiplier(spread, -3)).toBe(1);
  });

  it('returns correct multiplier at TC +1', () => {
    expect(getBetMultiplier(spread, 1)).toBe(2);
  });

  it('TC +1 bet multiplier is correctly applied from intermediate preset', () => {
    const mult = getBetMultiplier(intermediatePreset.betSpread, 1);
    expect(mult).toBe(2);
    expect(intermediatePreset.minBet * mult).toBe(100); // $50 × 2 = $100
  });
});

// ---------------------------------------------------------------------------
// runSimulation
// ---------------------------------------------------------------------------

describe('runSimulation', () => {
  const quickConfig: SimulationConfig = {
    bankroll: 10000,
    minBet: 10,
    numShoes: 100,
    numDecks: 6,
    penetration: 0.75,
    betSpread: { 1: 2, 2: 4, 3: 8, 5: 16 },
    countingSystem: 'Hi-Lo',
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
    deviationAccuracy: 0.8,
  };

  it('returns a valid SimulationResult structure', () => {
    const result = runSimulation(quickConfig);
    expect(result).toHaveProperty('totalHands');
    expect(result).toHaveProperty('finalBankroll');
    expect(result).toHaveProperty('peakBankroll');
    expect(result).toHaveProperty('minBankroll');
    expect(result).toHaveProperty('netProfit');
    expect(result).toHaveProperty('hourlyEV');
    expect(result).toHaveProperty('riskOfRuin');
    expect(result).toHaveProperty('n0');
    expect(result).toHaveProperty('houseEdge');
    expect(result).toHaveProperty('bankrollHistory');
    expect(result).toHaveProperty('outcomeDistribution');
    expect(result).toHaveProperty('percentWinningSessions');
    expect(result).toHaveProperty('worstDrawdown');
    expect(result).toHaveProperty('averageBet');
    expect(result).toHaveProperty('kellyOptimalBet');
  });

  it('bankrollHistory starts at hand 0 with starting bankroll', () => {
    const result = runSimulation(quickConfig);
    expect(result.bankrollHistory[0]).toEqual({ hand: 0, bankroll: quickConfig.bankroll });
  });

  it('bankrollHistory is sampled every 50 hands', () => {
    const result = runSimulation(quickConfig);
    const middlePoints = result.bankrollHistory.slice(1, -1);
    for (const point of middlePoints) {
      expect(point.hand % 50).toBe(0);
    }
  });

  it('totalHands is reasonable for given shoe count', () => {
    const result = runSimulation(quickConfig);
    expect(result.totalHands).toBeGreaterThan(quickConfig.numShoes * 20);
    expect(result.totalHands).toBeLessThan(quickConfig.numShoes * 80);
  });

  it('outcomeDistribution percentages sum to approximately 100', () => {
    const result = runSimulation(quickConfig);
    if (result.outcomeDistribution.length > 0) {
      const totalPct = result.outcomeDistribution.reduce((sum, b) => sum + b.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    }
  });

  it('averageBet is between minBet and max spread bet', () => {
    const result = runSimulation(quickConfig);
    const maxMultiplier = Math.max(...Object.values(quickConfig.betSpread));
    expect(result.averageBet).toBeGreaterThanOrEqual(quickConfig.minBet);
    expect(result.averageBet).toBeLessThanOrEqual(quickConfig.minBet * maxMultiplier);
  });

  it('netProfit equals finalBankroll minus starting bankroll', () => {
    const result = runSimulation(quickConfig);
    expect(result.netProfit).toBeCloseTo(result.finalBankroll - quickConfig.bankroll, 1);
  });

  it('peakBankroll is at least the starting bankroll', () => {
    const result = runSimulation(quickConfig);
    expect(result.peakBankroll).toBeGreaterThanOrEqual(quickConfig.bankroll);
  });

  it('riskOfRuin is between 0 and 1', () => {
    const result = runSimulation(quickConfig);
    expect(result.riskOfRuin).toBeGreaterThanOrEqual(0);
    expect(result.riskOfRuin).toBeLessThanOrEqual(1);
  });

  it('handles bankrupt scenario (tiny bankroll)', () => {
    const tinyConfig: SimulationConfig = {
      ...quickConfig,
      bankroll: 5,
      minBet: 10,
      numShoes: 100,
    };
    const result = runSimulation(tinyConfig);
    expect(result.totalHands).toBeGreaterThan(0);
    expect(result.finalBankroll).toBeGreaterThanOrEqual(0);
  });

  it('houseEdge matches calculateHouseEdge', () => {
    const result = runSimulation(quickConfig);
    const expected = calculateHouseEdge(quickConfig);
    expect(result.houseEdge).toBeCloseTo(expected, 6);
  });

  it('percentWinningSessions is between 0 and 100', () => {
    const result = runSimulation(quickConfig);
    expect(result.percentWinningSessions).toBeGreaterThanOrEqual(0);
    expect(result.percentWinningSessions).toBeLessThanOrEqual(100);
  });

  it('worstDrawdown is calculated as peak-to-trough', () => {
    const result = runSimulation(quickConfig);
    // Drawdown must be non-negative (peak - trough)
    expect(result.worstDrawdown).toBeGreaterThanOrEqual(0);
    // It must be at most peakBankroll (if bankroll hit 0)
    expect(result.worstDrawdown).toBeLessThanOrEqual(result.peakBankroll);
    // Drawdown must be at least (peak - final) since peak always precedes end
    const peakToFinal = Math.round((result.peakBankroll - result.finalBankroll) * 100) / 100;
    if (peakToFinal > 0) {
      expect(result.worstDrawdown).toBeGreaterThanOrEqual(peakToFinal);
    }
  });
});

// ---------------------------------------------------------------------------
// presets
// ---------------------------------------------------------------------------

describe('presets', () => {
  it('all presets have valid SimulationConfig structure', () => {
    const requiredKeys: (keyof SimulationConfig)[] = [
      'bankroll', 'minBet', 'numShoes', 'numDecks', 'penetration',
      'betSpread', 'countingSystem', 'dealerHitsSoft17', 'doubleAfterSplit',
      'surrenderAllowed', 'blackjackPays', 'deviationAccuracy',
    ];

    for (const [, preset] of Object.entries(simulationPresets)) {
      for (const key of requiredKeys) {
        expect(preset).toHaveProperty(key);
      }
      expect(preset.bankroll).toBeGreaterThan(0);
      expect(preset.minBet).toBeGreaterThan(0);
      expect(preset.numShoes).toBeGreaterThan(0);
      expect(preset.penetration).toBeGreaterThan(0);
      expect(preset.penetration).toBeLessThanOrEqual(1);
      expect(preset.deviationAccuracy).toBeGreaterThanOrEqual(0);
      expect(preset.deviationAccuracy).toBeLessThanOrEqual(1);
    }
  });

  it('worstCase preset has unfavorable rules', () => {
    expect(worstCasePreset.dealerHitsSoft17).toBe(true);
    expect(worstCasePreset.doubleAfterSplit).toBe(false);
    expect(worstCasePreset.surrenderAllowed).toBe(false);
    expect(worstCasePreset.blackjackPays).toBe(1.2);
    expect(worstCasePreset.numDecks).toBe(8);
  });

  it('professional preset has favorable rules and high deviation accuracy', () => {
    expect(professionalPreset.dealerHitsSoft17).toBe(false);
    expect(professionalPreset.doubleAfterSplit).toBe(true);
    expect(professionalPreset.surrenderAllowed).toBe(true);
    expect(professionalPreset.blackjackPays).toBe(1.5);
    expect(professionalPreset.deviationAccuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('professional preset simulation completes in under 5 seconds', () => {
    const start = performance.now();
    const result = runSimulation(professionalPreset);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
    expect(result.totalHands).toBeGreaterThan(0);
  });

  it('intermediate (serious player) preset has TC+1 multiplier of 2', () => {
    expect(intermediatePreset.betSpread[1]).toBe(2);
    expect(intermediatePreset.minBet).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// input validation
// ---------------------------------------------------------------------------

describe('runSimulation validation', () => {
  const validConfig: SimulationConfig = {
    bankroll: 10000,
    minBet: 10,
    numShoes: 100,
    numDecks: 6,
    penetration: 0.75,
    betSpread: { 1: 2, 2: 4, 3: 8, 5: 16 },
    countingSystem: 'Hi-Lo',
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
    deviationAccuracy: 0.8,
  };

  it('throws on zero bankroll', () => {
    expect(() => runSimulation({ ...validConfig, bankroll: 0 })).toThrow('bankroll must be > 0');
  });

  it('throws on zero minBet', () => {
    expect(() => runSimulation({ ...validConfig, minBet: 0 })).toThrow('minBet must be > 0');
  });

  it('throws on invalid penetration', () => {
    expect(() => runSimulation({ ...validConfig, penetration: 0 })).toThrow('penetration must be between 0 and 1');
    expect(() => runSimulation({ ...validConfig, penetration: 1 })).toThrow('penetration must be between 0 and 1');
  });

  it('simulation with edge case inputs does not throw', () => {
    const edgeConfig: SimulationConfig = {
      ...validConfig,
      bankroll: 100,
      minBet: 1,
      numShoes: 100,
    };
    const result = runSimulation(edgeConfig);
    expect(result.totalHands).toBeGreaterThan(0);
    expect(isFinite(result.hourlyEV)).toBe(true);
    expect(isFinite(result.averageBet)).toBe(true);
  });
});
