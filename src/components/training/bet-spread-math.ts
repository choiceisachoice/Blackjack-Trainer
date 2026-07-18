/**
 * Bet spread ladder: True-Count bracket → bet multiplier.
 * A 1–16 spread is the professional standard for Hi-Lo. The dollar amounts
 * are derived per question from that table's minimum bet (the "unit").
 */
export const BET_SPREAD: { minTC: number; maxTC: number; multiplier: number; label: string }[] = [
  { minTC: -Infinity, maxTC: 0, multiplier: 1, label: 'TC ≤ 0' },
  { minTC: 1, maxTC: 1, multiplier: 2, label: 'TC +1' },
  { minTC: 2, maxTC: 2, multiplier: 4, label: 'TC +2' },
  { minTC: 3, maxTC: 3, multiplier: 8, label: 'TC +3' },
  { minTC: 4, maxTC: 4, multiplier: 12, label: 'TC +4' },
  { minTC: 5, maxTC: Infinity, multiplier: 16, label: 'TC ≥ +5' },
]

/** Random source for question generation (kept in one place so it can be stubbed). */
export function rand(): number { return Math.random() }

/** Returns the correct multiplier for a given TC (floors to integer for bracket lookup). */
export function getMultiplier(tc: number): number {
  const intTC = Math.floor(tc)
  for (const row of BET_SPREAD) {
    if (intTC >= row.minTC && intTC <= row.maxTC) return row.multiplier
  }
  return 1
}

/** Returns the correct bet for a given TC at a given table minimum. */
export function getCorrectBet(tc: number, tableMin: number): number {
  return getMultiplier(tc) * tableMin
}

/**
 * Builds a bracket sequence of the given length that covers all six bet levels
 * as evenly as possible with NO two adjacent entries equal — so the same
 * question/answer never appears twice in a row and the whole ramp is trained.
 */
export function buildBracketSequence(count: number): number[] {
  const counts = [0, 0, 0, 0, 0, 0]
  const seq: number[] = []
  for (let i = 0; i < count; i++) {
    // Candidates: any bracket except the previous one (guarantees no repeat)…
    let candidates = [0, 1, 2, 3, 4, 5].filter(b => b !== seq[i - 1])
    // …preferring the least-used so the whole ramp is covered evenly.
    const min = Math.min(...candidates.map(b => counts[b]))
    candidates = candidates.filter(b => counts[b] === min)
    const b = candidates[Math.floor(rand() * candidates.length)]
    seq.push(b)
    counts[b]++
  }
  return seq
}
