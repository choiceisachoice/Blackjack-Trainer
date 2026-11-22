import type { ComponentType } from 'react'
import type { TrialRoundProps } from '../trial/TrialRound'

/** The trial round, once its code is here. */
export type TrialRoundComponent = ComponentType<TrialRoundProps>

let loaded: TrialRoundComponent | null = null
let pending: Promise<TrialRoundComponent | null> | null = null

/**
 * Fetch the trial round's code ahead of the click that needs it.
 *
 * The round is the real trainer (`TrialRound` → `DeviationTraining`, the
 * engine's strategy tables, the session recording). None of that belongs in
 * the landing's chunk, which every visitor waits for and most never play
 * with. It is fetched when the play section nears the screen or a visitor
 * shows intent (the hero's button under the pointer), and kept for the
 * page's life.
 *
 * @returns The component, or null when the chunk could not be loaded (the
 *   next call tries again)
 */
export function preloadTrialRound(): Promise<TrialRoundComponent | null> {
  pending ??= import('../trial/TrialRound').then(
    mod => { loaded = mod.TrialRound; return loaded },
    () => { pending = null; return null },
  )
  return pending
}

/**
 * The round's component if it has been fetched already, without waiting.
 *
 * Lets the section render the round in its first commit when the code is in
 * hand (a visitor who comes back to the landing), instead of an intro that
 * is replaced a moment later.
 */
export function loadedTrialRound(): TrialRoundComponent | null {
  return loaded
}
