import type { StrategyAction, StrategyTable } from './types'

/**
 * Creates a row mapping dealer upcards (2, 3, 4, 5, 6, 7, 8, 9, 10, A)
 * to strategy actions.
 */
function row(
  vs2: StrategyAction, vs3: StrategyAction, vs4: StrategyAction,
  vs5: StrategyAction, vs6: StrategyAction, vs7: StrategyAction,
  vs8: StrategyAction, vs9: StrategyAction, vs10: StrategyAction,
  vsA: StrategyAction
): Record<string, StrategyAction> {
  return {
    '2': vs2, '3': vs3, '4': vs4, '5': vs5, '6': vs6,
    '7': vs7, '8': vs8, '9': vs9, '10': vs10, 'A': vsA,
  }
}

/**
 * Basic Strategy table for **S17** (Dealer Stands on Soft 17).
 * 6-deck, DAS allowed, late surrender.
 * Source: Wizard of Odds standard.
 */
export const S17_STRATEGY: StrategyTable = {
  hardTotals: {
    '5':  row('H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'),
    '6':  row('H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'),
    '7':  row('H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'),
    '8':  row('H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'),
    '9':  row('H', 'D', 'D', 'D', 'D', 'H', 'H', 'H', 'H', 'H'),
    '10': row('D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'),
    '11': row('D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D'),
    '12': row('H', 'H', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'),
    '13': row('S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'),
    '14': row('S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'H', 'H'),
    '15': row('S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh', 'H'),
    '16': row('S', 'S', 'S', 'S', 'S', 'H', 'H', 'Rh', 'Rh', 'Rh'),
    '17': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
    '18': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
    '19': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
    '20': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
    '21': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
  },
  softTotals: {
    'A,2': row('H',  'H',  'H',  'D',  'D',  'H', 'H', 'H', 'H', 'H'),
    'A,3': row('H',  'H',  'H',  'D',  'D',  'H', 'H', 'H', 'H', 'H'),
    'A,4': row('H',  'H',  'D',  'D',  'D',  'H', 'H', 'H', 'H', 'H'),
    'A,5': row('H',  'H',  'D',  'D',  'D',  'H', 'H', 'H', 'H', 'H'),
    'A,6': row('H',  'D',  'D',  'D',  'D',  'H', 'H', 'H', 'H', 'H'),
    'A,7': row('Ds', 'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'),
    'A,8': row('S',  'S',  'S',  'S',  'Ds', 'S', 'S', 'S', 'S', 'S'),
    'A,9': row('S',  'S',  'S',  'S',  'S',  'S', 'S', 'S', 'S', 'S'),
  },
  pairs: {
    '2,2':   row('P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'),
    '3,3':   row('P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'),
    '4,4':   row('H', 'H', 'H', 'P', 'P', 'H', 'H', 'H', 'H', 'H'),
    '5,5':   row('D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H', 'H'),
    '6,6':   row('P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H', 'H'),
    '7,7':   row('P', 'P', 'P', 'P', 'P', 'P', 'H', 'H', 'H', 'H'),
    '8,8':   row('P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'),
    '9,9':   row('P', 'P', 'P', 'P', 'P', 'S', 'P', 'P', 'S', 'S'),
    '10,10': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S'),
    'A,A':   row('P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'),
  },
}

/**
 * Basic Strategy table for **H17** (Dealer Hits on Soft 17).
 * 6-deck, DAS allowed, late surrender.
 *
 * **6 cells differ from S17 → H17:**
 *
 * | Hand          | Dealer | S17 | H17 | Reason                                  |
 * |---------------|--------|-----|-----|-----------------------------------------|
 * | Hard 11       | A      | D   | H   | Dealer Ace stronger → double less value  |
 * | Hard 15       | A      | H   | Rh  | Dealer Ace stronger → surrender better   |
 * | Hard 17       | A      | S   | Rs  | Dealer Ace stronger → surrender better   |
 * | Soft 17 (A,6) | 2      | H   | D   | Dealer 2 bustier with H17 → double up   |
 * | Soft 18 (A,7) | 2      | Ds  | S   | Marginal double no longer worth the risk |
 * | Soft 19 (A,8) | 6      | Ds  | S   | Dealer 6 less weak with H17 → just stand |
 */
export const H17_STRATEGY: StrategyTable = {
  hardTotals: {
    ...S17_STRATEGY.hardTotals,
    '11': row('D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'H'),
    '15': row('S', 'S', 'S', 'S', 'S', 'H', 'H', 'H', 'Rh', 'Rh'),
    '17': row('S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'S', 'Rs'),
  },
  softTotals: {
    ...S17_STRATEGY.softTotals,
    'A,6': row('D',  'D',  'D',  'D',  'D',  'H', 'H', 'H', 'H', 'H'),
    'A,7': row('S',  'Ds', 'Ds', 'Ds', 'Ds', 'S', 'S', 'H', 'H', 'H'),
    'A,8': row('S',  'S',  'S',  'S',  'S',  'S', 'S', 'S', 'S', 'S'),
  },
  pairs: {
    ...S17_STRATEGY.pairs,
  },
}
