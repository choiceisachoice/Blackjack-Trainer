import { BET_RAMP, rampUnits } from '../../engine/betting/bet-ramp'

/**
 * The ladder the drill shows and grades: the engine's one ramp, in the shape
 * this screen has always read it in. It used to be a second copy of the
 * table, and the copy disagreed with the Learn chapter.
 */
export const BET_SPREAD: { minTC: number; maxTC: number; multiplier: number; label: string }[] =
  BET_RAMP.map(step => ({ minTC: step.minTC, maxTC: step.maxTC, multiplier: step.units, label: step.label }))

/** Random source for question generation (kept in one place so it can be stubbed). */
export function rand(): number { return Math.random() }

/** Returns the correct multiplier for a given TC (floors to integer for bracket lookup). */
export function getMultiplier(tc: number): number {
  return rampUnits(tc)
}

/** Returns the correct bet for a given TC at a given table minimum. */
export function getCorrectBet(tc: number, tableMin: number): number {
  return getMultiplier(tc) * tableMin
}

/**
 * Builds a bracket sequence of the given length that covers every bet level
 * as evenly as possible with NO two adjacent entries equal — so the same
 * question/answer never appears twice in a row and the whole ramp is trained.
 */
export function buildBracketSequence(count: number): number[] {
  const levels = BET_SPREAD.map((_, i) => i)
  const counts = levels.map(() => 0)
  const seq: number[] = []
  for (let i = 0; i < count; i++) {
    // Candidates: any bracket except the previous one (guarantees no repeat)…
    let candidates = levels.filter(b => b !== seq[i - 1])
    // …preferring the least-used so the whole ramp is covered evenly.
    const min = Math.min(...candidates.map(b => counts[b]))
    candidates = candidates.filter(b => counts[b] === min)
    const b = candidates[Math.floor(rand() * candidates.length)]
    seq.push(b)
    counts[b]++
  }
  return seq
}
