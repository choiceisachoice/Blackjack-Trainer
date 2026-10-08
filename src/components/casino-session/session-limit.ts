import type { CasinoSessionConfig } from '../../engine/casino-session/types'

/** Which target of the session has been reached, if any. */
export type SessionLimit = 'time' | 'hands' | null

/**
 * Whether the session has reached the target the player set.
 *
 * Reaching it never ends a hand. The table used to quit the moment the clock
 * passed the minutes — mid-hand, with a high count early in the shoe — and
 * throw the player onto the summary. Now reaching the target only *asks*: the
 * hand in play is finished, and before the next bet the player chooses to cash
 * out or keep playing. Keeping on lifts the target for the rest of the session
 * (`keptPlaying`), and an unlimited session never has one.
 *
 * @param config - The session's settings (mode and targets)
 * @param handsPlayed - Hands dealt so far
 * @param elapsedSeconds - Playing time so far (pauses excluded)
 * @param keptPlaying - The player already chose to play on past the target
 * @returns The target reached, or null while there is none to report
 */
export function sessionLimitReached(
  config: Pick<CasinoSessionConfig, 'sessionMode' | 'targetHands' | 'targetMinutes'>,
  handsPlayed: number,
  elapsedSeconds: number,
  keptPlaying: boolean,
): SessionLimit {
  if (keptPlaying) return null
  if (config.sessionMode === 'time' && elapsedSeconds >= config.targetMinutes * 60) return 'time'
  if (config.sessionMode === 'hands' && handsPlayed >= config.targetHands) return 'hands'
  return null
}
