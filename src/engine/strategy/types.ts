/**
 * Conditional strategy action from the Basic Strategy table.
 *
 * - "H"  = Hit
 * - "S"  = Stand
 * - "D"  = Double if allowed, otherwise Hit
 * - "Ds" = Double if allowed, otherwise Stand
 * - "P"  = Split
 * - "Rh" = Surrender if allowed, otherwise Hit
 * - "Rs" = Surrender if allowed, otherwise Stand
 */
export type StrategyAction = 'H' | 'S' | 'D' | 'P' | 'Rh' | 'Rs' | 'Ds'

/**
 * Complete Basic Strategy lookup table.
 *
 * Each sub-table maps a player hand key to a record of dealer upcard → action.
 * - hardTotals keys: "5" through "21"
 * - softTotals keys: "A,2" through "A,9"
 * - pairs keys: "2,2" through "A,A" (10-value cards use "10,10")
 * - Dealer upcard keys: "2" through "10", "A"
 */
export interface StrategyTable {
  hardTotals: Record<string, Record<string, StrategyAction>>
  softTotals: Record<string, Record<string, StrategyAction>>
  pairs: Record<string, Record<string, StrategyAction>>
}
